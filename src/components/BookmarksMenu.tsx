import { useEffect, useId, useRef, useState } from 'react'
import type { DocumentBookmark } from '../lib/bookmarks'

type Props = {
  bookmarks: DocumentBookmark[]
  onJump: (bookmark: DocumentBookmark) => void
  onRemove: (id: string) => void
  onClearAll: () => void
}

export function BookmarksMenu({ bookmarks, onJump, onRemove, onClearAll }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const count = bookmarks.length

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (count === 0) return null

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        title="Bookmarks (')"
        className="rounded border border-amber-300/25 bg-amber-300/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-100/90 transition hover:bg-amber-300/20"
      >
        Bookmarks ({count})
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute bottom-[calc(100%+0.35rem)] right-0 z-50 w-64 max-h-[min(50vh,20rem)] overflow-y-auto rounded-xl border border-white/10 bg-ink-950/95 p-1.5 shadow-xl shadow-ink-950/50 backdrop-blur"
        >
          <ul className="flex flex-col gap-0.5">
            {bookmarks.map((b) => (
              <li key={b.id} className="flex items-stretch gap-0.5">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onJump(b)
                    setOpen(false)
                  }}
                  className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-[11px] text-ink-100 transition hover:bg-amber-300/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/40"
                  title={`Jump to “${b.label}”`}
                >
                  <span className="truncate">{b.label}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(b.id)}
                  className="shrink-0 rounded-lg px-2 text-[11px] text-ink-500 transition hover:bg-white/[0.06] hover:text-ink-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/40"
                  aria-label={`Remove bookmark “${b.label}”`}
                  title="Remove"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClearAll()
              setOpen(false)
            }}
            className="mt-1 w-full rounded-lg border border-white/[0.06] px-2 py-1.5 text-left text-[10px] text-ink-400 transition hover:bg-white/[0.05] hover:text-ink-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/40"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
