import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STEP,
  VOLUME_MAX,
  VOLUME_MIN,
  clampSpeed,
} from '../lib/appSettings'

type TriggerProps = {
  open: boolean
  onToggle: () => void
  volume: number
  speed: number
  muted: boolean
  disabled?: boolean
}

type SheetProps = {
  open: boolean
  onClose: () => void
  volume: number
  onVolume: (v: number) => void
  speed: number
  onSpeed: (v: number) => void
  muted: boolean
  onToggleMute: () => void
}

const SPEED_PRESETS = [0.75, 1, 1.25] as const
const VOLUME_STEP = 0.1

/** Compact pill beside the voice switcher. */
export function MixTrigger({
  open,
  onToggle,
  volume,
  speed,
  muted,
  disabled = false,
}: TriggerProps) {
  const volumePct = Math.round(volume * 100)

  return (
    <button
      type="button"
      className={`studio-mix-trigger ${muted ? 'is-muted' : ''}${open ? ' is-open' : ''}`}
      aria-expanded={open}
      aria-controls="studio-mix-sheet"
      disabled={disabled}
      title="Volume & speed"
      aria-label={`Volume and speed, ${muted ? 'muted' : `${volumePct}%`}, ${formatSpeed(speed)}`}
      onClick={onToggle}
    >
      <span className="studio-mix-trigger-icon" aria-hidden>
        {muted ? <MuteGlyph /> : <SpeakerGlyph />}
      </span>
      <span className="studio-mix-trigger-label tabular-nums">
        {muted ? 'Mute' : `${volumePct}`}
        <span className="studio-mix-trigger-dot" aria-hidden>
          ·
        </span>
        {formatSpeed(speed)}
      </span>
    </button>
  )
}

/** Full-bleed cover sheet over the Siri stage card. */
export function MixSheet({
  open,
  onClose,
  volume,
  onVolume,
  speed,
  onSpeed,
  muted,
  onToggleMute,
}: SheetProps) {
  const labelId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const volumePct = Math.round(volume * 100)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('.studio-mix-sheet-close')?.focus()
    }, 40)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(t)
    }
  }, [open, onClose])

  const setVolumeClamped = useCallback(
    (v: number) => {
      onVolume(Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, Math.round(v * 100) / 100)))
    },
    [onVolume],
  )

  const nudgeVolume = useCallback(
    (delta: number) => {
      setVolumeClamped(volume + delta)
    },
    [setVolumeClamped, volume],
  )

  const nudgeSpeed = useCallback(
    (delta: number) => {
      onSpeed(clampSpeed(speed + delta))
    },
    [onSpeed, speed],
  )

  return (
    <div
      id="studio-mix-sheet"
      className={`studio-mix-sheet${open ? ' is-open' : ''}`}
      aria-hidden={!open || undefined}
    >
      <div
        ref={panelRef}
        className="studio-mix-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
      >
        <header className="studio-mix-sheet-head">
          <div className="studio-mix-sheet-heading">
            <span id={labelId} className="studio-mix-sheet-title">
              Mix
            </span>
            <span className="studio-mix-sheet-summary tabular-nums">
              {muted ? 'Muted' : `${volumePct}%`}
              <span className="studio-mix-sheet-summary-dot" aria-hidden>
                ·
              </span>
              {formatSpeed(speed)}
            </span>
          </div>
          <button
            type="button"
            className="studio-mix-sheet-close"
            onClick={onClose}
            tabIndex={open ? 0 : -1}
            aria-label="Close mix"
            title="Close"
          >
            <CloseGlyph />
          </button>
        </header>

        <div className="studio-mix-sheet-body">
          <section className="studio-mix-block" style={{ ['--mix-i' as string]: 0 }}>
            <div className="studio-mix-block-head">
              <span className="studio-mix-block-label">
                <SpeakerGlyph />
                Volume
              </span>
              <span className="studio-mix-block-value tabular-nums">
                {muted ? 'Muted' : `${volumePct}%`}
              </span>
            </div>
            <div className="studio-mix-block-row">
              <button
                type="button"
                className={`studio-mix-btn studio-mix-mute ${muted ? 'is-muted' : ''}`}
                onClick={onToggleMute}
                tabIndex={open ? 0 : -1}
                title={muted ? 'Unmute' : 'Mute'}
                aria-label={muted ? 'Unmute' : 'Mute'}
                aria-pressed={muted}
              >
                {muted ? <MuteGlyph /> : <SpeakerGlyph />}
              </button>
              <HoldButton
                className="studio-mix-btn"
                onStep={() => nudgeVolume(-VOLUME_STEP)}
                disabled={volume <= VOLUME_MIN}
                tabIndex={open ? 0 : -1}
                aria-label="Volume down"
              >
                −
              </HoldButton>
              <VolumeMeter
                volume={volume}
                muted={muted}
                disabled={!open}
                onVolume={setVolumeClamped}
              />
              <HoldButton
                className="studio-mix-btn"
                onStep={() => nudgeVolume(VOLUME_STEP)}
                disabled={volume >= VOLUME_MAX && !muted}
                tabIndex={open ? 0 : -1}
                aria-label="Volume up"
              >
                +
              </HoldButton>
            </div>
          </section>

          <div className="studio-mix-divider" aria-hidden />

          <section className="studio-mix-block" style={{ ['--mix-i' as string]: 1 }}>
            <div className="studio-mix-block-head">
              <span className="studio-mix-block-label">
                <SpeedGlyph />
                Speed
              </span>
              <span className="studio-mix-block-value tabular-nums">{formatSpeed(speed)}</span>
            </div>
            <div className="studio-mix-block-row">
              <HoldButton
                className="studio-mix-btn"
                onStep={() => nudgeSpeed(-SPEED_STEP)}
                disabled={speed <= SPEED_MIN}
                tabIndex={open ? 0 : -1}
                aria-label="Slower"
                title="Slower (,)"
              >
                −
              </HoldButton>
              <div className="studio-mix-presets" role="group" aria-label="Speed presets">
                {SPEED_PRESETS.map((value) => {
                  const active = Math.abs(speed - value) < 0.03
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`studio-mix-preset ${active ? 'is-active' : ''}`}
                      onClick={() => onSpeed(value)}
                      tabIndex={open ? 0 : -1}
                      aria-pressed={active}
                    >
                      {value === 1 ? '1×' : `${value}×`}
                    </button>
                  )
                })}
              </div>
              <HoldButton
                className="studio-mix-btn"
                onStep={() => nudgeSpeed(SPEED_STEP)}
                disabled={speed >= SPEED_MAX}
                tabIndex={open ? 0 : -1}
                aria-label="Faster"
                title="Faster (.)"
              >
                +
              </HoldButton>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function VolumeMeter({
  volume,
  muted,
  disabled,
  onVolume,
}: {
  volume: number
  muted: boolean
  disabled: boolean
  onVolume: (v: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const valueFromX = (clientX: number) => {
    const el = trackRef.current
    if (!el) return volume
    const rect = el.getBoundingClientRect()
    const t = (clientX - rect.left) / rect.width
    return Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, Math.round(t * 100) / 100))
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return
    e.preventDefault()
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    onVolume(valueFromX(e.clientX))
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    onVolume(valueFromX(e.clientX))
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const pct = muted ? 0 : Math.round(volume * 100)

  return (
    <div
      ref={trackRef}
      className={`studio-mix-meter ${muted ? 'is-muted' : ''}`}
      role="slider"
      aria-label="Volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={muted ? 'Muted' : `${pct}%`}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault()
          onVolume(Math.min(VOLUME_MAX, Math.round((volume + VOLUME_STEP) * 10) / 10))
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault()
          onVolume(Math.max(VOLUME_MIN, Math.round((volume - VOLUME_STEP) * 10) / 10))
        } else if (e.key === 'Home') {
          e.preventDefault()
          onVolume(VOLUME_MAX)
        } else if (e.key === 'End') {
          e.preventDefault()
          onVolume(VOLUME_MIN)
        }
      }}
    >
      <div
        className="studio-mix-meter-fill"
        style={{ width: `calc((100% - 14px) * ${pct} / 100)` }}
      />
      <div
        className="studio-mix-meter-thumb"
        style={{ left: `calc(7px + (100% - 14px) * ${pct} / 100)` }}
      />
    </div>
  )
}

