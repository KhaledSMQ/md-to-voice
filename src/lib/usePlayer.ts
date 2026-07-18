import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { TTSClient, type TTSResult } from './tts/ttsClient'
import type { Device, ProgressEvent, VoiceInfo } from './tts/types'
import type { Chunk } from './chunker'
import { activeWordInChunk, chunkWordEndTimes, wordStartTime } from './timing'
import { playbackPlanKey } from './playbackPlanKey'

export type PlayerStatus =
  | 'idle'
  | 'loading-model'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'finished'
  | 'error'

export type LoadProgress = {
  file?: string
  ratio?: number
  status?: string
}

type Options = {
  /** Document identity — included in the reset fingerprint so identical markdown across docs still resets. */
  documentId: string
  chunks: Chunk[]
  voice: string
  speed: number
  volume: number
  onActiveWord: (wIdx: number) => void
  onChunkChange?: (chunkIdx: number) => void
  /**
   * After chunks are (re)built, set the starting chunk to the one that contains
   * this global word index (per-document resume). null = from first chunk.
   */
  resumeAtWordIdx?: number | null
}

const PREFETCH_DEPTH = 2

/** Minimal silent WAV — unlocks HTMLMediaElement during a user gesture on iOS/iPadOS. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

function isAutoplayBlocked(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const name = (err as Error & { name?: string }).name
  return (
    name === 'NotAllowedError' ||
    /notallowed|user.?gesture|interact|autoplay/i.test(err.message)
  )
}

function autoplayBlockedMessage(): string {
  return 'Playback was blocked on this device. Tap Play again to start audio.'
}

export type ActiveWordStore = {
  subscribeActiveWord: (onStoreChange: () => void) => () => void
  getActiveWord: () => number
}

/** Subscribe a leaf component to per-word playback progress without re-rendering the player owner. */
export function useActiveWordIdx(store: ActiveWordStore): number {
  return useSyncExternalStore(store.subscribeActiveWord, store.getActiveWord, store.getActiveWord)
}

