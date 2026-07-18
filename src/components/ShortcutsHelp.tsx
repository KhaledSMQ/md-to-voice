import { useEffect, useId, useRef } from 'react'

type ShortcutRow = {
  keys: string[]
  /** How to join keys visually: chord (+) or alternatives (/). */
  join?: 'chord' | 'alt'
  action: string
}

const SHORTCUTS: ShortcutRow[] = [
  { keys: ['Space'], action: 'Play / pause' },
  { keys: ['Esc'], action: 'Stop · exit edit / sections / focus / overlay' },
  { keys: ['[', ']'], join: 'alt', action: 'Previous / next chunk' },
  { keys: ['←', '→'], join: 'alt', action: 'Previous / next chunk' },
  { keys: ['J', 'K'], join: 'alt', action: 'Next / previous sentence' },
  { keys: [',', '.'], join: 'alt', action: 'Slower / faster' },
  { keys: ['B'], action: 'Toggle bookmark at playhead' },
  { keys: ["'"], action: 'Jump to / cycle bookmarks' },
  { keys: ['/'], action: 'Toggle preview / edit' },
  { keys: ['O'], action: 'Toggle sections sidebar' },
  { keys: ['F'], action: 'Toggle focus mode' },
  { keys: ['T'], action: 'Toggle teleprompter' },
  { keys: ['⌘', 'F'], join: 'chord', action: 'Find in preview' },
  { keys: ['⌘', 'G'], join: 'chord', action: 'Next find match' },
  { keys: ['⇧', '⌘', 'G'], join: 'chord', action: 'Previous find match' },
  { keys: ['⌘', 'V'], join: 'chord', action: 'Paste into empty doc · else new file' },
  { keys: ['⌘', '+', '−'], join: 'chord', action: 'Zoom preview text' },
  { keys: ['⌘', 'Scroll'], join: 'chord', action: 'Zoom preview text' },
  { keys: ['⌘', '⇧', 'Scroll'], join: 'chord', action: 'Adjust line width' },
  { keys: ['⌘', '0'], join: 'chord', action: 'Reset zoom & line width' },
  { keys: ['⌘', '1–9'], join: 'chord', action: 'Open recent document' },
  { keys: ['⌘', '⌥', '↑', '↓'], join: 'chord', action: 'Cycle recent documents' },
  { keys: ['?'], action: 'Show this help' },
]

type Props = {
  open: boolean
  onClose: () => void
  backend?: string | null
}

export function ShortcutsHelp({ open, onClose, backend }: Props) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const t = requestAnimationFrame(() => closeRef.current?.focus())
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(t)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-ink-950/70 px-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[min(90vh,40rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-ink-900/95 p-5 shadow-2xl shadow-ink-950/50"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-ink-50">
              Keyboard shortcuts
            </h2>
            <p className="mt-0.5 text-xs text-ink-500">Press ? anytime to open this help.</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-ink-400 transition-colors hover:border-white/10 hover:bg-white/[0.06] hover:text-ink-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
            aria-label="Close help"
          >
            <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <ul className="mt-4 space-y-1">
          {SHORTCUTS.map((row) => (
            <li
              key={row.action + row.keys.join('')}
              className="flex items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-sm"
            >
              <span className="text-ink-300">{row.action}</span>
              <span className="flex shrink-0 items-center gap-1">
                {row.keys.map((k, i) => (
                  <span key={`${row.action}-${k}-${i}`} className="flex items-center gap-1">
                    {i > 0 && (
                      <span className="text-[10px] text-ink-600">
                        {row.join === 'alt' ? '/' : '+'}
                      </span>
                    )}
                    <kbd className="rounded-md border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-ink-200">
                      {k}
                    </kbd>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>

        {backend != null && (
          <p className="mt-4 border-t border-white/[0.06] pt-3 text-[11px] text-ink-500">
            TTS backend:{' '}
            <span className="font-mono text-ink-300">{backend || 'detecting…'}</span>
          </p>
        )}
      </div>
    </div>
  )
}
