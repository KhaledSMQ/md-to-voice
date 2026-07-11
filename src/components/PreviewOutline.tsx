import { useEffect, useId, useRef } from 'react'
import type { OutlineItem } from '../lib/documentOutline'

type Props = {
  items: OutlineItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
  activeId: string | null
  onSelect: (id: string) => void
}

/**
 * Quiet, collapsible section rail for the markdown preview.
 * Collapsed by default so it stays out of the way while reading.
 */
export function PreviewOutline({ items, open, onOpenChange, activeId, onSelect }: Props) {
  const listId = useId()
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open || !activeId) return
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [open, activeId])

  if (items.length === 0) return null

  return (
    <aside
      className={
        'preview-outline flex h-full min-h-0 shrink-0 flex-col border-r border-white/[0.06] bg-ink-950/25 transition-[width] duration-200 ease-out ' +
        (open ? 'w-[11.5rem] sm:w-[13rem]' : 'w-9')
      }
      aria-label="Document sections"
    >
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-white/[0.05] px-1">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          aria-controls={listId}
          title={open ? 'Hide sections' : 'Show sections'}
          className={
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-ink-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40 ' +
            (open
              ? 'border-amber-300/25 bg-amber-300/10 text-amber-100'
              : 'border-transparent hover:border-white/10 hover:bg-white/[0.06] hover:text-ink-200')
          }
        >
          <span className="sr-only">{open ? 'Hide sections' : 'Show sections'}</span>
          <ListIcon />
        </button>
        {open && (
          <span className="min-w-0 truncate text-[10px] font-medium uppercase tracking-[0.08em] text-ink-500">
            Sections
          </span>
        )}
      </div>

      {open ? (
        <nav
          id={listId}
          className="preview-outline-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-2"
        >
          <ul className="space-y-0.5">
            {items.map((item) => {
              const isActive = item.id === activeId
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    ref={isActive ? activeRef : undefined}
                    onClick={() => onSelect(item.id)}
                    title={item.text}
                    aria-current={isActive ? 'location' : undefined}
                    className={
                      'group relative w-full rounded-md py-1.5 pr-2 text-left text-[11px] leading-snug transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40 ' +
                      (isActive
                        ? 'bg-amber-300/[0.1] text-ink-50'
                        : 'text-ink-400 hover:bg-white/[0.04] hover:text-ink-200')
                    }
                    style={{ paddingLeft: `${0.4 + (item.level - 1) * 0.55}rem` }}
                  >
                    <span
                      className={
                        'absolute bottom-1.5 left-0 top-1.5 w-[2px] rounded-full transition-opacity ' +
                        (isActive
                          ? 'bg-amber-300/80 opacity-100'
                          : 'bg-white/15 opacity-0 group-hover:opacity-60')
                      }
                      aria-hidden
                    />
                    <span className="line-clamp-2">{item.text}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-hidden py-2" aria-hidden>
          {items.slice(0, 10).map((item) => (
            <span
              key={item.id}
              className={
                'rounded-full transition-colors ' +
                (item.id === activeId
                  ? 'h-1.5 w-1.5 bg-amber-300/75'
                  : 'h-1 w-1 bg-white/15')
              }
            />
          ))}
          {items.length > 10 && <span className="text-[9px] leading-none text-ink-600">+</span>}
        </div>
      )}
    </aside>
  )
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M8 6h13M8 12h13M8 18h13" strokeLinecap="round" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeLinecap="round" />
    </svg>
  )
}
