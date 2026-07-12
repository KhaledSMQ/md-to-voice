import { FONT_SIZE_MAX, FONT_SIZE_MIN } from '../lib/appSettings'

type Props = {
  fontSize: number
  onChange: (size: number) => void
  compact?: boolean
}

export function FontSizeControl({ fontSize, onChange, compact = false }: Props) {
  const bump = (delta: number) => {
    onChange(Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, fontSize + delta)))
  }

  return (
    <div
      className="inline-flex shrink-0 items-center rounded-lg border border-white/10 bg-white/[0.04]"
      role="group"
      aria-label="Font size"
    >
      <button
        type="button"
        onClick={() => bump(-1)}
        disabled={fontSize <= FONT_SIZE_MIN}
        title="Decrease font size (⌘−)"
        aria-label="Decrease font size"
        className={
          compact
            ? 'inline-flex h-7 w-6 items-center justify-center rounded-l-lg text-[11px] font-semibold text-ink-300 transition-colors hover:bg-white/[0.08] hover:text-ink-100 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50'
            : 'inline-flex h-8 w-7 items-center justify-center rounded-l-lg text-xs font-semibold text-ink-300 transition-colors hover:bg-white/[0.08] hover:text-ink-100 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50'
        }
      >
        A−
      </button>
      <span
        className={
          compact
            ? 'min-w-[1.75rem] border-x border-white/10 px-1 text-center text-[10px] tabular-nums text-ink-400'
            : 'hidden min-w-[2rem] border-x border-white/10 px-1 text-center text-[10px] tabular-nums text-ink-400 sm:inline'
        }
        aria-hidden
      >
        {fontSize}
      </span>
      <button
        type="button"
        onClick={() => bump(1)}
        disabled={fontSize >= FONT_SIZE_MAX}
        title="Increase font size (⌘+)"
        aria-label="Increase font size"
        className={
          compact
            ? 'inline-flex h-7 w-6 items-center justify-center rounded-r-lg text-[11px] font-semibold text-ink-300 transition-colors hover:bg-white/[0.08] hover:text-ink-100 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50'
            : 'inline-flex h-8 w-7 items-center justify-center rounded-r-lg text-xs font-semibold text-ink-300 transition-colors hover:bg-white/[0.08] hover:text-ink-100 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50'
        }
      >
        A+
      </button>
    </div>
  )
}
