import { useEffect, useId, useRef } from 'react'

export type PreviewSearchBarProps = {
  query: string
  onQueryChange: (q: string) => void
  matchCount: number
  /** 0-based index of the active match; -1 when none. */
  currentIndex: number
  onNext: () => void
  onPrev: () => void
  onClose: () => void
  /** Bumps to re-focus / select the input (e.g. repeated ⌘F). */
  focusNonce?: number
}

/**
 * Compact find bar for the markdown preview — intentionally quiet so it
 * doesn't compete with karaoke highlighting or the title chrome.
 */
export function PreviewSearchBar({
  query,
  onQueryChange,
  matchCount,
  currentIndex,
  onNext,
  onPrev,
  onClose,
  focusNonce = 0,
}: PreviewSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const statusId = useId()

  useEffect(() => {
    const t = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(t)
  }, [focusNonce])

  const status =
    query.trim().length === 0
      ? ''
      : matchCount === 0
        ? 'No results'
        : `${currentIndex + 1} of ${matchCount}`

  return (
    <div
      className="flex shrink-0 items-center gap-1.5 border-b border-white/5 bg-ink-950/50 px-3 py-1.5"
      role="search"
      aria-label="Find in preview"
    >
      <label htmlFor={inputId} className="sr-only">
        Find in preview
      </label>
      <span className="pointer-events-none text-ink-500" aria-hidden>
        <SearchIcon />
      </span>
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onClose()
            return
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            if (e.shiftKey) onPrev()
            else onNext()
            return
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            onNext()
            return
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            onPrev()
            return
          }
        }}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="Find in preview…"
        aria-describedby={statusId}
        className="min-w-0 flex-1 border-0 bg-transparent py-1 text-xs text-ink-100 placeholder-ink-500 focus:outline-none"
      />
      <span
        id={statusId}
        className="shrink-0 tabular-nums text-[11px] text-ink-500"
        aria-live="polite"
      >
        {status}
      </span>
      <button
        type="button"
        onClick={onPrev}
        disabled={matchCount === 0}
        title="Previous match (⇧Enter)"
        aria-label="Previous match"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-ink-400 transition-colors hover:border-white/10 hover:bg-white/[0.06] hover:text-ink-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40 disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronUpIcon />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={matchCount === 0}
        title="Next match (Enter)"
        aria-label="Next match"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-ink-400 transition-colors hover:border-white/10 hover:bg-white/[0.06] hover:text-ink-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40 disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronDownIcon />
      </button>
      <button
        type="button"
        onClick={onClose}
        title="Close (Esc)"
        aria-label="Close find"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-ink-500 transition-colors hover:border-white/10 hover:bg-white/[0.06] hover:text-ink-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40"
      >
        <CloseIcon />
      </button>
    </div>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  )
}

function ChevronUpIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
      <path d="m6 15 6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
    </svg>
  )
}
