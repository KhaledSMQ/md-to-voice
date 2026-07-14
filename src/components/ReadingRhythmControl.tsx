import {
  READING_LEADINGS,
  READING_PARAGRAPHS,
  READING_TRACKINGS,
  type ReadingLeadingId,
  type ReadingParagraphId,
  type ReadingTrackingId,
} from '../lib/readingRhythm'

type Props = {
  leading: ReadingLeadingId
  onLeadingChange: (id: ReadingLeadingId) => void
  tracking: ReadingTrackingId
  onTrackingChange: (id: ReadingTrackingId) => void
  paragraph: ReadingParagraphId
  onParagraphChange: (id: ReadingParagraphId) => void
}

function PresetRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly { id: T; label: string; hint: string }[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div className="rounded-lg px-2 py-1.5" role="group" aria-label={label}>
      <div className="mb-1.5 text-[11px] text-ink-400">{label}</div>
      <div
        className={
          options.length >= 5 ? 'grid grid-cols-5 gap-1' : 'grid grid-cols-4 gap-1'
        }
      >
        {options.map((opt) => {
          const active = opt.id === value
          return (
            <button
              key={opt.id}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              title={opt.hint}
              onClick={() => onChange(opt.id)}
              className={
                'rounded-md border px-1 py-1.5 text-center text-[10px] font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/50 ' +
                (active
                  ? 'border-amber-300/40 bg-amber-300/10 text-amber-50'
                  : 'border-white/10 bg-white/[0.03] text-ink-300 hover:border-white/18 hover:bg-white/[0.06] hover:text-ink-100')
              }
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Line height, letter spacing, and paragraph gap — science-informed presets. */
export function ReadingRhythmControl({
  leading,
  onLeadingChange,
  tracking,
  onTrackingChange,
  paragraph,
  onParagraphChange,
}: Props) {
  return (
    <div className="space-y-0.5">
      <PresetRow
        label="Line height"
        options={READING_LEADINGS}
        value={leading}
        onChange={onLeadingChange}
      />
      <PresetRow
        label="Letter spacing"
        options={READING_TRACKINGS}
        value={tracking}
        onChange={onTrackingChange}
      />
      <PresetRow
        label="Paragraph gap"
        options={READING_PARAGRAPHS}
        value={paragraph}
        onChange={onParagraphChange}
      />
    </div>
  )
}
