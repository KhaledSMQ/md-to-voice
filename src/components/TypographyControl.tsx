import {
  READING_TYPOGRAPHIES,
  type ReadingTypographyId,
} from '../lib/readingTypography'

type Props = {
  value: ReadingTypographyId
  onChange: (id: ReadingTypographyId) => void
}

export function TypographyControl({ value, onChange }: Props) {
  return (
    <div className="rounded-lg px-2 py-1.5" role="group" aria-label="Typography">
      <div className="mb-1.5 text-[11px] text-ink-400">Typography</div>
      <div className="grid grid-cols-2 gap-1">
        {READING_TYPOGRAPHIES.map((face) => {
          const active = face.id === value
          return (
            <button
              key={face.id}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              title={face.hint}
              onClick={() => onChange(face.id)}
              className={
                'flex flex-col items-start gap-0.5 rounded-lg border px-2 py-1.5 text-left transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/50 ' +
                (active
                  ? 'border-amber-300/40 bg-amber-300/10 text-amber-50'
                  : 'border-white/10 bg-white/[0.03] text-ink-200 hover:border-white/18 hover:bg-white/[0.06]')
              }
            >
              <span
                className="text-[15px] leading-none text-ink-50"
                style={{ fontFamily: face.stack }}
                aria-hidden
              >
                {face.sample}
              </span>
              <span className="min-w-0 truncate text-[10px] font-medium leading-none text-ink-300">
                {face.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
