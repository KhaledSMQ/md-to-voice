type Props = {
  at: number
  total: number
  onContinue: () => void
  onFromStart: () => void
  onDismiss: () => void
}

export function ResumeBanner({ at, total, onContinue, onFromStart, onDismiss }: Props) {
  return (
    <div
      className="absolute top-0 left-0 right-0 z-20 border-b border-amber-300/20 bg-ink-900/90 px-3 py-2.5 text-left shadow-md shadow-ink-950/30 backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-100">Picking up where you left off</p>
          <p className="mt-0.5 text-xs text-ink-400">
            The highlighted word is near word {at} of {total}. Use{' '}
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-ink-200">Space</kbd> or
            Play to continue from here, or start from the beginning.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-1.5">
          <button
            type="button"
            onClick={onContinue}
            className="whitespace-nowrap rounded-lg border border-amber-300/50 bg-amber-300/15 px-2.5 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-300/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
          >
            Continue
          </button>
          <button
            type="button"
            onClick={onFromStart}
            className="whitespace-nowrap rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-ink-200 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
          >
            From the start
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-400 transition hover:bg-white/10 hover:text-ink-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
            title="Hide this message (your position stays saved)"
            aria-label="Hide resume message"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}