export function usePlayer({
  documentId,
  chunks,
  voice,
  speed,
  volume,
  onActiveWord,
  onChunkChange,
  resumeAtWordIdx = null,
}: Options) {
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [device, setDevice] = useState<Device | null>(null)
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  const [progress, setProgress] = useState<LoadProgress>({})
  const [error, setError] = useState<string | null>(null)
  const [currentChunkIdx, setCurrentChunkIdx] = useState<number>(-1)
  /** True while waiting on TTS for the chunk about to play. */
  const [buffering, setBuffering] = useState(false)
  /** Bumps when a chunk finishes generating — drives the “voice ready” flash. */
  const [chunkReadyTick, setChunkReadyTick] = useState(0)

  const clientRef = useRef<TTSClient | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  /** captureStream() tracks must be stopped or they keep the element alive. */
  const captureStreamRef = useRef<MediaStream | null>(null)
  /** Once unlocked during a user gesture, keep the same element for later play(). */
  const audioUnlockedRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  /** Chunk end backup timer — must be cleared on stop/seek/unmount. */
  const backupTimerRef = useRef<number>(0)
  const cursorRef = useRef<number>(0)
  const prefetchRef = useRef<Map<number, Promise<TTSResult>>>(new Map())
  const playRequestedRef = useRef<boolean>(false)
  const lastEmittedWordRef = useRef<number>(-1)
  const playTokenRef = useRef(0)
  const playChunkRef = useRef<(chunkIdx: number, startWordIdx?: number) => Promise<void>>(
    async () => {},
  )
  /** Restart word-highlight + end-detection after pause/resume. */
  const resumeTickRef = useRef<(() => void) | null>(null)
  const mountedRef = useRef(true)
  const activeWordRef = useRef(-1)
  const activeWordListenersRef = useRef(new Set<() => void>())
  const statusRef = useRef(status)
  statusRef.current = status
  const progressTimerRef = useRef(0)
  const pendingProgressRef = useRef<LoadProgress | null>(null)

  const optionsRef = useRef({
    voice,
    speed,
    volume,
    onActiveWord,
    onChunkChange,
    chunks,
    resumeAtWordIdx,
  })
  useEffect(() => {
    optionsRef.current = {
      voice,
      speed,
      volume,
      onActiveWord,
      onChunkChange,
      chunks,
      resumeAtWordIdx,
    }
  }, [voice, speed, volume, onActiveWord, onChunkChange, chunks, resumeAtWordIdx])

  const subscribeActiveWord = useCallback((onStoreChange: () => void): (() => void) => {
    activeWordListenersRef.current.add(onStoreChange)
    return () => {
      activeWordListenersRef.current.delete(onStoreChange)
    }
  }, [])

  const getActiveWord = useCallback((): number => activeWordRef.current, [])

  const setActiveWord = useCallback((globalIdx: number): void => {
    if (activeWordRef.current === globalIdx) return
    activeWordRef.current = globalIdx
    for (const listener of activeWordListenersRef.current) listener()
  }, [])

  const safeSetStatus = useCallback((next: PlayerStatus | ((s: PlayerStatus) => PlayerStatus)): void => {
    if (!mountedRef.current) return
    setStatus(next)
  }, [])

  const safeSetError = useCallback((msg: string | null): void => {
    if (!mountedRef.current) return
    setError(msg)
  }, [])

  const safeSetCurrentChunkIdx = useCallback((idx: number): void => {
    if (!mountedRef.current) return
    setCurrentChunkIdx(idx)
  }, [])

  const safeSetBuffering = useCallback((next: boolean): void => {
    if (!mountedRef.current) return
    setBuffering(next)
  }, [])

  const markChunkReady = useCallback((): void => {
    if (!mountedRef.current) return
    setBuffering(false)
    setChunkReadyTick((n) => n + 1)
  }, [])

  const disconnectSource = useCallback((): void => {
    sourceRef.current?.disconnect()
    sourceRef.current = null
    const stream = captureStreamRef.current
    if (stream) {
      for (const track of stream.getTracks()) track.stop()
      captureStreamRef.current = null
    }
  }, [])

  /**
   * One persistent <audio> for the session. iOS/iPadOS only allows later
   * programmatic play() on an element that was unlocked during a user gesture —
   * creating a fresh Audio() after model load always fails there.
   */
  const ensureAudioElement = useCallback((): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current
    const audio = new Audio()
    audio.preload = 'auto'
    audio.setAttribute('playsinline', 'true')
    audio.setAttribute('webkit-playsinline', 'true')
    ;(audio as HTMLAudioElement & { playsInline: boolean }).playsInline = true
    audioRef.current = audio
    return audio
  }, [])

  /**
   * Must run in the same turn as the tap/click (before await init / TTS).
   * Plays a silent clip + resumes AudioContext so Safari keeps permission.
   */
  const unlockAudio = useCallback(async (): Promise<void> => {
    const audio = ensureAudioElement()
    if (!audioCtxRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctx) {
        const ctx = new Ctx()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.78
        audioCtxRef.current = ctx
        analyserRef.current = analyser
      }
    }
    if (audioCtxRef.current?.state === 'suspended') {
      try {
        await audioCtxRef.current.resume()
      } catch {
        // Ignore — element unlock below is the critical path for speech.
      }
    }
    if (audioUnlockedRef.current) return

    const prevVolume = audio.volume
    try {
      audio.volume = 0
      audio.src = SILENT_WAV
      await audio.play()
      audio.pause()
      audioUnlockedRef.current = true
    } catch {
      // Desktop may already allow play; keep going and surface errors on real play.
    } finally {
      audio.removeAttribute('src')
      audio.load()
      audio.volume = prevVolume
    }
  }, [ensureAudioElement])

  const clearBackupTimer = useCallback((): void => {
    if (backupTimerRef.current) {
      window.clearTimeout(backupTimerRef.current)
      backupTimerRef.current = 0
    }
  }, [])

  /**
   * Tap the playing element for the visualiser WITHOUT createMediaElementSource.
   * MediaElementSourceNode steals the element's output and often suppresses
   * `ended`, which stalled multi-chunk playback. captureStream keeps normal
   * element playback (and reliable ended) while still feeding an AnalyserNode.
   */
  const connectAnalyserTap = useCallback(
    async (audio: HTMLAudioElement): Promise<void> => {
      disconnectSource()
      if (!audioCtxRef.current) {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctx) return
        const ctx = new Ctx()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.78
        // Analyser only — do not connect to destination (element already outputs).
        audioCtxRef.current = ctx
        analyserRef.current = analyser
      }
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume()
      }
      const ctx = audioCtxRef.current
      const analyser = analyserRef.current
      if (!ctx || !analyser) return
      const capture = (
        audio as HTMLAudioElement & { captureStream?: () => MediaStream }
      ).captureStream
      if (typeof capture !== 'function') return
      try {
        const stream = capture.call(audio)
        const source = ctx.createMediaStreamSource(stream)
        source.connect(analyser)
        sourceRef.current = source
        captureStreamRef.current = stream
      } catch {
        // captureStream can throw if the element isn't ready — viz just stays idle.
      }
    },
    [disconnectSource],
  )

  useEffect(() => {
    const a = audioRef.current
    if (a) a.volume = volume
  }, [volume])

  const stopRaf = useCallback((): void => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }, [])

  const releaseAudio = useCallback((): void => {
    stopRaf()
    clearBackupTimer()
    resumeTickRef.current = null
    disconnectSource()
    const a = audioRef.current
    if (a) {
      a.onended = null
      a.onpause = null
      a.onerror = null
      a.pause()
      a.removeAttribute('src')
      a.load()
      // Keep the element — iOS unlock is tied to this instance.
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
  }, [clearBackupTimer, disconnectSource, stopRaf])

  const resetPlayback = useCallback((): void => {
    playRequestedRef.current = false
    playTokenRef.current += 1
    releaseAudio()
    prefetchRef.current.clear()
    clientRef.current?.cancel()
    cursorRef.current = 0
    lastEmittedWordRef.current = -1
    setActiveWord(-1)
    safeSetCurrentChunkIdx(-1)
    safeSetBuffering(false)
    safeSetStatus((s) => (s === 'idle' || s === 'loading-model' || s === 'error' ? s : 'ready'))
  }, [releaseAudio, setActiveWord, safeSetCurrentChunkIdx, safeSetBuffering, safeSetStatus])

  // Stable fingerprint so we only reset when the TTS plan or document actually changes.
  const chunksKey = playbackPlanKey(documentId, chunks)
  const chunksKeyRef = useRef(chunksKey)

  useEffect(() => {
    if (chunksKeyRef.current === chunksKey) return
    chunksKeyRef.current = chunksKey
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      resetPlayback()
      optionsRef.current.onActiveWord(-1)
    })
    return () => {
      cancelled = true
    }
  }, [chunksKey, resetPlayback])

  useEffect(() => {
    if (chunks.length === 0) {
      cursorRef.current = 0
      return
    }
    if (resumeAtWordIdx == null || resumeAtWordIdx < 0) {
      cursorRef.current = 0
      return
    }
    const all = chunks
    const lastChunk = all[all.length - 1]
    const endWords = lastChunk.words
    const maxW = endWords.length > 0 ? endWords[endWords.length - 1].idx : 0
    const w = Math.min(resumeAtWordIdx, maxW)
    const chunkIdx = all.findIndex((c) => w >= c.startWordIdx && w < c.endWordIdx)
    cursorRef.current = chunkIdx >= 0 ? chunkIdx : 0
  }, [chunksKey, chunks, resumeAtWordIdx])

  // Voice/speed change: drop stale prefetch; restart current chunk so audio matches UI.
  // Deps are voice/speed only — releaseAudio/playChunk accessed via refs so identity churn
  // cannot interrupt an in-progress clip.
  const releaseAudioRef = useRef(releaseAudio)
  releaseAudioRef.current = releaseAudio
  useEffect(() => {
    prefetchRef.current.clear()
    clientRef.current?.cancel()
    const s = statusRef.current
    if (s !== 'playing' && s !== 'paused') return
    const idx = cursorRef.current
    if (idx < 0) return
    playTokenRef.current += 1
    releaseAudioRef.current()
    lastEmittedWordRef.current = -1
    if (s === 'paused') {
      // Keep paused — next Play regenerates with the new voice/speed (no src left to resume).
      playRequestedRef.current = false
      return
    }
    playRequestedRef.current = true
    if (mountedRef.current) setStatus('playing')
    void playChunkRef.current(idx)
  }, [voice, speed])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      playRequestedRef.current = false
      playTokenRef.current += 1
      if (progressTimerRef.current) {
        window.clearTimeout(progressTimerRef.current)
        progressTimerRef.current = 0
      }
      pendingProgressRef.current = null
      releaseAudio()
      audioRef.current = null
      audioUnlockedRef.current = false
      prefetchRef.current.clear()
      clientRef.current?.cancel()
      void audioCtxRef.current?.close()
      audioCtxRef.current = null
      analyserRef.current = null
      sourceRef.current = null
      clientRef.current?.destroy()
      clientRef.current = null
      activeWordListenersRef.current.clear()
    }
  }, [releaseAudio])

  const ensureClient = useCallback((): TTSClient => {
    if (clientRef.current) return clientRef.current
    const client = new TTSClient()
    client.onProgress((e: ProgressEvent) => {
      if (!mountedRef.current) return
      const ratio =
        typeof e.progress === 'number'
          ? e.progress > 1
            ? e.progress / 100
            : e.progress
          : undefined
      pendingProgressRef.current = { file: e.file, ratio, status: e.status }
      // Throttle progress writes — worker fires many events during model load.
      if (progressTimerRef.current) return
      progressTimerRef.current = window.setTimeout(() => {
        progressTimerRef.current = 0
        if (!mountedRef.current) return
        const next = pendingProgressRef.current
        pendingProgressRef.current = null
        if (next) setProgress(next)
      }, 100)
    })
    clientRef.current = client
    return client
  }, [])

  const init = useCallback(async (): Promise<void> => {
    if (status === 'ready' || status === 'playing' || status === 'paused' || status === 'loading-model') return
    safeSetStatus('loading-model')
    safeSetError(null)
    try {
      const client = ensureClient()
      const info = await client.init()
      if (!mountedRef.current) return
      setDevice(info.device)
      setVoices(info.voices)
      safeSetStatus('ready')
    } catch (err) {
      if (!mountedRef.current) return
      safeSetError(err instanceof Error ? err.message : String(err))
      safeSetStatus('error')
      clientRef.current?.destroy()
      clientRef.current = null
    }
  }, [status, ensureClient, safeSetStatus, safeSetError])

  const requestChunk = useCallback(
    (chunkIdx: number): Promise<TTSResult> | null => {
      const all = optionsRef.current.chunks
      if (chunkIdx < 0 || chunkIdx >= all.length) return null
      const cached = prefetchRef.current.get(chunkIdx)
      if (cached) return cached
      const client = ensureClient()
      const p = client.generate(
        all[chunkIdx].text,
        optionsRef.current.voice,
        optionsRef.current.speed,
      )
      prefetchRef.current.set(chunkIdx, p)
      p.catch(() => prefetchRef.current.delete(chunkIdx))
      return p
    },
    [ensureClient],
  )

  const prefetchAhead = useCallback(
    (fromIdx: number): void => {
      for (let i = 1; i <= PREFETCH_DEPTH; i++) {
        requestChunk(fromIdx + i)
      }
    },
    [requestChunk],
  )

  const prunePrefetchCache = useCallback((keepFromIdx: number): void => {
    for (const k of Array.from(prefetchRef.current.keys())) {
      if (k < keepFromIdx || k > keepFromIdx + PREFETCH_DEPTH) {
        prefetchRef.current.delete(k)
      }
    }
  }, [])

  const emitActive = useCallback(
    (globalIdx: number): void => {
      if (lastEmittedWordRef.current === globalIdx) return
      lastEmittedWordRef.current = globalIdx
      setActiveWord(globalIdx)
      optionsRef.current.onActiveWord(globalIdx)
    },
    [setActiveWord],
  )

  const playChunk = useCallback(
    async (chunkIdx: number, startWordIdx?: number): Promise<void> => {
      const token = playTokenRef.current
      const all = optionsRef.current.chunks
      if (chunkIdx >= all.length) {
        releaseAudio()
        safeSetStatus('finished')
        safeSetCurrentChunkIdx(-1)
        cursorRef.current = 0
        emitActive(-1)
        return
      }

      cursorRef.current = chunkIdx
      safeSetCurrentChunkIdx(chunkIdx)
      optionsRef.current.onChunkChange?.(chunkIdx)
      prunePrefetchCache(chunkIdx)

      let result: TTSResult
      try {
        const p = requestChunk(chunkIdx)
        if (!p) return
        safeSetBuffering(true)
        result = await p
      } catch (err) {
        if ((err as Error).message === 'cancelled') {
          safeSetBuffering(false)
          return
        }
        if (playTokenRef.current !== token || !mountedRef.current) return
        safeSetBuffering(false)
        safeSetError((err as Error).message)
        safeSetStatus('error')
        return
      }

      if (playTokenRef.current !== token || !playRequestedRef.current || !mountedRef.current) {
        safeSetBuffering(false)
        return
      }

      markChunkReady()
      prefetchAhead(chunkIdx)

      // Reuse the unlocked <audio> element. Fresh Audio() after model load is
      // blocked on iOS/iPadOS once the original tap gesture has expired.
      disconnectSource()
      stopRaf()
      clearBackupTimer()
      const audio = ensureAudioElement()
      audio.onended = null
      audio.onpause = null
      audio.onerror = null
      audio.pause()
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current)
        audioUrlRef.current = null
      }
      const url = URL.createObjectURL(result.blob)
      audioUrlRef.current = url
      audio.volume = optionsRef.current.volume
      audio.src = url

      if (playTokenRef.current !== token || !playRequestedRef.current || !mountedRef.current) {
        releaseAudio()
        return
      }

      const chunk = all[chunkIdx]!
      const ends = chunkWordEndTimes(chunk, result.durationSec)
      // Prefer TTS-reported duration — blob audio.duration is often NaN/Infinity.
      const clipDuration = Math.max(0.05, result.durationSec)

      if (
        startWordIdx != null &&
        startWordIdx >= chunk.startWordIdx &&
        startWordIdx < chunk.endWordIdx
      ) {
        const localIdx = startWordIdx - chunk.startWordIdx
        const t0 = wordStartTime(ends, localIdx)
        try {
          audio.currentTime = Math.min(Math.max(0, t0), Math.max(0, clipDuration - 0.05))
        } catch {
          // Some browsers reject currentTime before metadata; ignore.
        }
        emitActive(startWordIdx)
      }

      let advanced = false

      const scheduleBackup = (remainingSec: number) => {
        clearBackupTimer()
        const backupMs = Math.max(400, (remainingSec + 0.5) * 1000)
        backupTimerRef.current = window.setTimeout(() => {
          backupTimerRef.current = 0
          if (audioRef.current !== audio || playTokenRef.current !== token) return
          if (!playRequestedRef.current || advanced) return
          advanceToNext()
        }, backupMs)
      }

      const advanceToNext = () => {
        if (advanced) return
        if (audioRef.current !== audio || playTokenRef.current !== token) return
        if (!playRequestedRef.current) return
        advanced = true
        stopRaf()
        clearBackupTimer()
        resumeTickRef.current = null
        void playChunkRef.current(chunkIdx + 1)
      }

      const tick = () => {
        if (audioRef.current !== audio || playTokenRef.current !== token) return
        if (audio.paused && !audio.ended) return
        if (audio.ended || audio.currentTime >= clipDuration - 0.05) {
          advanceToNext()
          return
        }
        const t = audio.currentTime
        const localIdx = activeWordInChunk(ends, t)
        const globalIdx =
          localIdx >= chunk.words.length
            ? chunk.words[chunk.words.length - 1]!.idx
            : chunk.words[localIdx]!.idx
        emitActive(globalIdx)
        rafRef.current = requestAnimationFrame(tick)
      }

      resumeTickRef.current = () => {
        if (advanced) return
        if (audioRef.current !== audio || playTokenRef.current !== token) return
        const remaining = Math.max(0.05, clipDuration - audio.currentTime)
        scheduleBackup(remaining)
        stopRaf()
        rafRef.current = requestAnimationFrame(tick)
      }

      const remainingAtStart = Math.max(0.05, clipDuration - (audio.currentTime || 0))
      scheduleBackup(remainingAtStart)

      audio.onended = () => {
        advanceToNext()
      }

      audio.onerror = () => {
        if (advanced || playTokenRef.current !== token) return
        // Skip a broken clip rather than freezing the whole document.
        advanceToNext()
      }

      try {
        await audio.play()
        if (playTokenRef.current !== token || !playRequestedRef.current || !mountedRef.current) {
          releaseAudio()
          return
        }
        safeSetStatus('playing')
        void connectAnalyserTap(audio)
        stopRaf()
        rafRef.current = requestAnimationFrame(tick)
      } catch (err) {
        clearBackupTimer()
        if (playTokenRef.current !== token || !mountedRef.current) return
        if (isAutoplayBlocked(err)) {
          audioUnlockedRef.current = false
          playRequestedRef.current = false
          safeSetError(autoplayBlockedMessage())
          safeSetStatus('ready')
          return
        }
        safeSetError((err as Error).message)
        safeSetStatus('error')
      }
    },
    [
      requestChunk,
      prunePrefetchCache,
      prefetchAhead,
      releaseAudio,
      ensureAudioElement,
      emitActive,
      connectAnalyserTap,
      stopRaf,
      clearBackupTimer,
      disconnectSource,
      safeSetStatus,
      safeSetError,
      safeSetCurrentChunkIdx,
      safeSetBuffering,
      markChunkReady,
    ],
  )

  useEffect(() => {
    playChunkRef.current = playChunk
  }, [playChunk])

  const play = useCallback(async (): Promise<void> => {
    safeSetError(null)
    if (status === 'paused' && audioRef.current?.src) {
      playRequestedRef.current = true
      try {
        if (audioCtxRef.current?.state === 'suspended') {
          await audioCtxRef.current.resume()
        }
        await audioRef.current.play()
        if (!mountedRef.current) return
        audioUnlockedRef.current = true
        safeSetStatus('playing')
        // Pause stops the rAF end-detector; restart it or we never advance.
        resumeTickRef.current?.()
      } catch (err) {
        if (!mountedRef.current) return
        if (isAutoplayBlocked(err)) {
          audioUnlockedRef.current = false
          playRequestedRef.current = false
          safeSetError(autoplayBlockedMessage())
          safeSetStatus('ready')
          return
        }
        safeSetError((err as Error).message)
        safeSetStatus('error')
      }
      return
    }
    // Unlock while we still have the user gesture — model load awaits below.
    await unlockAudio()
    await init()
    if (clientRef.current == null || !mountedRef.current) return
    const startIdx =
      status === 'finished' || cursorRef.current >= optionsRef.current.chunks.length
        ? 0
        : cursorRef.current
    playRequestedRef.current = true
    safeSetStatus('playing')
    void playChunk(startIdx)
  }, [status, init, playChunk, unlockAudio, safeSetStatus, safeSetError])

  const pause = useCallback((): void => {
    playRequestedRef.current = false
    stopRaf()
    audioRef.current?.pause()
    safeSetStatus('paused')
  }, [stopRaf, safeSetStatus])

  const stop = useCallback((): void => {
    playRequestedRef.current = false
    playTokenRef.current += 1
    releaseAudio()
    prefetchRef.current.clear()
    clientRef.current?.cancel()
    cursorRef.current = 0
    lastEmittedWordRef.current = -1
    setActiveWord(-1)
    safeSetCurrentChunkIdx(-1)
    safeSetBuffering(false)
    safeSetStatus(clientRef.current ? 'ready' : 'idle')
    optionsRef.current.onActiveWord(-1)
  }, [releaseAudio, setActiveWord, safeSetCurrentChunkIdx, safeSetBuffering, safeSetStatus])

  const seekToWord = useCallback(
    async (wIdx: number): Promise<void> => {
      const all = optionsRef.current.chunks
      if (wIdx < 0 || all.length === 0) return
      const chunkIdx = all.findIndex(
        (c) => wIdx >= c.startWordIdx && wIdx < c.endWordIdx,
      )
      if (chunkIdx < 0) return

      safeSetError(null)
      await unlockAudio()
      playTokenRef.current += 1
      releaseAudio()
      clientRef.current?.cancel()
      prefetchRef.current.clear()

      cursorRef.current = chunkIdx
      lastEmittedWordRef.current = -1
      safeSetCurrentChunkIdx(chunkIdx)

      await init()
      if (clientRef.current == null || !mountedRef.current) return

      playRequestedRef.current = true
      safeSetStatus('playing')
      void playChunk(chunkIdx, wIdx)
    },
    [init, playChunk, unlockAudio, releaseAudio, safeSetStatus, safeSetError, safeSetCurrentChunkIdx],
  )

  const skipChunk = useCallback(
    async (delta: 1 | -1): Promise<void> => {
      const all = optionsRef.current.chunks
      if (all.length === 0) return
      const base = cursorRef.current >= 0 ? cursorRef.current : 0
      const next = Math.max(0, Math.min(all.length - 1, base + delta))
      if (next === base && status === 'playing') return

      safeSetError(null)
      await unlockAudio()
      playTokenRef.current += 1
      releaseAudio()
      clientRef.current?.cancel()
      prefetchRef.current.clear()

      cursorRef.current = next
      lastEmittedWordRef.current = -1
      safeSetCurrentChunkIdx(next)

      const firstWord = all[next]?.words[0]?.idx
      if (firstWord != null) emitActive(firstWord)

      await init()
      if (clientRef.current == null || !mountedRef.current) return

      playRequestedRef.current = true
      safeSetStatus('playing')
      void playChunk(next)
    },
    [status, init, playChunk, unlockAudio, releaseAudio, emitActive, safeSetStatus, safeSetError, safeSetCurrentChunkIdx],
  )

  const toggle = useCallback((): void => {
    if (status === 'playing') pause()
    else void play()
  }, [status, pause, play])

  return {
    status,
    device,
    voices,
    progress,
    error,
    currentChunkIdx,
    buffering,
    chunkReadyTick,
    /** Snapshot helper for imperative refs (keyboard handlers). Prefer useActiveWordIdx in React trees. */
    getActiveWord,
    subscribeActiveWord,
    analyserRef,
    play,
    pause,
    stop,
    toggle,
    seekToWord,
    skipChunk,
    init,
    unlockAudio,
  }
}
