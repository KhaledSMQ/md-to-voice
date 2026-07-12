import { useEffect, useId, useRef, useState } from 'react'
import { SPEED_MAX, SPEED_MIN, VOLUME_MAX, VOLUME_MIN } from '../lib/appSettings'

type Props = {
  volume: number
  onVolume: (v: number) => void
  speed: number
  onSpeed: (v: number) => void
  muted: boolean
  onToggleMute: () => void
}

const SPEED_PRESETS = [
  { label: '0.75×', value: 0.75 },
  { label: '1×', value: 1 },
  { label: '1.25×', value: 1.25 },
] as const

/**
 * Quiet by default — one summary row. Full volume/speed editors open on demand.
 */
export function MixControls({ volume, onVolume, speed, onSpeed, muted, onToggleMute }: Props) {
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const volumePct = Math.round(volume * 100)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className={`studio-mix ${open ? 'is-open' : ''}`}>
      <div className="studio-mix-summary">
        <button
          type="button"
          onClick={onToggleMute}
          className={`studio-mix-mute ${muted ? 'is-muted' : ''}`}
          title={muted ? 'Unmute' : 'Mute'}
          aria-label={muted ? 'Unmute' : 'Mute'}
          aria-pressed={muted}
        >
          {muted ? <MuteGlyph /> : <SpeakerGlyph />}
        </button>

        <button
          type="button"
          className="studio-mix-summary-btn"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          title="Volume & speed"
        >
          <span className="studio-mix-summary-text">
            <span className="tabular-nums">{muted ? 'Muted' : `${volumePct}%`}</span>
            <span className="studio-mix-dot" aria-hidden>
              ·
            </span>
            <span className="tabular-nums">{speed.toFixed(2)}×</span>
          </span>
          <span className="studio-mix-summary-hint">{open ? 'Hide' : 'Edit'}</span>
        </button>
      </div>

      {open && (
        <div id={panelId} className="studio-mix-panel" role="region" aria-label="Volume and speed">
          <div className="studio-mix-field">
            <div className="studio-mix-field-head">
              <label htmlFor={`${panelId}-vol`} className="studio-mix-field-label">
                Volume
              </label>
              <span className="studio-mix-field-value tabular-nums">
                {muted ? 'Muted' : `${volumePct}%`}
              </span>
            </div>
            <input
              id={`${panelId}-vol`}
              type="range"
              min={VOLUME_MIN}
              max={VOLUME_MAX}
              step={0.01}
              value={volume}
              onChange={(e) => onVolume(Number(e.target.value))}
              className="control-range"
              aria-label="Volume"
            />
          </div>

          <div className="studio-mix-field">
            <div className="studio-mix-field-head">
              <label htmlFor={`${panelId}-spd`} className="studio-mix-field-label">
                Speed
              </label>
              <span className="studio-mix-field-value tabular-nums">{speed.toFixed(2)}×</span>
            </div>
            <input
              id={`${panelId}-spd`}
              type="range"
              min={SPEED_MIN}
              max={SPEED_MAX}
              step={0.05}
              value={speed}
              onChange={(e) => onSpeed(Number(e.target.value))}
              className="control-range"
              aria-label="Playback speed"
              title="Speed (, / .)"
            />
            <div className="studio-mix-chips">
              {SPEED_PRESETS.map((p) => {
                const active = Math.abs(speed - p.value) < 0.03
                return (
                  <button
                    key={p.value}
                    type="button"
                    className={`studio-mix-chip ${active ? 'is-active' : ''}`}
                    onClick={() => onSpeed(p.value)}
                    aria-pressed={active}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>

          <button type="button" className="studio-mix-done" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      )}
    </div>
  )
}

function SpeakerGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M11 5 6 9H3v6h3l5 4V5z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 9.5a4 4 0 0 1 0 5" strokeLinecap="round" />
    </svg>
  )
}

function MuteGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M11 5 6 9H3v6h3l5 4V5z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m16 9 5 5M21 9l-5 5" strokeLinecap="round" />
    </svg>
  )
}
