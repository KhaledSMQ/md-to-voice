import { useEffect, useRef, useState, type RefObject } from 'react'
import SiriWave, { type IiOS9CurveDefinition } from 'siriwave'
import type { PlayerStatus } from '../lib/usePlayer'

type Props = {
  analyserRef: RefObject<AnalyserNode | null>
  playerStatus: PlayerStatus
  /** Waiting on TTS for the next sentence chunk. */
  buffering?: boolean
  className?: string
  /** Taller hero stage for the studio console. */
  variant?: 'default' | 'stage'
}

/** Amber / pink / sky palette to match the app shell. */
const CURVE_DEFINITION: IiOS9CurveDefinition[] = [
  { color: '252, 211, 77' },
  { color: '244, 114, 182' },
  { color: '56, 189, 248' },
  { supportLine: true, color: '255, 255, 255' },
]

const STATUS_META: Record<
  PlayerStatus,
  { label: string; dot: string; badge: string }
> = {
  idle: {
    label: 'Ready',
    dot: 'bg-ink-400',
    badge: 'border-white/10 bg-ink-950/70 text-ink-300',
  },
  'loading-model': {
    label: 'Loading model',
    dot: 'bg-amber-300 status-pulse',
    badge: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
  },
  ready: {
    label: 'Ready',
    dot: 'bg-emerald-400',
    badge: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100',
  },
  playing: {
    label: 'Speaking',
    dot: 'bg-emerald-400 status-pulse',
    badge: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
  },
  paused: {
    label: 'Paused',
    dot: 'bg-amber-300',
    badge: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  },
  finished: {
    label: 'Finished',
    dot: 'bg-sky-400',
    badge: 'border-sky-400/25 bg-sky-400/10 text-sky-100',
  },
  error: {
    label: 'Error',
    dot: 'bg-red-400',
    badge: 'border-red-400/30 bg-red-400/10 text-red-200',
  },
}

function measureAudio(
  analyser: AnalyserNode,
  freqBuf: Uint8Array,
  timeBuf: Uint8Array,
): number {
  // AnalyserNode typings expect ArrayBuffer-backed views; our reused buffers are fine at runtime.
  analyser.getByteFrequencyData(freqBuf as Uint8Array<ArrayBuffer>)
  analyser.getByteTimeDomainData(timeBuf as Uint8Array<ArrayBuffer>)

  let freqSum = 0
  const voiceStart = 2
  const voiceEnd = Math.min(56, freqBuf.length)
  for (let i = voiceStart; i < voiceEnd; i++) freqSum += freqBuf[i] ?? 0
  const freqNorm = freqSum / ((voiceEnd - voiceStart) * 255)

  let sumSq = 0
  for (let i = 0; i < timeBuf.length; i++) {
    const v = (timeBuf[i]! - 128) / 128
    sumSq += v * v
  }
  const rms = Math.sqrt(sumSq / timeBuf.length)

  return Math.min(2.6, 0.16 + freqNorm * 2.1 + rms * 1.6)
}

function loadingPulse(): number {
  return 0.11 + Math.sin(Date.now() / 420) * 0.055
}

