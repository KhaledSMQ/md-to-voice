import { useCallback, useEffect, useRef, useState } from 'react'
import { TTSClient, type TTSResult } from './tts/ttsClient'
import type { Device, ProgressEvent, VoiceInfo } from './tts/types'
import type { Chunk } from './chunker'
import { activeWordInChunk, chunkWordEndTimes } from './timing'

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

export function usePlayer({
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
  const [activeWordIdx, setActiveWordIdx] = useState<number>(-1)

  const clientRef = useRef<TTSClient | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  /** captureStream() tracks must be stopped or they keep the element alive. */
  const captureStreamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  /** Chunk end backup timer — must be cleared on stop/seek/unmount. */
  const backupTimerRef = useRef<number>(0)
  const cursorRef = useRef<number>(0)
  const prefetchRef = useRef<Map<number, Promise<TTSResult>>>(new Map())
  const playRequestedRef = useRef<boolean>(false)
  const lastEmittedWordRef = useRef<number>(-1)
  const playTokenRef = useRef(0)
  const playChunkRef = useRef<(chunkIdx: number) => Promise<void>>(async () => {})
  /** Restart word-highlight + end-detection after pause/resume. */
  const resumeTickRef = useRef<(() => void) | null>(null)

  const optionsRef = useRef({ voice, speed, volume, onActiveWord, onChunkChange, chunks, resumeAtWordIdx })
  useEffect(() => {
    optionsRef.current = { voice, speed, volume, onActiveWord, onChunkChange, chunks, resumeAtWordIdx }
  }, [voice, speed, volume, onActiveWord, onChunkChange, chunks, resumeAtWordIdx])

  const disconnectSource = useCallback((): void => {
    sourceRef.current?.disconnect()
    sourceRef.current = null
    const stream = captureStreamRef.current
    if (stream) {
      for (const track of stream.getTracks()) track.stop()
      captureStreamRef.current = null
    }
  }, [])

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
        const ctx = new AudioContext()
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
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
    audioRef.current = null
  }, [clearBackupTimer, disconnectSource, stopRaf])

  const resetPlayback = useCallback((): void => {
    playRequestedRef.current = false
    playTokenRef.current += 1
    releaseAudio()
    prefetchRef.current.clear()
    clientRef.current?.cancel()
    cursorRef.current = 0
    lastEmittedWordRef.current = -1
    setCurrentChunkIdx(-1)
    setActiveWordIdx(-1)
    setStatus((s) => (s === 'idle' || s === 'loading-model' || s === 'error' ? s : 'ready'))
  }, [releaseAudio])

  // Stable fingerprint so we only reset when the TTS plan actually changes.
  const chunksKey = `${chunks.length}:${chunks[0]?.text ?? ''}:${chunks[chunks.length - 1]?.text ?? ''}:${chunks[0]?.startWordIdx ?? -1}:${chunks[chunks.length - 1]?.endWordIdx ?? -1}`
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

  useEffect(() => {
    if (prefetchRef.current.size === 0) return
    prefetchRef.current.clear()
    clientRef.current?.cancel()
  }, [voice, speed])

  useEffect(() => {
    return () => {
      releaseAudio()
      void audioCtxRef.current?.close()
      audioCtxRef.current = null
      analyserRef.current = null
      sourceRef.current = null
      clientRef.current?.destroy()
      clientRef.current = null
    }
  }, [releaseAudio])

  const ensureClient = useCallback((): TTSClient => {
    if (clientRef.current) return clientRef.current
    const client = new TTSClient()
    client.onProgress((e: ProgressEvent) => {
      const ratio =
        typeof e.progress === 'number'
          ? e.progress > 1
            ? e.progress / 100
            : e.progress
          : undefined
      setProgress({ file: e.file, ratio, status: e.status })
    })
    clientRef.current = client
    return client
  }, [])

  const init = useCallback(async (): Promise<void> => {
    if (status === 'ready' || status === 'playing' || status === 'paused' || status === 'loading-model') return
    setStatus('loading-model')
    setError(null)
    try {
      const client = ensureClient()
      const info = await client.init()
      setDevice(info.device)
      setVoices(info.voices)
      setStatus('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
      clientRef.current?.destroy()
      clientRef.current = null
    }
  }, [status, ensureClient])

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

  const emitActive = useCallback((globalIdx: number): void => {
    if (lastEmittedWordRef.current === globalIdx) return
    lastEmittedWordRef.current = globalIdx
    setActiveWordIdx(globalIdx)
    optionsRef.current.onActiveWord(globalIdx)
  }, [])

  const playChunk = useCallback(
    async (chunkIdx: number): Promise<void> => {
      const token = playTokenRef.current
      const all = optionsRef.current.chunks
      if (chunkIdx >= all.length) {
        releaseAudio()
        setStatus('finished')
        setCurrentChunkIdx(-1)
        cursorRef.current = 0
        emitActive(-1)
        return
      }

      cursorRef.current = chunkIdx
      setCurrentChunkIdx(chunkIdx)
      optionsRef.current.onChunkChange?.(chunkIdx)
      prunePrefetchCache(chunkIdx)

      let result: TTSResult
      try {
        const p = requestChunk(chunkIdx)
        if (!p) return
        result = await p
      } catch (err) {
        if ((err as Error).message === 'cancelled') return
        setError((err as Error).message)
        setStatus('error')
        return
      }

      if (playTokenRef.current !== token || !playRequestedRef.current) return

      prefetchAhead(chunkIdx)

      // Fresh <audio> per chunk. Play through the element directly (reliable
      // `ended`); tap captureStream for the visualiser instead of
      // createMediaElementSource, which was stalling after sentence breaks.
      disconnectSource()
      stopRaf()
      clearBackupTimer()
      const prev = audioRef.current
      if (prev) {
        prev.onended = null
        prev.onpause = null
        prev.onerror = null
        prev.pause()
        prev.removeAttribute('src')
        prev.load()
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current)
        audioUrlRef.current = null
      }
      const url = URL.createObjectURL(result.blob)
      audioUrlRef.current = url
      const audio = new Audio()
      audio.preload = 'auto'
      audio.volume = optionsRef.current.volume
      audio.src = url
      audioRef.current = audio

      if (playTokenRef.current !== token || !playRequestedRef.current) {
        releaseAudio()
        return
      }

      const chunk = all[chunkIdx]
      const ends = chunkWordEndTimes(chunk, result.durationSec)
      // Prefer TTS-reported duration — blob audio.duration is often NaN/Infinity.
      const clipDuration = Math.max(0.05, result.durationSec)
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

      scheduleBackup(clipDuration)

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
        if (playTokenRef.current !== token || !playRequestedRef.current) {
          releaseAudio()
          return
        }
        setStatus('playing')
        void connectAnalyserTap(audio)
        stopRaf()
        rafRef.current = requestAnimationFrame(tick)
      } catch (err) {
        clearBackupTimer()
        if (playTokenRef.current !== token) return
        setError((err as Error).message)
        setStatus('error')
      }
    },
    [
      requestChunk,
      prunePrefetchCache,
      prefetchAhead,
      releaseAudio,
      emitActive,
      connectAnalyserTap,
      stopRaf,
      clearBackupTimer,
      disconnectSource,
    ],
  )

  useEffect(() => {
    playChunkRef.current = playChunk
  }, [playChunk])

  const play = useCallback(async (): Promise<void> => {
    setError(null)
    if (status === 'paused' && audioRef.current?.src) {
      playRequestedRef.current = true
      try {
        await audioRef.current.play()
        setStatus('playing')
        // Pause stops the rAF end-detector; restart it or we never advance.
        resumeTickRef.current?.()
      } catch (err) {
        setError((err as Error).message)
        setStatus('error')
      }
      return
    }
    await init()
    if (clientRef.current == null) return
    const startIdx =
      status === 'finished' || cursorRef.current >= optionsRef.current.chunks.length
        ? 0
        : cursorRef.current
    playRequestedRef.current = true
    setStatus('playing')
    void playChunk(startIdx)
  }, [status, init, playChunk])

  const pause = useCallback((): void => {
    playRequestedRef.current = false
    stopRaf()
    audioRef.current?.pause()
    setStatus('paused')
  }, [stopRaf])

  const stop = useCallback((): void => {
    playRequestedRef.current = false
    playTokenRef.current += 1
    releaseAudio()
    cursorRef.current = 0
    lastEmittedWordRef.current = -1
    setCurrentChunkIdx(-1)
    setActiveWordIdx(-1)
    setStatus(clientRef.current ? 'ready' : 'idle')
    optionsRef.current.onActiveWord(-1)
  }, [releaseAudio])

  const seekToWord = useCallback(
    async (wIdx: number): Promise<void> => {
      const all = optionsRef.current.chunks
      if (wIdx < 0 || all.length === 0) return
      const chunkIdx = all.findIndex(
        (c) => wIdx >= c.startWordIdx && wIdx < c.endWordIdx,
      )
      if (chunkIdx < 0) return

      setError(null)
      playTokenRef.current += 1
      releaseAudio()
      clientRef.current?.cancel()
      prefetchRef.current.clear()

      cursorRef.current = chunkIdx
      lastEmittedWordRef.current = -1
      setCurrentChunkIdx(chunkIdx)

      await init()
      if (clientRef.current == null) return

      playRequestedRef.current = true
      setStatus('playing')
      void playChunk(chunkIdx)
    },
    [init, playChunk, releaseAudio],
  )

  const skipChunk = useCallback(
    async (delta: 1 | -1): Promise<void> => {
      const all = optionsRef.current.chunks
      if (all.length === 0) return
      const base = cursorRef.current >= 0 ? cursorRef.current : 0
      const next = Math.max(0, Math.min(all.length - 1, base + delta))
      if (next === base && status === 'playing') return

      setError(null)
      playTokenRef.current += 1
      releaseAudio()
      clientRef.current?.cancel()
      prefetchRef.current.clear()

      cursorRef.current = next
      lastEmittedWordRef.current = -1
      setCurrentChunkIdx(next)

      const firstWord = all[next]?.words[0]?.idx
      if (firstWord != null) emitActive(firstWord)

      await init()
      if (clientRef.current == null) return

      playRequestedRef.current = true
      setStatus('playing')
      void playChunk(next)
    },
    [status, init, playChunk, releaseAudio, emitActive],
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
    activeWordIdx,
    analyserRef,
    play,
    pause,
    stop,
    toggle,
    seekToWord,
    skipChunk,
    init,
  }
}
