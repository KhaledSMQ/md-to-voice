import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MarkdownReader, type MarkdownReaderHandle, type PlayheadVisibility } from './MarkdownReader'
import { Controls } from './Controls'
import { usePlayer } from '../lib/usePlayer'
import { loadAppSettings, saveAppSettings } from '../lib/appSettings'
import { parseDocument } from '../lib/parseDocument'

type Props = {
  activeDocId: string
  /** Global word index when this document was last opened; used to position the first chunk. */
  openResume: number
  onResumeFromPlayback: (wordIdx: number) => void
  onResumeFlush: (wordIdx: number) => void
  onResumeReset: () => void
  markdown: string
  onMarkdownChange: (text: string) => void
  sourceName: string
  onTitleChange: (name: string) => void
  onOpenFileTab: () => void
  onOpenPasteTab: () => void
  /** Fires whenever audio playback starts (play, resume, or seek to word). */
  onPlaybackBegan?: () => void
}

const READER_MAX_H = 'max-h-[calc(100vh-200px)]'
const UI_SAVE_MS = 400
const RESUME_DEBOUNCE_MS = 700

export function Reader({
  activeDocId,
  openResume,
  onResumeFromPlayback,
  onResumeFlush,
  onResumeReset,
  markdown,
  onMarkdownChange,
  sourceName,
  onTitleChange,
  onOpenFileTab,
  onOpenPasteTab,
  onPlaybackBegan,
}: Props) {
  const readerRef = useRef<MarkdownReaderHandle>(null)
  const inlineEditorRef = useRef<HTMLTextAreaElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [inlineEdit, setInlineEdit] = useState(false)
  const [headerRenaming, setHeaderRenaming] = useState(false)
  const [headerTitleDraft, setHeaderTitleDraft] = useState(sourceName)

  const docInfo = useMemo(() => {
    const p = parseDocument(markdown)
    return { words: p.words, chunks: p.chunks }
  }, [markdown])

  const noPlayableText = !markdown.trim() || docInfo.words.length === 0

  const [voice, setVoice] = useState(() => loadAppSettings().voice)
  const [speed, setSpeed] = useState(() => loadAppSettings().speed)
  const [playhead, setPlayhead] = useState<PlayheadVisibility>({ inView: true, out: null })
  const [resumeBannerDismissed, setResumeBannerDismissed] = useState(false)
  const lastWordHeard = useRef(0)
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const t = setTimeout(() => saveAppSettings({ voice, speed }), UI_SAVE_MS)
    return () => clearTimeout(t)
  }, [voice, speed])

  const scheduleResumeSave = useCallback(
    (w: number) => {
      if (w < 0) return
      if (resumeTimer.current) clearTimeout(resumeTimer.current)
      lastWordHeard.current = w
      resumeTimer.current = setTimeout(() => {
        resumeTimer.current = null
        onResumeFromPlayback(w)
      }, RESUME_DEBOUNCE_MS)
    },
    [onResumeFromPlayback],
  )

  const flushResumeSave = useCallback(
    (w: number) => {
      if (w < 0) return
      if (resumeTimer.current) {
        clearTimeout(resumeTimer.current)
        resumeTimer.current = null
      }
      lastWordHeard.current = w
      onResumeFlush(w)
    },
    [onResumeFlush],
  )

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden' && lastWordHeard.current >= 0) {
        flushResumeSave(lastWordHeard.current)
      }
    }
    const onPageHide = () => {
      if (lastWordHeard.current >= 0) flushResumeSave(lastWordHeard.current)
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [flushResumeSave])

  useEffect(() => {
    if (resumeTimer.current) {
      clearTimeout(resumeTimer.current)
      resumeTimer.current = null
    }
    lastWordHeard.current = 0
  }, [activeDocId])

  useEffect(() => {
    setResumeBannerDismissed(false)
  }, [activeDocId, openResume])

  useEffect(() => {
    if (headerRenaming) return
    setHeaderTitleDraft(sourceName)
  }, [sourceName, headerRenaming])

  useEffect(() => {
    if (headerRenaming) {
      requestAnimationFrame(() => titleInputRef.current?.focus())
    }
  }, [headerRenaming])

  const onActiveWord = useCallback(
    (wIdx: number) => {
      if (wIdx >= 0) {
        lastWordHeard.current = wIdx
        scheduleResumeSave(wIdx)
      }
      const handle = readerRef.current
      if (!handle) return
      handle.setActive(wIdx)
      if (wIdx >= 0) handle.scrollToActive()
    },
    [scheduleResumeSave],
  )

  const onActiveVisibilityChange = useCallback((v: PlayheadVisibility) => {
    setPlayhead(v)
  }, [])

  const commitHeaderTitle = useCallback(() => {
    onTitleChange(headerTitleDraft.trim() || 'Untitled')
    setHeaderRenaming(false)
  }, [headerTitleDraft, onTitleChange])

  const resumeAtWordIdx = useMemo(() => {
    if (docInfo.words.length === 0) return null
    const last = docInfo.words[docInfo.words.length - 1]
    const max = last?.idx ?? 0
    return Math.max(0, Math.min(openResume, max))
  }, [openResume, docInfo.words, activeDocId])

  /** Shown in the open-resume nudge; global word index + ordinal in this doc. */
  const resumeNudge = useMemo(() => {
    if (openResume <= 0) return null
    if (docInfo.words.length === 0) return null
    const last = docInfo.words[docInfo.words.length - 1]
    const maxW = last?.idx ?? 0
    const w = Math.max(0, Math.min(openResume, maxW))
    if (w <= 0) return null
    const ord = docInfo.words.findIndex((t) => t.idx === w) + 1
    return { w, at: ord > 0 ? ord : 1, total: docInfo.words.length }
  }, [openResume, docInfo.words])

  const player = usePlayer({
    chunks: docInfo.chunks,
    voice,
    speed,
    onActiveWord,
    resumeAtWordIdx,
  })

  const showResumeNudge =
    Boolean(resumeNudge) && !resumeBannerDismissed && !inlineEdit
    && (player.status === 'ready' || player.status === 'idle' || player.status === 'paused' || player.status === 'finished')

  const playerRef = useRef(player)
  playerRef.current = player

  const handleStop = useCallback(() => {
    if (resumeTimer.current) {
      clearTimeout(resumeTimer.current)
      resumeTimer.current = null
    }
    onResumeReset()
    playerRef.current.stop()
  }, [onResumeReset])

  const onResumeFromStart = useCallback(() => {
    lastWordHeard.current = 0
    onResumeReset()
    readerRef.current?.reset()
  }, [onResumeReset])

  const prevPlayerStatus = useRef(player.status)
  useEffect(() => {
    if (player.status === 'playing' && prevPlayerStatus.current !== 'playing') {
      onPlaybackBegan?.()
      setResumeBannerDismissed(true)
    }
    if (player.status === 'paused' && prevPlayerStatus.current === 'playing') {
      if (lastWordHeard.current >= 0) flushResumeSave(lastWordHeard.current)
    }
    prevPlayerStatus.current = player.status
  }, [player.status, onPlaybackBegan, flushResumeSave])

  const onWordClick = useCallback((wIdx: number) => {
    void playerRef.current.seekToWord(wIdx)
  }, [])

  useEffect(() => {
    readerRef.current?.reset()
  }, [markdown])

  // After reset-on-markdown, re-highlight + scroll. Runs when opening a doc, not on every text edit
  // (only when activeDocId / openResume / inline mode changes).
  useEffect(() => {
    if (inlineEdit) return
    if (openResume <= 0) return
    const p = parseDocument(markdown)
    if (p.words.length === 0) return
    const maxW = p.words[p.words.length - 1]!.idx
    const w = Math.max(0, Math.min(openResume, maxW))
    if (w <= 0) return
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const h = readerRef.current
        if (!h) return
        h.setActive(w)
        h.scrollToActiveNow()
      })
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: re-run on doc resume context only
  }, [activeDocId, openResume, inlineEdit])

  useEffect(() => {
    if (!inlineEdit) return
    const t = requestAnimationFrame(() => {
      const el = inlineEditorRef.current
      el?.focus()
      const len = el?.value.length ?? 0
      el?.setSelectionRange(len, len)
    })
    return () => cancelAnimationFrame(t)
  }, [inlineEdit])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      }
      if (e.code === 'Space') {
        e.preventDefault()
        playerRef.current.toggle()
      } else if (e.code === 'Escape') {
        handleStop()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleStop])

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div
        className={`flex min-w-0 min-h-[min(50vh,28rem)] flex-col rounded-xl border border-white/5 bg-white/[0.03] ${READER_MAX_H}`}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-white/5 px-3 py-2">
          <span className="text-xs text-ink-500">
            {inlineEdit ? 'Editing' : 'Preview'}
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
              className="min-w-0 flex-1 rounded border border-amber-300/30 bg-ink-950/50 px-2 py-0.5 text-center text-[11px] font-mono text-ink-100 focus:outline-none focus:ring-1 focus:ring-amber-300/50"
              aria-label="Document title"
            />
          ) : (
            <button
              type="button"
              onDoubleClick={() => {
                setHeaderTitleDraft(sourceName)
                setHeaderRenaming(true)
              }}
              title="Double-click to rename"
              className="min-w-0 flex-1 truncate text-center text-[11px] text-ink-200 font-mono cursor-default hover:text-ink-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/50 rounded"
            >
              {sourceName}
            </button>
          )}
          <button
            type="button"
            onClick={() => setInlineEdit((v) => !v)}
            aria-pressed={inlineEdit}
            title={inlineEdit ? 'Back to preview' : 'Edit markdown in place'}
            className={
              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-ink-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50 ' +
              (inlineEdit
                ? 'border-amber-300/50 bg-amber-300/15 text-amber-200'
                : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.08]')
            }
          >
            <span className="sr-only">
              {inlineEdit ? 'Exit inline editor' : 'Open inline editor'}
            </span>
            <PenIcon />
          </button>
        </div>

        {inlineEdit ? (
          <textarea
            ref={inlineEditorRef}
            id="md-inline-editor"
            spellCheck={false}
            value={markdown}
            onChange={(e) => onMarkdownChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setInlineEdit(false)
              }
            }}
            className="w-full min-h-0 flex-1 resize-none overflow-y-auto border-0 bg-ink-950/40 px-4 py-4 font-mono text-sm leading-[1.65] text-ink-100 caret-amber-200 [tab-size:2] selection:bg-amber-300/25 focus:outline-none"
            aria-label="Markdown source (inline editor)"
            placeholder="Write or paste Markdown…"
          />
        ) : noPlayableText ? (
          <ReaderEmptyState
            onOpenFileTab={onOpenFileTab}
            onOpenPasteTab={onOpenPasteTab}
            onWriteHere={() => setInlineEdit(true)}
          />
        ) : (
          <div
            className={
              'relative min-h-0 min-w-0 flex-1' + (showResumeNudge && resumeNudge ? ' pt-[4.5rem]' : '')
            }
          >
            {showResumeNudge && resumeNudge && (
              <div
                className="absolute top-0 left-0 right-0 z-20 border-b border-amber-300/20 bg-ink-900/90 px-3 py-2.5 text-left shadow-md shadow-ink-950/30 backdrop-blur"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-amber-100">Picking up where you left off</p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      The highlighted word is near word {resumeNudge.at} of {resumeNudge.total}. Use{' '}
                      <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-ink-200">Space</kbd> or
                      Play to continue from here, or start from the beginning.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setResumeBannerDismissed(true)
                        void player.play()
                      }}
                      className="whitespace-nowrap rounded-lg border border-amber-300/50 bg-amber-300/15 px-2.5 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-300/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
                    >
                      Continue
                    </button>
                    <button
                      type="button"
                      onClick={onResumeFromStart}
                      className="whitespace-nowrap rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-ink-200 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
                    >
                      From the start
                    </button>
                    <button
                      type="button"
                      onClick={() => setResumeBannerDismissed(true)}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-400 transition hover:bg-white/10 hover:text-ink-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
                      title="Hide this message (your position stays saved)"
                      aria-label="Hide resume message"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            )}
            <MarkdownReader
              markdown={markdown}
              onWordClick={onWordClick}
              onActiveVisibilityChange={onActiveVisibilityChange}
              ref={readerRef}
              className="markdown-body min-h-0 min-w-0 h-full max-h-full flex-1 overflow-y-auto px-5 py-4"
            />
            {!playhead.inView &&
              (player.status === 'playing' || player.status === 'paused') &&
              playhead.out && (
                <div className="pointer-events-none absolute bottom-3 left-0 right-0 z-10 flex justify-center">
                  <button
                    type="button"
                    onClick={() => readerRef.current?.scrollToActiveNow()}
                    title={
                      playhead.out === 'above'
                        ? 'Current word is above — scroll up'
                        : 'Current word is below — scroll down'
                    }
                    className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-300/40 bg-ink-900/90 px-4 py-1.5 text-sm font-medium text-amber-100 shadow-lg shadow-ink-950/40 backdrop-blur transition-colors hover:border-amber-200/60 hover:bg-ink-800/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
                  >
                    <PlayArrows direction={playhead.out} />
                    <span>Now playing</span>
                  </button>
                </div>
              )}
          </div>
        )}
      </div>

      <aside className="space-y-3">
        <Controls
          status={player.status}
          device={player.device}
          voices={player.voices}
          voice={voice}
          speed={speed}
          progress={player.progress}
          error={player.error}
          totalChunks={docInfo.chunks.length}
          currentChunkIdx={player.currentChunkIdx}
          onVoice={setVoice}
          onSpeed={setSpeed}
          onPlay={player.play}
          onPause={player.pause}
          onStop={handleStop}
        />

        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-ink-400">Source</span>
            <span className="font-mono text-ink-200 truncate max-w-[180px]" title={sourceName}>
              {sourceName}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-400">Words</span>
            <span className="font-mono text-ink-200">{docInfo.words.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-400">Chunks</span>
            <span className="font-mono text-ink-200">{docInfo.chunks.length}</span>
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-[11px] text-ink-400 leading-relaxed">
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-ink-200">Space</kbd>{' '}
          play / pause ·{' '}
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-ink-200">Esc</kbd>{' '}
          stop playback, or close the inline editor
        </div>
      </aside>
    </div>
  )
}

function PlayArrows({ direction }: { direction: 'above' | 'below' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={18}
      height={18}
      className="shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {direction === 'above' ? (
        <path d="m18 16-6-6-6 6" />
      ) : (
        <path d="M6 8l6 6 6-6" />
      )}
    </svg>
  )
}

function ReaderEmptyState({
  onOpenFileTab,
  onOpenPasteTab,
  onWriteHere,
}: {
  onOpenFileTab: () => void
  onOpenPasteTab: () => void
  onWriteHere: () => void
}) {
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
