import {
  MEASURE_WIDTH_MAX,
  MEASURE_WIDTH_MIN,
  MEASURE_WIDTH_PRESETS,
  clampMeasureWidth,
} from '../lib/readingPresets'

type Props = {
  value: number
  onChange: (ch: number) => void
}

export function MeasureWidthControl({ value, onChange }: Props) {
  const bump = (delta: number) => onChange(clampMeasureWidth(value + delta))
  const display = value >= MEASURE_WIDTH_MAX ? 'Full' : `${value}ch`

  return (
    <div className="rounded-lg px-2 py-1.5" role="group" aria-label="Line width">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-ink-400">Line width</span>
        <div className="inline-flex items-center rounded-md border border-white/10 bg-white/[0.04]">
          <button
            type="button"
            onClick={() => bump(-4)}
            disabled={value <= MEASURE_WIDTH_MIN}
            title="Narrower"
            aria-label="Narrower line width"
            className="inline-flex h-6 w-6 items-center justify-center rounded-l-md text-[11px] text-ink-300 transition-colors hover:bg-white/[0.08] hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/50"
          >
            −
          </button>
          <span
            className="min-w-[2.75rem] border-x border-white/10 px-1 text-center text-[10px] tabular-nums text-ink-400"
            aria-live="polite"
          >
            {display}
          </span>
          <button
            type="button"
            onClick={() => bump(4)}
            disabled={value >= MEASURE_WIDTH_MAX}
            title="Wider"
            aria-label="Wider line width"
            className="inline-flex h-6 w-6 items-center justify-center rounded-r-md text-[11px] text-ink-300 transition-colors hover:bg-white/[0.08] hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/50"
          >
            +
          </button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {MEASURE_WIDTH_PRESETS.map((preset) => {
          const active = value === preset.ch
          return (
            <button
              key={preset.id}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              title={`${preset.label} (${preset.ch === 100 ? 'fill panel' : `${preset.ch} characters`})`}
              onClick={() => onChange(preset.ch)}
              className={
                'rounded-md border px-1 py-1.5 text-center text-[10px] font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/50 ' +
                (active
                  ? 'border-amber-300/40 bg-amber-300/10 text-amber-50'
                  : 'border-white/10 bg-white/[0.03] text-ink-300 hover:border-white/18 hover:bg-white/[0.06] hover:text-ink-100')
              }
            >
              {preset.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
