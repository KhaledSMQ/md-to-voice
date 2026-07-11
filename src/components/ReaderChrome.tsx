import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { FontSizeControl } from './FontSizeControl'
import { MeasureWidthControl } from './MeasureWidthControl'
import { ReadingPresetControl } from './ReadingPresetControl'
import type { ReadingPresetId } from '../lib/readingPresets'

type Props = {
  inlineEdit: boolean
  sourceName: string
  onTitleChange: (name: string) => void
  fontSize: number
  onFontSizeChange: (size: number) => void
  readingPreset: ReadingPresetId
  onReadingPresetChange: (preset: ReadingPresetId) => void
  measureWidth: number
  onMeasureWidthChange: (ch: number) => void
  onPaste: () => void
  onToggleInlineEdit: () => void
  /** Open a Markdown file from disk. */
  onOpenFile?: () => void
  /** Open find-in-preview (hidden while editing). */
  onOpenSearch?: () => void
  searchOpen?: boolean
  /** Toggle document sections rail (hidden while editing / no headings). */
  onToggleOutline?: () => void
  outlineOpen?: boolean
  outlineAvailable?: boolean
  /** Quieter chrome while listening — hide secondary actions. */
  listening?: boolean
}

export function ReaderChrome({
  inlineEdit,
  sourceName,
  onTitleChange,
  fontSize,
  onFontSizeChange,
  readingPreset,
  onReadingPresetChange,
  measureWidth,
  onMeasureWidthChange,
  onPaste,
  onToggleInlineEdit,
  onOpenFile,
  onOpenSearch,
  searchOpen = false,
  onToggleOutline,
  outlineOpen = false,
  outlineAvailable = false,
  listening = false,
}: Props) {
  const titleInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const [headerRenaming, setHeaderRenaming] = useState(false)
  const [headerTitleDraft, setHeaderTitleDraft] = useState(sourceName)
  const [menuOpen, setMenuOpen] = useState(false)
  const displayTitle = headerRenaming ? headerTitleDraft : sourceName

  useEffect(() => {
    if (!headerRenaming) return
    requestAnimationFrame(() => titleInputRef.current?.focus())
  }, [headerRenaming])

  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || menuBtnRef.current?.contains(t)) return
      setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  useEffect(() => {
    if (listening) setMenuOpen(false)
  }, [listening])

  const commitHeaderTitle = () => {
    onTitleChange(headerTitleDraft.trim() || 'Untitled')
    setHeaderRenaming(false)
  }

  const startRename = () => {
    setHeaderTitleDraft(sourceName)
    setHeaderRenaming(true)
    setMenuOpen(false)
  }

  const showTools = !listening

  return (
    <header
      className={`studio-app-header ${listening ? 'is-listening' : ''}`}
    >
      <div className="studio-app-brand shrink-0">
        <div className="studio-app-mark" aria-hidden>
          md
        </div>
        <h1 className="studio-app-wordmark">md to voice</h1>
      </div>

      <span className="studio-app-sep text-ink-600" aria-hidden>
        ·
      </span>

      {headerRenaming ? (
        <input
          ref={titleInputRef}
          value={headerTitleDraft}
          onChange={(e) => setHeaderTitleDraft(e.target.value)}
          onBlur={commitHeaderTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitHeaderTitle()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setHeaderTitleDraft(sourceName)
              setHeaderRenaming(false)
            }
          }}
          spellCheck={false}
          className="min-w-0 flex-1 rounded border border-amber-300/30 bg-ink-950/50 px-2 py-0.5 text-[12px] font-mono text-ink-100 focus:outline-none focus:ring-1 focus:ring-amber-300/50"
          aria-label="Document title"
        />
      ) : (
        <button
          type="button"
          onDoubleClick={startRename}
          title="Double-click to rename"
          className="min-w-0 flex-1 truncate text-left text-[12px] text-ink-300 font-mono cursor-default hover:text-ink-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/50 rounded"
        >
          {displayTitle}
        </button>
      )}

      <div
        className="studio-app-actions"
        inert={listening || undefined}
        aria-hidden={listening || undefined}
      >
          <button
            ref={menuBtnRef}
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-haspopup="menu"
            title="More tools"
            tabIndex={showTools ? undefined : -1}
            className={
              'inline-flex h-8 w-8 items-center justify-center rounded-lg border text-ink-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50 ' +
              (menuOpen
                ? 'border-white/20 bg-white/[0.08] text-ink-100'
                : 'border-transparent hover:border-white/10 hover:bg-white/[0.06]')
            }
          >
            <span className="sr-only">More tools</span>
            <MoreIcon />
          </button>

          {menuOpen && (
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              className="absolute right-0 top-[calc(100%+0.35rem)] z-50 w-60 rounded-xl border border-white/10 bg-ink-950/95 p-1.5 shadow-xl shadow-ink-950/50 backdrop-blur"
            >
              <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5">
                <span className="text-[11px] text-ink-400">Text size</span>
                <FontSizeControl fontSize={fontSize} onChange={onFontSizeChange} compact />
              </div>
              <MeasureWidthControl value={measureWidth} onChange={onMeasureWidthChange} />
              <ReadingPresetControl value={readingPreset} onChange={onReadingPresetChange} />
              <div className="my-1 border-t border-white/5" />
              <MenuItem
                onClick={() => {
                  startRename()
                }}
                label="Rename"
                icon={<RenameIcon />}
              />
              {onOpenFile && (
                <MenuItem
                  onClick={() => {
                    onOpenFile()
                    setMenuOpen(false)
                  }}
                  label="Open file"
                  icon={<OpenFileIcon />}
                />
              )}
              {!inlineEdit && outlineAvailable && onToggleOutline && (
                <MenuItem
                  onClick={() => {
                    onToggleOutline()
                    setMenuOpen(false)
                  }}
                  label={outlineOpen ? 'Hide sections' : 'Sections'}
                  icon={<OutlineIcon />}
                  active={outlineOpen}
                />
              )}
              {!inlineEdit && onOpenSearch && (
                <MenuItem
                  onClick={() => {
                    onOpenSearch()
                    setMenuOpen(false)
                  }}
                  label="Find in preview"
                  hint="⌘F"
                  icon={<SearchIcon />}
                  active={searchOpen}
                />
              )}
              <MenuItem
                onClick={() => {
                  onPaste()
                  setMenuOpen(false)
                }}
                label="Paste from clipboard"
                hint="⌘V"
                icon={<PasteIcon />}
              />
            </div>
          )}

          <button
            type="button"
            onClick={onToggleInlineEdit}
            aria-pressed={inlineEdit}
            title={inlineEdit ? 'Back to preview' : 'Edit markdown in place'}
            tabIndex={showTools ? undefined : -1}
            className={
              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-ink-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50 ' +
              (inlineEdit
                ? 'border-amber-300/50 bg-amber-300/15 text-amber-200'
                : 'border-transparent hover:border-white/10 hover:bg-white/[0.06]')
            }
          >
            <span className="sr-only">{inlineEdit ? 'Exit inline editor' : 'Open inline editor'}</span>
            <PenIcon />
          </button>
      </div>
    </header>
  )
}

function MenuItem({
  onClick,
  label,
  icon,
  hint,
  active = false,
}: {
  onClick: () => void
  label: string
  icon: ReactNode
  hint?: string
  active?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={
        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/40 ' +
        (active
          ? 'bg-amber-300/10 text-amber-100'
          : 'text-ink-200 hover:bg-white/[0.06] hover:text-ink-50')
      }
    >
      <span className="text-ink-400" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="font-mono text-[10px] text-ink-500">{hint}</span>}
    </button>
  )
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
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

function OutlineIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M8 6h13M8 12h13M8 18h13" strokeLinecap="round" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeLinecap="round" />
    </svg>
  )
}

function RenameIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PenIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={16}
      height={16}
      className="shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />
      <path d="m15 5 4 4" />
    </svg>
  )
}

function PasteIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={14}
      height={14}
      className="shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 2H9a1 1 0 0 0-1 1v2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V3a1 1 0 0 0-1-1Z" />
      <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
    </svg>
  )
}

function OpenFileIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 16V4m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
