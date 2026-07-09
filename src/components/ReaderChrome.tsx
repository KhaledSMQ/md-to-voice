import { useEffect, useRef, useState } from 'react'
import { FontSizeControl } from './FontSizeControl'

type Props = {
  inlineEdit: boolean
  sourceName: string
  onTitleChange: (name: string) => void
  fontSize: number
  onFontSizeChange: (size: number) => void
  onPaste: () => void
  onToggleInlineEdit: () => void
}

export function ReaderChrome({
  inlineEdit,
  sourceName,
  onTitleChange,
  fontSize,
  onFontSizeChange,
  onPaste,
  onToggleInlineEdit,
}: Props) {
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [headerRenaming, setHeaderRenaming] = useState(false)
  const [headerTitleDraft, setHeaderTitleDraft] = useState(sourceName)
  const displayTitle = headerRenaming ? headerTitleDraft : sourceName

  useEffect(() => {
    if (!headerRenaming) return
    requestAnimationFrame(() => titleInputRef.current?.focus())
  }, [headerRenaming])

  const commitHeaderTitle = () => {
    onTitleChange(headerTitleDraft.trim() || 'Untitled')
    setHeaderRenaming(false)
  }

  const startRename = () => {
    setHeaderTitleDraft(sourceName)
    setHeaderRenaming(true)
  }

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-white/5 px-3 py-2">
      <span className="text-xs text-ink-500">{inlineEdit ? 'Editing' : 'Preview'}</span>
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
          className="min-w-0 flex-1 rounded border border-amber-300/30 bg-ink-950/50 px-2 py-0.5 text-center text-[11px] font-mono text-ink-100 focus:outline-none focus:ring-1 focus:ring-amber-300/50"
          aria-label="Document title"
        />
      ) : (
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
          <button
            type="button"
            onDoubleClick={startRename}
            title="Double-click to rename"
            className="min-w-0 truncate text-center text-[11px] text-ink-200 font-mono cursor-default hover:text-ink-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/50 rounded"
          >
            {displayTitle}
          </button>
          <button
            type="button"
            onClick={startRename}
            title="Rename document"
            aria-label="Rename document"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-transparent text-ink-500 transition-colors hover:border-white/10 hover:bg-white/[0.06] hover:text-ink-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
          >
            <RenameIcon />
          </button>
        </div>
      )}
      <FontSizeControl fontSize={fontSize} onChange={onFontSizeChange} />
      <button
        type="button"
        onClick={onPaste}
        title="Paste from clipboard (replaces content, resets playback)"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-ink-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
      >
        <span className="sr-only">Paste from clipboard</span>
        <PasteIcon />
      </button>
      <button
        type="button"
        onClick={onToggleInlineEdit}
        aria-pressed={inlineEdit}
        title={inlineEdit ? 'Back to preview' : 'Edit markdown in place'}
        className={
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-ink-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50 ' +
          (inlineEdit
            ? 'border-amber-300/50 bg-amber-300/15 text-amber-200'
            : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.08]')
        }
      >
        <span className="sr-only">{inlineEdit ? 'Exit inline editor' : 'Open inline editor'}</span>
        <PenIcon />
      </button>
    </div>
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
      width={18}
      height={18}
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
      width={18}
      height={18}
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
