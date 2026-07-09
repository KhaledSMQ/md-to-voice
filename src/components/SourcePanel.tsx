import { useEffect, useRef, useState } from 'react'
import { FileUploader } from './FileUploader'
import { FontSizeControl } from './FontSizeControl'
import { RecentsList } from './RecentsList'
import type { StoredDocument } from '../lib/documentStore'

type SourceTab = 'file' | 'edit'

type Props = {
  markdown: string
  onMarkdownFromEdit: (text: string) => void
  /** Replaces entire document (e.g. paste) and clears saved playback position. */
  onMarkdownPaste: (text: string) => void
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
  fontSize: number
  onFontSizeChange: (size: number) => void
  /** Live word count for the active document (from shared parse). */
  wordCount: number
  resumeWordIdx?: number
}

const tabBase =
  'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50'

export function SourcePanel({
  markdown,
  onMarkdownFromEdit,
  onMarkdownPaste,
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
  fontSize,
  onFontSizeChange,
  wordCount,
  resumeWordIdx,
}: Props) {
  const [nameEditing, setNameEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState(title)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const displayTitle = nameEditing ? nameDraft : title

  const resumePct =
    resumeWordIdx != null && resumeWordIdx > 0 && wordCount > 0
      ? Math.min(100, Math.round((Math.min(resumeWordIdx, wordCount - 1) / Math.max(1, wordCount - 1)) * 100))
      : null

  useEffect(() => {
    if (!nameEditing) return
    requestAnimationFrame(() => {
      const el = nameInputRef.current
      el?.focus()
      el?.select()
    })
  }, [nameEditing])

  const commitName = () => {
    onTitleChange(nameDraft.trim() || 'Untitled')
    setNameEditing(false)
  }

  const startRename = () => {
    setNameDraft(title)
    setNameEditing(true)
  }

  return (
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
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-ink-500">
              Type or paste Markdown here; the reader and playback update as you go.
            </p>
            <FontSizeControl fontSize={fontSize} onChange={onFontSizeChange} compact />
          </div>
          <label htmlFor="md-editor" className="sr-only">
            Markdown content
          </label>
          <textarea
            id="md-editor"
            spellCheck={false}
            value={markdown}
            onChange={(e) => onMarkdownFromEdit(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text/plain')
              if (!text.trim()) return
              e.preventDefault()
              onMarkdownPaste(text)
            }}
            className="w-full min-h-[min(50vh,320px)] resize-y rounded-xl border border-white/10 bg-ink-950/50 px-3 py-2.5 font-mono text-ink-100 leading-relaxed placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
            style={{ fontSize: `${fontSize}px` }}
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
            <div className="flex items-start gap-1">
              <button
                type="button"
                onDoubleClick={startRename}
                title="Double-click to rename"
                className="min-w-0 flex-1 text-left font-mono text-sm font-medium text-ink-100 leading-snug hover:text-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50 rounded"
              >
                <span className="line-clamp-2 break-all">{displayTitle}</span>
              </button>
              <button
                type="button"
                onClick={startRename}
                title="Rename"
                aria-label="Rename document"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:bg-white/[0.06] hover:text-ink-200"
              >
                <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M12 20h9" strokeLinecap="round" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <p className="mt-2 text-xs text-ink-400">
          {wordCount.toLocaleString()} word{wordCount === 1 ? '' : 's'}
          {resumePct != null && resumePct > 0 && (
            <span className="text-amber-200/90"> · saved position ~{resumePct}%</span>
          )}
        </p>
        <p className="mt-1.5 text-[10px] leading-relaxed text-ink-500">
          Use the pencil to rename. Text stays in this browser (IndexedDB).
        </p>
      </section>

      <RecentsList
        documents={documents}
        activeId={activeId}
        title={title}
        onSelectDocument={onSelectDocument}
        onNewDocument={onNewDocument}
        onDeleteDocument={onDeleteDocument}
        onOpenFileTab={() => onSourceTab('file')}
        onOpenEditTab={() => onSourceTab('edit')}
      />
    </div>
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
