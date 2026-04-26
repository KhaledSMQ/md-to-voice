import { useMemo, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileUploader } from './FileUploader'
import { loadAppSettings, saveAppSettings } from '../lib/appSettings'
import { parseDocument } from '../lib/parseDocument'
import { sortRecents, type RecentsSort, type StoredDocument } from '../lib/documentStore'

type SourceTab = 'file' | 'edit'

type Props = {
  markdown: string
  onMarkdownFromEdit: (text: string) => void
  onFile: (name: string, text: string) => void
  title: string
  onTitleChange: (title: string) => void
  sourceTab: SourceTab
  onSourceTab: (t: SourceTab) => void
  documents: StoredDocument[]
  activeId: string
  onSelectDocument: (id: string) => void
  onNewDocument: () => void
  onDeleteDocument: (id: string) => void
}

const tabBase =
  'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50'

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

export function SourcePanel({
  markdown,
  onMarkdownFromEdit,
  onFile,
  title,
  onTitleChange,
  sourceTab,
  onSourceTab,
  documents,
  activeId,
  onSelectDocument,
  onNewDocument,
  onDeleteDocument,
}: Props) {
  const [nameEditing, setNameEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState(title)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [recentsSearch, setRecentsSearch] = useState('')
  const [recentsSort, setRecentsSort] = useState<RecentsSort>(() => loadAppSettings().recentsSort)
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

  const onRecentsSortChange = (s: RecentsSort) => {
    setRecentsSort(s)
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
    requestAnimationFrame(() => deleteCancelRef.current?.focus())
    return () => document.removeEventListener('keydown', onKey)
  }, [pendingDelete])

  const liveDoc = useMemo(() => {
    const p = parseDocument(markdown)
    const w = p.words
    if (w.length === 0) {
      return { wordCount: 0, lastIdx: 0, resumePct: null as number | null }
    }
    const lastIdx = w[w.length - 1]!.idx
    const fromList = documents.find((d) => d.id === activeId)
    const r = fromList?.resumeWordIdx
    if (r == null || r <= 0) {
      return { wordCount: w.length, lastIdx, resumePct: null as number | null }
    }
    const clamped = Math.min(r, lastIdx)
    const resumePct = lastIdx > 0 ? Math.min(100, Math.round((clamped / lastIdx) * 100)) : null
    return { wordCount: w.length, lastIdx, resumePct }
  }, [markdown, activeId, documents])

  useEffect(() => {
    if (nameEditing) return
    setNameDraft(title)
  }, [title, nameEditing])

  useEffect(() => {
    if (nameEditing) {
      requestAnimationFrame(() => {
        const el = nameInputRef.current
        el?.focus()
        el?.select()
      })
    }
  }, [nameEditing])

  const commitName = () => {
    onTitleChange(nameDraft.trim() || 'Untitled')
    setNameEditing(false)
  }

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
    <div className="space-y-5">
      <div
        className="flex gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5"
        role="tablist"
        aria-label="Markdown source"
      >
        <button
          type="button"
          role="tab"
          id="source-tab-file"
          aria-selected={sourceTab === 'file'}
          onClick={() => onSourceTab('file')}
          className={
            sourceTab === 'file'
              ? `${tabBase} bg-white/10 text-ink-100 shadow-sm`
              : `${tabBase} text-ink-400 hover:text-ink-200`
          }
        >
          File
        </button>
        <button
          type="button"
          role="tab"
          id="source-tab-edit"
          aria-selected={sourceTab === 'edit'}
          onClick={() => onSourceTab('edit')}
          className={
            sourceTab === 'edit'
              ? `${tabBase} bg-white/10 text-ink-100 shadow-sm`
              : `${tabBase} text-ink-400 hover:text-ink-200`
          }
        >
          Edit / paste
        </button>
      </div>

      {sourceTab === 'file' && (
        <div role="tabpanel" aria-labelledby="source-tab-file" className="space-y-3">
          <FileUploader onFile={onFile} />
        </div>
      )}

      {sourceTab === 'edit' && (
        <div role="tabpanel" aria-labelledby="source-tab-edit" className="space-y-2">
          <p className="text-xs text-ink-500">
            Type or paste Markdown here; the reader and playback update as you go.
          </p>
          <label htmlFor="md-editor" className="sr-only">
            Markdown content
          </label>
          <textarea
            id="md-editor"
            spellCheck={false}
            value={markdown}
            onChange={(e) => onMarkdownFromEdit(e.target.value)}
            className="w-full min-h-[min(50vh,320px)] resize-y rounded-xl border border-white/10 bg-ink-950/50 px-3 py-2.5 text-sm font-mono text-ink-100 leading-relaxed placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
            placeholder="Paste or type markdown…"
          />
          <div className="text-xs text-ink-500 tabular-nums">
            {markdown.length.toLocaleString()} characters ·{' '}
            {markdown.split(/\r?\n/).length.toLocaleString()} lines
          </div>
        </div>
      )}

      <section
        className="rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.02] p-3.5"
        aria-labelledby="current-doc-heading"
      >
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
          <span className="text-ink-300" aria-hidden>
            <IconDoc className="h-3.5 w-3.5" />
          </span>
          <h2 id="current-doc-heading">Current document</h2>
        </div>

        <div className="mt-3 min-h-[1.75rem]">
          {nameEditing ? (
            <input
              ref={nameInputRef}
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitName()
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setNameDraft(title)
                  setNameEditing(false)
                }
              }}
              spellCheck={false}
              className="w-full rounded-lg border border-amber-300/30 bg-ink-950/50 px-2.5 py-1.5 font-mono text-sm text-ink-100 focus:outline-none focus:ring-2 focus:ring-amber-300/40"
              aria-label="Document name"
            />
          ) : (
            <button
              type="button"
              onDoubleClick={() => {
                setNameDraft(title)
                setNameEditing(true)
              }}
              title="Double-click to rename"
              className="w-full text-left font-mono text-sm font-medium text-ink-100 leading-snug hover:text-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50 rounded"
            >
              <span className="line-clamp-2 break-all">{title}</span>
            </button>
          )}
        </div>

        <p className="mt-2 text-xs text-ink-400">
          {liveDoc.wordCount.toLocaleString()} word{liveDoc.wordCount === 1 ? '' : 's'}
          {liveDoc.resumePct != null && liveDoc.resumePct > 0 && (
            <span className="text-amber-200/90"> · saved position ~{liveDoc.resumePct}%</span>
          )}
        </p>
        <p className="mt-1.5 text-[10px] leading-relaxed text-ink-500">
          Double-click the title to rename. Text stays in this browser.
        </p>
      </section>

      <section className="space-y-2.5" aria-labelledby="recents-heading">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="recents-heading"
            className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500"
          >
            <IconStack className="h-3.5 w-3.5 text-ink-400" />
            Recents
          </h2>
          <button
            type="button"
            onClick={onNewDocument}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-[11px] font-medium text-ink-200 transition hover:border-amber-300/20 hover:bg-amber-300/10 hover:text-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
          >
            <IconPlus className="h-3.5 w-3.5" />
            New
          </button>
        </div>

        {documents.length > 0 && (
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <label htmlFor="recents-search" className="sr-only">
                Search recents
              </label>
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500">
                <IconSearch className="h-3.5 w-3.5" />
              </span>
              <input
                id="recents-search"
                type="search"
                value={recentsSearch}
                onChange={(e) => setRecentsSearch(e.target.value)}
                autoComplete="off"
                placeholder="Search…"
                className="w-full rounded-lg border border-white/10 bg-ink-950/40 py-1.5 pl-8 pr-2.5 text-xs text-ink-100 placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
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
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-ink-950/40 text-ink-300 transition hover:border-white/15 hover:bg-white/[0.05] hover:text-ink-100 focus:outline-none focus:ring-2 focus:ring-amber-300/30 aria-expanded:bg-white/[0.04]"
              >
                <IconSortAction
                  className={
                    'h-3.5 w-3.5 ' + (sortMenuOpen ? 'text-amber-200/90' : '')
                  }
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
                      onClick={() => onRecentsSortChange(id)}
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
          <div className="rounded-xl border border-dashed border-white/10 bg-ink-950/25 px-4 py-6 text-center">
            <p className="text-sm text-ink-300">No saved documents</p>
            <p className="mt-1.5 text-xs text-ink-500 leading-relaxed">
              Add a <span className="text-ink-300">.md</span> file, or use{' '}
              <span className="text-ink-300">Edit / paste</span>. New items appear here with playback
              position.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => onSourceTab('file')}
                className="rounded-lg border border-white/10 bg-white/[0.05] py-1.5 text-xs text-ink-200 transition hover:bg-white/10"
              >
                File tab
              </button>
              <button
                type="button"
                onClick={() => onSourceTab('edit')}
                className="rounded-lg border border-white/10 bg-white/[0.05] py-1.5 text-xs text-ink-200 transition hover:bg-white/10"
              >
                Edit / paste
              </button>
            </div>
          </div>
        ) : recentsVisible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-ink-950/25 px-4 py-5 text-center">
            <p className="text-sm text-ink-300">No matches</p>
            <p className="mt-1.5 text-xs text-ink-500">
              Try another search, or clear the search box to see all {documents.length} document
              {documents.length === 1 ? '' : 's'}.
            </p>
          </div>
        ) : (
          <ul
            className="max-h-[min(50vh,20rem)] space-y-1.5 overflow-y-auto rounded-xl border border-white/10 bg-ink-950/30 p-1.5"
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
                resumeLabel = `~${rv.pct}% read`
              } else {
                resumeLabel =
                  'hint' in rv && rv.hint === 'stale' && d.resumeWordIdx && d.resumeWordIdx > 0
                    ? 'Resume saved'
                    : null
              }
              return (
                <li key={d.id} className="group">
                  <div
                    className={
                      'flex items-stretch gap-0.5 overflow-hidden rounded-lg border transition ' +
                      (isActive
                        ? 'border-amber-300/30 bg-amber-300/10 shadow-sm shadow-amber-900/20'
                        : 'border-transparent bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]')
                    }
                  >
                    <button
                      type="button"
                      onClick={() => onSelectDocument(d.id)}
                      className="min-w-0 flex-1 text-left pl-2.5 pr-1 py-2.5"
                      title={d.title}
                    >
                      <div
                        className={
                          'truncate font-mono text-xs ' +
                          (isActive ? 'text-amber-100' : 'text-ink-100')
                        }
                      >
                        {displayTitle}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-ink-500">
                        <span className="inline-flex items-center gap-0.5">
                          <IconClock className="h-3 w-3 opacity-80" />
                          {when}
                        </span>
                        {resumeLabel && (
                          <>
                            <span className="text-ink-600" aria-hidden>
                              ·
                            </span>
                            <span className="text-amber-200/80 tabular-nums">{resumeLabel}</span>
                          </>
                        )}
                      </div>
                      {rv.showBar && (
                        <div
                          className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"
                          role="progressbar"
                          aria-valuenow={rv.pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-500/50 to-amber-300/70"
                            style={{ width: `${rv.pct}%` }}
                          />
                        </div>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPendingDelete({ id: d.id, title: d.id === activeId ? title : d.title })
                      }}
                      title="Remove from this device"
                      className="shrink-0 self-stretch border-l border-white/5 px-1.5 text-ink-500 transition hover:bg-red-500/10 hover:text-red-200 focus:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/50 sm:opacity-50 sm:group-hover:opacity-100"
                      aria-label={`Remove ${d.title} from this device`}
                    >
                      <IconTrash className="mx-0.5 h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
    {deleteDialog}
    </>
  )
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function IconSortPlayed({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M10.25 8v8L16 12l-5.75-4Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconSortAdded({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
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
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
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
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 4v16" />
      <path d="M8 8l4-4 4 4" />
      <path d="M8 16l4 4 4-4" />
    </svg>
  )
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function IconStack({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="M2 17 12 22l10-5" />
      <path d="M2 12 12 17l10-5" />
    </svg>
  )
}

function IconDoc({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}
