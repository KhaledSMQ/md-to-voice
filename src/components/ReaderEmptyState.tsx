type Props = {
  onOpenFileTab: () => void
  onOpenPasteTab: () => void
  onWriteHere: () => void
  onPasteFromClipboard: () => void
}

export function ReaderEmptyState({
  onOpenFileTab,
  onOpenPasteTab,
  onWriteHere,
  onPasteFromClipboard,
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-8 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.04]">
        <svg
          viewBox="0 0 24 24"
          className="h-9 w-9 text-ink-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
          <path d="M8 14h8" />
          <path d="M8 18h4" />
        </svg>
        <span className="sr-only">Empty document</span>
      </div>
      <div>
        <p className="text-sm font-medium text-ink-200">Nothing to read yet</p>
        <p className="mt-1 max-w-[20rem] text-xs text-ink-500">
          Add something to hear — from a file, the sidebar, or the pen editor. Everything stays on
          this device.
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={onOpenFileTab}
          className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-medium text-ink-100 transition hover:bg-white/10"
        >
          Upload file
        </button>
        <button
          type="button"
          onClick={onPasteFromClipboard}
          className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-medium text-ink-100 transition hover:bg-white/10"
        >
          Paste
        </button>
        <button
          type="button"
          onClick={onOpenPasteTab}
          className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-medium text-ink-100 transition hover:bg-white/10"
        >
          Edit / paste
        </button>
        <button
          type="button"
          onClick={onWriteHere}
          className="rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs font-medium text-amber-100 transition hover:bg-amber-300/20"
        >
          Write here
        </button>
      </div>
    </div>
  )
}
