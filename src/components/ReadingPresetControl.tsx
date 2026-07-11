import { READING_PRESETS, type ReadingPresetId } from '../lib/readingPresets'

type Props = {
  value: ReadingPresetId
  onChange: (preset: ReadingPresetId) => void
}

export function ReadingPresetControl({ value, onChange }: Props) {
  return (
    <div className="rounded-lg px-2 py-1.5" role="group" aria-label="Reading theme">
      <div className="mb-1.5 text-[11px] text-ink-400">Reading theme</div>
      <div className="grid grid-cols-2 gap-1">
        {READING_PRESETS.map((preset) => {
          const active = preset.id === value
          return (
            <button
              key={preset.id}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              title={preset.hint}
              onClick={() => onChange(preset.id)}
              className={
                'flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/50 ' +
                (active
                  ? 'border-amber-300/40 bg-amber-300/10 text-amber-50'
                  : 'border-white/10 bg-white/[0.03] text-ink-200 hover:border-white/18 hover:bg-white/[0.06]')
              }
            >
              <span
                className="inline-flex h-4 w-4 shrink-0 overflow-hidden rounded-full border border-black/20 shadow-sm"
                aria-hidden
                style={{
                  background: `linear-gradient(135deg, ${preset.swatch.bg} 55%, ${preset.swatch.fg} 55%)`,
                }}
              />
              <span className="min-w-0 truncate text-[11px] font-medium leading-none">{preset.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
