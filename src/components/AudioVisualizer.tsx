import { useEffect, useRef, useState, type RefObject } from 'react'
import SiriWave, { type IiOS9CurveDefinition } from 'siriwave'
import type { PlayerStatus } from '../lib/usePlayer'

type Props = {
  analyserRef: RefObject<AnalyserNode | null>
  playerStatus: PlayerStatus
  className?: string
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

function measureAudio(analyser: AnalyserNode): number {
  const freq = new Uint8Array(analyser.frequencyBinCount)
  const time = new Uint8Array(analyser.fftSize)
  analyser.getByteFrequencyData(freq)
  analyser.getByteTimeDomainData(time)

  let freqSum = 0
  const voiceStart = 2
  const voiceEnd = Math.min(56, freq.length)
  for (let i = voiceStart; i < voiceEnd; i++) freqSum += freq[i] ?? 0
  const freqNorm = freqSum / ((voiceEnd - voiceStart) * 255)

  let sumSq = 0
  for (let i = 0; i < time.length; i++) {
    const v = (time[i]! - 128) / 128
    sumSq += v * v
  }
  const rms = Math.sqrt(sumSq / time.length)

  return Math.min(2.6, 0.16 + freqNorm * 2.1 + rms * 1.6)
}

function loadingPulse(): number {
  return 0.11 + Math.sin(Date.now() / 420) * 0.055
}

export function AudioVisualizer({ analyserRef, playerStatus, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const waveRef = useRef<SiriWave | null>(null)
  const rafRef = useRef<number | null>(null)
  const smoothAmpRef = useRef(0.12)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [reducedMotion, setReducedMotion] = useState(false)

  const isPlaying = playerStatus === 'playing'
  const isPaused = playerStatus === 'paused'
  const isLoading = playerStatus === 'loading-model'
  const isLive = isPlaying || isPaused
  const needsAnim = isPlaying || isPaused || isLoading
  const status = STATUS_META[playerStatus]

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const apply = () => setReducedMotion(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  useEffect(() => {
    if (reducedMotion) {
      waveRef.current?.dispose()
      waveRef.current = null
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      return
    }

    const container = containerRef.current
    if (!container) return

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

    if (!needsAnim) {
      const wave = waveRef.current
      if (wave) {
        smoothAmpRef.current = 0.08
        wave.setAmplitude(0.08)
        wave.setSpeed(0.03)
      }
    } else {
      const tick = () => {
        const wave = waveRef.current
        if (wave) {
          const analyser = analyserRef.current
          let target: number

          if (isPlaying && analyser) {
            target = measureAudio(analyser)
          } else if (isPaused) {
            target = 0.13
          } else {
            target = loadingPulse()
          }

          const lerp = isPlaying ? 0.14 : 0.08
          smoothAmpRef.current += (target - smoothAmpRef.current) * lerp
          wave.setAmplitude(smoothAmpRef.current)

          if (isPlaying && analyser) {
            wave.setSpeed(0.1 + smoothAmpRef.current * 0.08)
          } else if (isPaused) {
            wave.setSpeed(0.05)
          } else {
            wave.setSpeed(0.09)
          }
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    const ro = new ResizeObserver(() => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      resizeTimerRef.current = setTimeout(mountWave, 120)
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      waveRef.current?.dispose()
      waveRef.current = null
    }
  }, [analyserRef, isPlaying, isPaused, isLoading, needsAnim, reducedMotion])

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border border-white/[0.07] bg-gradient-to-b from-ink-950 via-[#0a101c] to-ink-900/60 shadow-inner shadow-ink-950/90 ${className}`}
    >
      {reducedMotion ? (
        <div className="flex h-20 sm:h-24 w-full items-center justify-center" aria-hidden>
          <div className="h-px w-3/4 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        </div>
      ) : (
        <div
          ref={containerRef}
          className={`h-20 sm:h-32 w-full transition-opacity duration-500 ${isLive ? 'opacity-100' : 'opacity-70'}`}
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