function HoldButton({
  onStep,
  disabled,
  className,
  tabIndex,
  'aria-label': ariaLabel,
  title,
  children,
}: {
  onStep: () => void
  disabled?: boolean
  className?: string
  tabIndex?: number
  'aria-label': string
  title?: string
  children: ReactNode
}) {
  const onStepRef = useRef(onStep)
  onStepRef.current = onStep
  const timers = useRef<{ delay?: number; repeat?: number }>({})
  const ignoreClick = useRef(false)

  const clear = () => {
    if (timers.current.delay != null) window.clearTimeout(timers.current.delay)
    if (timers.current.repeat != null) window.clearInterval(timers.current.repeat)
    timers.current = {}
  }

  useEffect(() => clear, [])

  useEffect(() => {
    if (disabled) clear()
  }, [disabled])

  const start = () => {
    if (disabled) return
    onStepRef.current()
    clear()
    timers.current.delay = window.setTimeout(() => {
      timers.current.repeat = window.setInterval(() => onStepRef.current(), 70)
    }, 320)
  }

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      title={title}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        ignoreClick.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        start()
      }}
      onPointerUp={clear}
      onPointerCancel={clear}
      onClick={() => {
        if (ignoreClick.current) {
          ignoreClick.current = false
          return
        }
        if (!disabled) onStepRef.current()
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}

function formatSpeed(speed: number): string {
  const rounded = Math.round(speed * 100) / 100
  return Number.isInteger(rounded) ? `${rounded}×` : `${rounded.toFixed(2)}×`
}

function SpeakerGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M11 5 6 9H3v6h3l5 4V5z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 9.5a4 4 0 0 1 0 5" strokeLinecap="round" />
    </svg>
  )
}

function MuteGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M11 5 6 9H3v6h3l5 4V5z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m16 9 5 5M21 9l-5 5" strokeLinecap="round" />
    </svg>
  )
}

function SpeedGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CloseGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  )
}
