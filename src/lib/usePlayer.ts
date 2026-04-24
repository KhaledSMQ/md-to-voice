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
  onActiveWord: (wIdx: number) => void
  onChunkChange?: (chunkIdx: number) => void
}

export function usePlayer({ chunks, voice, speed, onActiveWord, onChunkChange }: Options) {
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [device, setDevice] = useState<Device | null>(null)
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  const [progress, setProgress] = useState<LoadProgress>({})
  const [error, setError] = useState<string | null>(null)
  const [currentChunkIdx, setCurrentChunkIdx] = useState<number>(-1)

  const clientRef = useRef<TTSClient | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const rafRef = useRef<number | null>(null)
  const cursorRef = useRef<number>(0)
  const prefetchRef = useRef<Map<number, Promise<TTSResult>>>(new Map())
  const playRequestedRef = useRef<boolean>(false)
  const lastEmittedWordRef = useRef<number>(-1)

  const optionsRef = useRef({ voice, speed, onActiveWord, onChunkChange, chunks })
  optionsRef.current = { voice, speed, onActiveWord, onChunkChange, chunks }

  const releaseAudio = useCallback((): void => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    const a = audioRef.current
    if (a) {
      a.pause()
      a.removeAttribute('src')
      a.load()
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
    audioRef.current = null
  }, [])

  const resetPlayback = useCallback((): void => {
    playRequestedRef.current = false
    releaseAudio()
    prefetchRef.current.clear()
    clientRef.current?.cancel()
    cursorRef.current = 0
    lastEmittedWordRef.current = -1
    setCurrentChunkIdx(-1)
    setStatus((s) => (s === 'idle' || s === 'loading-model' || s === 'error' ? s : 'ready'))
  }, [releaseAudio])

  useEffect(() => {
    resetPlayback()
    optionsRef.current.onActiveWord(-1)
  }, [chunks, resetPlayback])

  useEffect(() => {
    if (prefetchRef.current.size === 0) return
    prefetchRef.current.clear()
    clientRef.current?.cancel()
  }, [voice, speed])

  useEffect(() => {
    return () => {
      releaseAudio()
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

  const prunePrefetchCache = useCallback((keepFromIdx: number): void => {
    for (const k of Array.from(prefetchRef.current.keys())) {
      if (k < keepFromIdx) prefetchRef.current.delete(k)
    }
  }, [])

  const emitActive = useCallback((globalIdx: number): void => {
    if (lastEmittedWordRef.current === globalIdx) return
    lastEmittedWordRef.current = globalIdx
    optionsRef.current.onActiveWord(globalIdx)
  }, [])

  const playChunk = useCallback(
    async (chunkIdx: number): Promise<void> => {
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

      if (cursorRef.current !== chunkIdx || !playRequestedRef.current) return

      requestChunk(chunkIdx + 1)

      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
      const url = URL.createObjectURL(result.blob)
      audioUrlRef.current = url
      const audio = new Audio()
      audio.preload = 'auto'
      audio.src = url
      audioRef.current = audio

      const chunk = all[chunkIdx]
      const ends = chunkWordEndTimes(chunk, result.durationSec)

      const tick = () => {
        if (audioRef.current !== audio) return
        const t = audio.currentTime
        const localIdx = activeWordInChunk(ends, t)
        const globalIdx =
          localIdx >= chunk.words.length
            ? chunk.words[chunk.words.length - 1].idx
            : chunk.words[localIdx].idx
        emitActive(globalIdx)
        rafRef.current = requestAnimationFrame(tick)
      }

      audio.addEventListener('ended', () => {
        if (audioRef.current !== audio) return
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
        rafRef.current = null
        if (!playRequestedRef.current) return
        void playChunk(chunkIdx + 1)
      })

      audio.addEventListener('play', () => {
        if (audioRef.current !== audio) return
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(tick)
      })

      audio.addEventListener('pause', () => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      })

      try {
        await audio.play()
      } catch (err) {
        setError((err as Error).message)
        setStatus('error')
      }
    },
    [requestChunk, prunePrefetchCache, releaseAudio, emitActive],
  )

  const play = useCallback(async (): Promise<void> => {
    setError(null)
    if (status === 'paused' && audioRef.current) {
      playRequestedRef.current = true
      try {
        await audioRef.current.play()
        setStatus('playing')
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
    audioRef.current?.pause()
    setStatus('paused')
  }, [])

  const stop = useCallback((): void => {
    playRequestedRef.current = false
    releaseAudio()
    cursorRef.current = 0
    lastEmittedWordRef.current = -1
    setCurrentChunkIdx(-1)
    setStatus(clientRef.current ? 'ready' : 'idle')
    optionsRef.current.onActiveWord(-1)
  }, [releaseAudio])

  /**
   * Jump playback to whichever chunk contains `wIdx` and start playing from
   * the start of that chunk. Used by click-to-seek on the rendered text.
   *
   * We always restart at the chunk's first word — the TTS engine produces
   * one audio clip per chunk, so we cannot start the audio mid-clip with
   * accurate timing. Re-hearing a few preceding words is the right
   * trade-off for a precise jump.
   */
  const seekToWord = useCallback(
    async (wIdx: number): Promise<void> => {
      const all = optionsRef.current.chunks
      if (wIdx < 0 || all.length === 0) return
      const chunkIdx = all.findIndex(
        (c) => wIdx >= c.startWordIdx && wIdx < c.endWordIdx,
      )
      if (chunkIdx < 0) return

      setError(null)
      // Tear down the current clip + drop in-flight TTS work — those
      // requests were for the old position and we don't want them to
      // resolve on top of the new playback.
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
    play,
    pause,
    stop,
    toggle,
    seekToWord,
    init,
  }
}
