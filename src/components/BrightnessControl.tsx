import {
  BRIGHTNESS_ANCHORS,
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  adjustPaperInk,
  brightnessLabel,
  clampBrightness,
  type SurfacePolarity,
} from '../lib/readingBrightness'
import type { ReadingPresetId } from '../lib/readingPresets'

type Props = {
  value: number
  onChange: (brightness: number) => void
  readingPreset: ReadingPresetId
}

/**
 * Page-light control — luminance well with live paper/ink sample and
 * WCAG contrast readout (science-backed dual adjustment).
 */
export function BrightnessControl({ value, onChange, readingPreset }: Props) {
  const adjusted = adjustPaperInk(readingPreset, value)
  const label = brightnessLabel(value)
  const contrastText = `${adjusted.contrast.toFixed(1)}:1`
  const glow = pageGlow(adjusted.polarity, value)

  return (
    <div className="rounded-lg px-2 py-1.5" role="group" aria-label="Page light">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-ink-400">Page light</span>
        <span className="text-[10px] tabular-nums text-ink-500" aria-live="polite">
          {label} · {contrastText}
        </span>
      </div>

      <div
        className="relative overflow-hidden rounded-xl border border-white/10 p-2.5"
        style={{
          background: `
            radial-gradient(120% 90% at 50% 0%, ${glow} 0%, transparent 55%),
            linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.18))
          `,
        }}
      >
        <div className="mb-2 flex items-end justify-between gap-2">
          <div
            className="flex h-11 w-14 items-center justify-center rounded-lg border shadow-inner transition-[background-color,color,border-color] duration-200"
            style={{
              background: adjusted.bg,
              color: adjusted.fg,
              borderColor: adjusted.polarity === 'light' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)',
            }}
            aria-hidden
          >
            <span
              className="select-none text-[17px] font-semibold leading-none tracking-tight"
              style={{ fontFamily: 'Literata, Georgia, serif' }}
            >
              Aa
            </span>
          </div>
          <div className="min-w-0 flex-1 pb-0.5 text-right">
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-500">Contrast</div>
            <div className="text-[13px] font-medium tabular-nums text-ink-100">{contrastText}</div>
            <div className="text-[10px] text-ink-500">paper + ink</div>
          </div>
        </div>

        <label className="sr-only" htmlFor="reader-page-light">
          Page brightness
        </label>
        <div className="relative pt-1">
          <div
            className="pointer-events-none absolute inset-x-0 top-1 h-2 rounded-full opacity-90"
            style={{ background: luminanceTrack(adjusted.polarity) }}
            aria-hidden
          />
          <input
            id="reader-page-light"
            type="range"
            min={BRIGHTNESS_MIN}
            max={BRIGHTNESS_MAX}
            step={1}
            value={value}
            onChange={(e) => onChange(clampBrightness(Number(e.target.value)))}
            className="page-light-range relative z-[1] w-full"
            aria-valuemin={BRIGHTNESS_MIN}
            aria-valuemax={BRIGHTNESS_MAX}
            aria-valuenow={value}
            aria-valuetext={`${label}, contrast ${contrastText}`}
          />
        </div>

        <div className="mt-1.5 grid grid-cols-3 gap-1">
          {BRIGHTNESS_ANCHORS.map((anchor) => {
            const active = Math.abs(value - anchor.value) <= 3
            return (
              <button
                key={anchor.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                title={anchor.hint}
                onClick={() => onChange(anchor.value)}
                className={
                  'rounded-md border px-1 py-1 text-center text-[10px] font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/50 ' +
                  (active
                    ? 'border-amber-300/40 bg-amber-300/10 text-amber-50'
                    : 'border-white/10 bg-white/[0.03] text-ink-300 hover:border-white/18 hover:bg-white/[0.06] hover:text-ink-100')
                }
              >
                {anchor.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function pageGlow(polarity: SurfacePolarity, brightness: number): string {
  const t = brightness / 100
  if (polarity === 'light') {
    return `rgba(255, 236, 200, ${0.08 + t * 0.28})`
  }
  return `rgba(212, 176, 120, ${0.04 + t * 0.22})`
}

function luminanceTrack(polarity: SurfacePolarity): string {
  if (polarity === 'light') {
    return 'linear-gradient(90deg, #3a3228 0%, #c4b49a 42%, #f7f3ea 78%, #ffffff 100%)'
  }
  return 'linear-gradient(90deg, #050504 0%, #1a1612 35%, #3a342c 70%, #6a5e50 100%)'
}
