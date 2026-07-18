import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { saveAppSettings } from '../lib/appSettings'
import { sortRecents, type RecentsSort, type StoredDocument } from '../lib/documentStore'

type Props = {
  documents: StoredDocument[]
  activeId: string
  title: string
  onSelectDocument: (id: string) => void
  onNewDocument: () => void
  onDeleteDocument: (id: string) => void
  onOpenFile: () => void
  recentsSort: RecentsSort
  onRecentsSortChange: (sort: RecentsSort) => void
}

function formatWhen(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function recentsSortButtonLabel(s: RecentsSort): string {
  switch (s) {
    case 'played':
      return 'Last played'
    case 'added':
      return 'Date added'
    case 'name':
      return 'Name A–Z'
    default: {
      const _e: never = s
      return _e
    }
  }
}

type ResumeView = { pct: number; showBar: true } | { pct: null; showBar: false; hint: 'none' | 'stale' }

function resumeViewFromStore(d: StoredDocument): ResumeView {
  const r = d.resumeWordIdx
  if (r == null || r <= 0) return { pct: null, showBar: false, hint: 'none' }
  const wc = d.wordCount
  const lastIdx = d.lastWordGlobalIdx
  if (wc == null || lastIdx == null) return { pct: null, showBar: false, hint: 'stale' }
  if (wc === 0 || lastIdx < 0) return { pct: null, showBar: false, hint: 'stale' }
  const clamped = Math.min(r, lastIdx)
  const pct = lastIdx > 0 ? Math.min(100, Math.round((clamped / lastIdx) * 100)) : 0
  return { pct, showBar: true }
}

export function RecentsList({
  documents,
  activeId,
  title,
  onSelectDocument,
  onNewDocument,
  onDeleteDocument,
  onOpenFile,
  recentsSort,
  onRecentsSortChange,
}: Props) {
  const [recentsSearch, setRecentsSearch] = useState('')
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const sortMenuWrapRef = useRef<HTMLDivElement>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null)
  const deleteCancelRef = useRef<HTMLButtonElement>(null)

  const recentsVisible = useMemo(() => {
    const q = recentsSearch.trim().toLowerCase()
    const getTitle = (d: StoredDocument) => (d.id === activeId ? title : d.title)
    const filtered = q
      ? documents.filter((d) => {
          if (getTitle(d).toLowerCase().includes(q)) return true
          if (d.markdown.toLowerCase().includes(q)) return true
          return false
        })
      : documents
    return sortRecents(filtered, recentsSort, getTitle)
  }, [documents, recentsSearch, recentsSort, activeId, title])

  const changeSort = (s: RecentsSort) => {
    onRecentsSortChange(s)
    saveAppSettings({ recentsSort: s })
    setSortMenuOpen(false)
  }

  useEffect(() => {
    if (!sortMenuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!sortMenuWrapRef.current?.contains(e.target as Node)) setSortMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSortMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [sortMenuOpen])

  useEffect(() => {
    if (!pendingDelete) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingDelete(null)
    }
    document.addEventListener('keydown', onKey)
    const raf = requestAnimationFrame(() => deleteCancelRef.current?.focus())
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
    }
  }, [pendingDelete])

  const deleteDialog =
    pendingDelete &&
    createPortal(
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        role="presentation"
      >
        <button
          type="button"
          className="absolute inset-0 bg-ink-950/75 backdrop-blur-sm"
          aria-label="Dismiss"
          onClick={() => setPendingDelete(null)}
        />
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-doc-title"
          aria-describedby="delete-doc-desc"
          className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-4 shadow-2xl shadow-ink-950/80"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="delete-doc-title" className="text-sm font-semibold text-ink-50">
            Remove this document?
          </h3>
          <p id="delete-doc-desc" className="mt-2 text-sm leading-relaxed text-ink-300">
            <span className="font-mono text-ink-200">“{pendingDelete.title}”</span> will be removed
            from this device. This can’t be undone.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <button
              ref={deleteCancelRef}
              type="button"
              onClick={() => setPendingDelete(null)}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-ink-200 transition hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onDeleteDocument(pendingDelete.id)
                setPendingDelete(null)
              }}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-200 transition hover:bg-red-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
            >
              Remove
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )

  return (
    <>
      <section className="library-section space-y-2" aria-labelledby="recents-heading">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="recents-heading"
            className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500"
          >
            <IconStack className="h-3 w-3 text-ink-400" />
            Library
          </h2>
          <button
            type="button"
            onClick={onNewDocument}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-ink-300 transition hover:bg-amber-300/10 hover:text-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
          >
            <IconPlus className="h-3 w-3" />
            New
          </button>
        </div>

        {documents.length > 0 && (
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <label htmlFor="recents-search" className="sr-only">
                Search library
              </label>
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500">
                <IconSearch className="h-3 w-3" />
              </span>
              <input
                id="recents-search"
                type="search"
                value={recentsSearch}
                onChange={(e) => setRecentsSearch(e.target.value)}
                autoComplete="off"
                placeholder="Search…"
                className="library-search w-full rounded-lg border border-white/[0.08] bg-ink-950/40 py-1.5 pl-8 pr-2.5 text-[11px] text-ink-100 placeholder-ink-500 transition-[border-color,box-shadow,background-color] focus:border-amber-300/35 focus:bg-ink-950/55 focus:outline-none focus:ring-2 focus:ring-amber-300/20"
              />
            </div>
            <div className="relative shrink-0" ref={sortMenuWrapRef}>
              <span id="recents-sort-label" className="sr-only">
                Change sort order
              </span>
              <button
                type="button"
                id="recents-sort-trigger"
                aria-haspopup="menu"
                aria-expanded={sortMenuOpen}
                aria-controls="recents-sort-menu"
                title={`Sort: ${recentsSortButtonLabel(recentsSort)}`}
                aria-label={`Change sort. Current: ${recentsSortButtonLabel(recentsSort)}.`}
                onClick={() => setSortMenuOpen((o) => !o)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-ink-950/40 text-ink-400 transition hover:border-white/15 hover:bg-white/[0.05] hover:text-ink-100 focus:outline-none focus:ring-2 focus:ring-amber-300/20 aria-expanded:border-amber-300/30 aria-expanded:bg-amber-300/[0.08] aria-expanded:text-amber-100"
              >
                <IconSortAction
                  className={'h-3 w-3 ' + (sortMenuOpen ? 'text-amber-200/90' : '')}
                  aria-hidden
                />
              </button>
              {sortMenuOpen && (
                <div
                  id="recents-sort-menu"
                  role="menu"
                  aria-labelledby="recents-sort-label"
                  className="absolute right-0 top-[calc(100%+4px)] z-20 min-w-[12.5rem] overflow-hidden rounded-lg border border-white/10 bg-ink-900/95 py-1 shadow-lg shadow-ink-950/60 ring-1 ring-white/5 backdrop-blur-sm"
                >
                  {(
                    [
                      { id: 'played' as const, label: 'Last played', icon: IconSortPlayed },
                      { id: 'added' as const, label: 'Date added', icon: IconSortAdded },
                      { id: 'name' as const, label: 'File name (A–Z)', icon: IconSortName },
                    ] as const
                  ).map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="menuitem"
                      onClick={() => changeSort(id)}
                      className={
                        'flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-xs transition ' +
                        (recentsSort === id
                          ? 'bg-amber-300/10 text-amber-100'
                          : 'text-ink-200 hover:bg-white/[0.06] hover:text-ink-50')
                      }
                    >
                      <span className="shrink-0 text-ink-400" aria-hidden>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 font-medium leading-snug">{label}</span>
                      {recentsSort === id && (
                        <IconCheck className="h-3.5 w-3.5 shrink-0 text-amber-300/90" aria-hidden />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {documents.length === 0 ? (
          <div className="px-1 py-3 text-center">
            <p className="text-xs text-ink-400">No saved documents</p>
            <p className="mt-1 text-[11px] text-ink-500 leading-relaxed">
              Drop a <span className="text-ink-300">.md</span> onto the window, or open one above.
            </p>
            <button
              type="button"
              onClick={onOpenFile}
              className="mt-3 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-ink-200 transition hover:bg-white/10"
            >
              Open file
            </button>
          </div>
        ) : recentsVisible.length === 0 ? (
          <div className="px-1 py-3 text-center">
            <p className="text-xs text-ink-400">No matches</p>
            <p className="mt-1 text-[11px] text-ink-500">
              Clear search to see all {documents.length} document
              {documents.length === 1 ? '' : 's'}.
            </p>
          </div>
        ) : (
          <ul
            className="studio-shelf-list library-list space-y-0.5"
            aria-label="Document history"
          >
            {recentsVisible.map((d) => {
              const isActive = d.id === activeId
              const displayTitle = d.id === activeId ? title : d.title
              const rv = resumeViewFromStore(d)
              const when = d.lastPlayedAt
                ? `Played ${formatWhen(d.lastPlayedAt)}`
                : `Saved ${formatWhen(d.updatedAt)}`
              let resumeLabel: string | null
              if (rv.showBar) {
                resumeLabel = `~${rv.pct}%`
              } else {
                resumeLabel =
                  'hint' in rv && rv.hint === 'stale' && d.resumeWordIdx && d.resumeWordIdx > 0
                    ? 'Resume'
                    : null
              }
              const progressPct = rv.showBar ? rv.pct : 0
              return (
                <li key={d.id} className="group">
                  <div
                    className={
                      'library-item flex items-stretch gap-0.5 rounded-lg transition-colors ' +
                      (isActive
                        ? 'is-active bg-amber-300/[0.09] ring-1 ring-inset ring-amber-300/30'
                        : 'hover:bg-white/[0.04]')
                    }
                  >
                    <button
                      type="button"
                      onClick={() => onSelectDocument(d.id)}
                      className="min-w-0 flex-1 rounded-lg px-2.5 py-2 pr-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-300/40"
                      title={d.title}
                    >
                      <div
                        className={
                          'truncate font-mono text-[11px] leading-snug ' +
                          (isActive ? 'text-amber-100' : 'text-ink-100')
                        }
                      >
                        {displayTitle}
                      </div>
                      <div className="mt-1 flex min-w-0 items-center gap-x-1.5 text-[9px] leading-none text-ink-500">
                        <span className="inline-flex min-w-0 items-center gap-0.5 truncate">
                          <IconClock className="h-2.5 w-2.5 shrink-0 opacity-80" />
                          <span className="truncate">{when}</span>
                        </span>
                        {resumeLabel && (
                          <>
                            <span className="text-ink-600" aria-hidden>
                              ·
                            </span>
                            <span className="shrink-0 text-amber-200/80 tabular-nums">{resumeLabel}</span>
                          </>
                        )}
                      </div>
                      <div
                        className={
                          'mt-1.5 h-0.5 overflow-hidden rounded-full ' +
                          (rv.showBar ? 'bg-white/10' : 'bg-white/[0.04]')
                        }
                        role={rv.showBar ? 'progressbar' : undefined}
                        aria-valuenow={rv.showBar ? progressPct : undefined}
                        aria-valuemin={rv.showBar ? 0 : undefined}
                        aria-valuemax={rv.showBar ? 100 : undefined}
                        aria-hidden={rv.showBar ? undefined : true}
                      >
                        {rv.showBar && (
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-500/50 to-amber-300/70"
                            style={{ width: `${progressPct}%` }}
                          />
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPendingDelete({ id: d.id, title: d.id === activeId ? title : d.title })
                      }}
                      title="Remove from this device"
                      className="shrink-0 self-stretch rounded-r-lg px-1.5 text-ink-500 transition hover:bg-red-500/10 hover:text-red-200 focus:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-amber-300/50 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      aria-label={`Remove ${d.title} from this device`}
                    >
                      <IconTrash className="mx-0.5 h-3 w-3" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      {deleteDialog}
    </>
  )
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function IconSortPlayed({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M10.25 8v8L16 12l-5.75-4Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconSortAdded({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <path d="M12 14v4" />
      <path d="M10 16h4" />
    </svg>
  )
}

function IconSortName({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19 8 3 12 19" />
      <path d="M5.7 14h4.5" />
      <path d="M15 3h6" />
      <path d="M15 3 21 12" />
      <path d="M15 21h6" />
    </svg>
  )
}

function IconSortAction({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 4v16" />
      <path d="M8 8l4-4 4 4" />
      <path d="M8 16l4 4 4-4" />
    </svg>
  )
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function IconStack({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="M2 17 12 22l10-5" />
      <path d="M2 12 12 17l10-5" />
    </svg>
  )
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}