export function AudioVisualizer({
  analyserRef,
  playerStatus,
  buffering = false,
  className = '',
  variant = 'default',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const waveRef = useRef<SiriWave | null>(null)
  const rafRef = useRef<number | null>(null)
  const smoothAmpRef = useRef(0.12)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Reused every frame — avoid allocating ~512 bytes × 60fps while speaking. */
  const freqBufRef = useRef<Uint8Array | null>(null)
  const timeBufRef = useRef<Uint8Array | null>(null)
  const analyserNodeRef = useRef(analyserRef)
  analyserNodeRef.current = analyserRef
  const playingRef = useRef(false)
  const pausedRef = useRef(false)
  const bufferingRef = useRef(false)
  const needsAnimRef = useRef(false)
  const startLoopRef = useRef<() => void>(() => {})
  const [reducedMotion, setReducedMotion] = useState(false)

  const isPlaying = playerStatus === 'playing'
  const isPaused = playerStatus === 'paused'
  const isLoading = playerStatus === 'loading-model'
  const isLive = isPlaying || isPaused
  const needsAnim = isPlaying || isPaused || isLoading || buffering
  const status = buffering
    ? {
        label: 'Synthesizing',
        dot: 'bg-amber-300 status-pulse',
        badge: 'border-amber-300/35 bg-amber-300/15 text-amber-100',
      }
    : STATUS_META[playerStatus]
  const isStage = variant === 'stage'

  playingRef.current = isPlaying
  pausedRef.current = isPaused
  bufferingRef.current = buffering
  needsAnimRef.current = needsAnim

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const apply = () => setReducedMotion(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  // Mount the wave once; drive amplitude/speed from status refs so play/pause
  // does not dispose and recreate SiriWave.
  useEffect(() => {
    if (reducedMotion) {
      waveRef.current?.dispose()
      waveRef.current = null
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      startLoopRef.current = () => {}
      return
    }

    const container = containerRef.current
    if (!container) return

    const applyIdle = () => {
      const wave = waveRef.current
      if (!wave) return
      smoothAmpRef.current = 0.08
      wave.setAmplitude(0.08)
      wave.setSpeed(0.03)
    }

    const tick = () => {
      const wave = waveRef.current
      if (!wave) {
        rafRef.current = null
        return
      }
      if (!needsAnimRef.current) {
        applyIdle()
        rafRef.current = null
        return
      }

      const analyser = analyserNodeRef.current.current
      let target: number

      if (bufferingRef.current) {
        target = loadingPulse()
      } else if (playingRef.current && analyser) {
        if (!freqBufRef.current || freqBufRef.current.length !== analyser.frequencyBinCount) {
          freqBufRef.current = new Uint8Array(analyser.frequencyBinCount)
        }
        if (!timeBufRef.current || timeBufRef.current.length !== analyser.fftSize) {
          timeBufRef.current = new Uint8Array(analyser.fftSize)
        }
        target = measureAudio(analyser, freqBufRef.current, timeBufRef.current)
      } else if (pausedRef.current) {
        target = 0.13
      } else {
        target = loadingPulse()
      }

      const lerp = playingRef.current && !bufferingRef.current ? 0.14 : 0.08
      smoothAmpRef.current += (target - smoothAmpRef.current) * lerp
      wave.setAmplitude(smoothAmpRef.current)

      if (bufferingRef.current) {
        wave.setSpeed(0.12)
      } else if (playingRef.current && analyser) {
        wave.setSpeed(0.1 + smoothAmpRef.current * 0.08)
      } else if (pausedRef.current) {
        wave.setSpeed(0.05)
      } else {
        wave.setSpeed(0.09)
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    const startLoop = () => {
      if (rafRef.current != null) return
      if (!needsAnimRef.current) {
        applyIdle()
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    startLoopRef.current = startLoop

    const mountWave = () => {
      waveRef.current?.dispose()
      waveRef.current = new SiriWave({
        container,
        style: 'ios9',
        autostart: true,
        cover: true,
        speed: 0.1,
        amplitude: 0.12,
        lerpSpeed: 0.06,
        globalCompositeOperation: 'lighter',
        curveDefinition: CURVE_DEFINITION,
      })
    }

    mountWave()
    startLoop()

    const ro = new ResizeObserver(() => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      resizeTimerRef.current = setTimeout(() => {
        mountWave()
        startLoop()
      }, 120)
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      waveRef.current?.dispose()
      waveRef.current = null
      startLoopRef.current = () => {}
    }
  }, [reducedMotion])

  // Start/stop the rAF loop when animation need changes — without remounting the wave.
  useEffect(() => {
    if (reducedMotion) return
    if (!needsAnim) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      const wave = waveRef.current
      if (wave) {
        smoothAmpRef.current = 0.08
        wave.setAmplitude(0.08)
        wave.setSpeed(0.03)
      }
      return
    }
    startLoopRef.current()
  }, [needsAnim, reducedMotion])

  return (
    <div
      className={
        `group relative overflow-hidden bg-gradient-to-b from-ink-950 via-[#0a101c] to-ink-900/60 shadow-inner shadow-ink-950/90 ` +
        (isStage
          ? `studio-stage rounded-2xl border border-white/[0.08] ${isPlaying || buffering ? 'is-live' : ''}${buffering ? ' is-buffering' : ''}`
          : 'rounded-xl border border-white/[0.07]') +
        (className ? ` ${className}` : '')
      }
    >
      {reducedMotion ? (
        <div
          className={`flex w-full items-center justify-center ${isStage ? 'h-20 lg:h-28' : 'h-20 sm:h-24'}`}
          aria-hidden
        >
          <div className="h-px w-3/4 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        </div>
      ) : (
        <div
          ref={containerRef}
          className={
            `w-full transition-opacity duration-500 ${isLive || buffering ? 'opacity-100' : 'opacity-70'} ` +
            (isStage ? 'h-20 lg:h-28' : 'h-20 sm:h-32')
          }
          aria-hidden
        />
      )}

      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_20%_50%,rgba(252,211,77,0.12),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_80%_50%,rgba(244,114,182,0.1),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(15,23,42,0.35))]"
        aria-hidden
      />

      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent transition-opacity duration-300 ${isLive ? 'opacity-100' : 'opacity-40'}`}
        aria-hidden
      />

      <div
        className={`absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium backdrop-blur-md ${status.badge}`}
        role="status"
        aria-live="polite"
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />
        {status.label}
      </div>
    </div>
  )
}
