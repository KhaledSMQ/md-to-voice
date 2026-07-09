import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MarkdownReader, type MarkdownReaderHandle, type PlayheadVisibility } from './MarkdownReader'
import { Controls } from './Controls'
import { ColumnResizeHandle } from './ColumnResizeHandle'
import { ResumeBanner } from './ResumeBanner'
import { ReaderChrome } from './ReaderChrome'
import { ReaderEmptyState } from './ReaderEmptyState'
import { TeleprompterOverlay } from './TeleprompterOverlay'
import { usePlayer } from '../lib/usePlayer'
import {
  loadAppSettings,
  saveAppSettings,
  CONTROLS_WIDTH_MIN,
  CONTROLS_WIDTH_MAX,
  DEFAULT_APP_SETTINGS,
} from '../lib/appSettings'
import type { ParsedDocument } from '../lib/parseDocument'

type Props = {
  activeDocId: string
  /** Global word index when this document was last opened; used to position the first chunk. */
  openResume: number
  onResumeFromPlayback: (wordIdx: number) => void
  onResumeFlush: (wordIdx: number) => void
  onResumeReset: () => void
  markdown: string
  parsed: ParsedDocument
  onMarkdownChange: (text: string) => void
  sourceName: string
  onTitleChange: (name: string) => void
  onOpenFileTab: () => void
  onOpenPasteTab: () => void
  /** Fires whenever audio playback starts (play, resume, or seek to word). */
  onPlaybackBegan?: () => void
  /** True while speaking/paused in normal (non-teleprompter) mode — dim side chrome. */
  onReadingFocusChange?: (focused: boolean) => void
  fontSize: number
  onFontSizeChange: (size: number) => void
  controlsWidth: number
  onControlsWidthChange: (width: number) => void
}

const READER_MAX_H = 'min-h-0 flex-1 max-h-[calc(100vh-9rem)]'
const UI_SAVE_MS = 400
const RESUME_DEBOUNCE_MS = 700

export function Reader({
  activeDocId,
  openResume,
  onResumeFromPlayback,
  onResumeFlush,
  onResumeReset,
  markdown,
  parsed,
  onMarkdownChange,
  sourceName,
  onTitleChange,
  onOpenFileTab,
  onOpenPasteTab,
  onPlaybackBegan,
  onReadingFocusChange,
  fontSize,
  onFontSizeChange,
  controlsWidth,
  onControlsWidthChange,
}: Props) {
  const readerRef = useRef<MarkdownReaderHandle>(null)
  const inlineEditorRef = useRef<HTMLTextAreaElement>(null)
  const [inlineEdit, setInlineEdit] = useState(false)

  const noPlayableText = !markdown.trim() || parsed.words.length === 0

  const [voice, setVoice] = useState(() => loadAppSettings().voice)
  const [speed, setSpeed] = useState(() => loadAppSettings().speed)
  const [volume, setVolume] = useState(() => loadAppSettings().volume)
  const [teleprompterMode, setTeleprompterMode] = useState(
    () => loadAppSettings().teleprompterMode,
  )
  /** Session-only hide (Esc / Exit) without flipping the saved preference. */
  const [teleprompterDismissed, setTeleprompterDismissed] = useState(false)
  const [playhead, setPlayhead] = useState<PlayheadVisibility>({ inView: true, out: null })
  const [resumeBannerDismissedKey, setResumeBannerDismissedKey] = useState<string | null>(null)
  const resumeBannerKey = `${activeDocId}:${openResume}`
  const resumeBannerDismissed = resumeBannerDismissedKey === resumeBannerKey
  const lastWordHeard = useRef(0)
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const t = setTimeout(
      () => saveAppSettings({ voice, speed, volume, teleprompterMode }),
      UI_SAVE_MS,
    )
    return () => clearTimeout(t)
  }, [voice, speed, volume, teleprompterMode])

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
    if (openResume > 0) return
    if (resumeTimer.current) {
      clearTimeout(resumeTimer.current)
      resumeTimer.current = null
    }
    lastWordHeard.current = 0
  }, [markdown, openResume])

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

  const resumeAtWordIdx = useMemo(() => {
    if (parsed.words.length === 0) return null
    const last = parsed.words[parsed.words.length - 1]
    const max = last?.idx ?? 0
    return Math.max(0, Math.min(openResume, max))
  }, [openResume, parsed.words])

  const resumeNudge = useMemo(() => {
    if (openResume <= 0) return null
    if (parsed.words.length === 0) return null
    const last = parsed.words[parsed.words.length - 1]
    const maxW = last?.idx ?? 0
    const w = Math.max(0, Math.min(openResume, maxW))
    if (w <= 0) return null
    const ord = parsed.words.findIndex((t) => t.idx === w) + 1
    return { w, at: ord > 0 ? ord : 1, total: parsed.words.length }
  }, [openResume, parsed.words])

  const player = usePlayer({
    chunks: parsed.chunks,
    voice,
    speed,
    volume,
    onActiveWord,
    resumeAtWordIdx,
  })

  const showTeleprompter =
    teleprompterMode &&
    !teleprompterDismissed &&
    !inlineEdit &&
    !noPlayableText &&
    (player.status === 'playing' || player.status === 'paused')

  const readingFocus =
    !showTeleprompter &&
    !inlineEdit &&
    !noPlayableText &&
    (player.status === 'playing' || player.status === 'paused')

  useEffect(() => {
    onReadingFocusChange?.(readingFocus)
    return () => onReadingFocusChange?.(false)
  }, [readingFocus, onReadingFocusChange])

  useEffect(() => {
    if (player.status === 'ready' || player.status === 'idle' || player.status === 'finished') {
      setTeleprompterDismissed(false)
    }
  }, [player.status])

  const showResumeNudge =
    Boolean(resumeNudge) &&
    !resumeBannerDismissed &&
    !inlineEdit &&
    (player.status === 'ready' ||
      player.status === 'idle' ||
      player.status === 'paused' ||
      player.status === 'finished')

  const playerRef = useRef(player)
  useEffect(() => {
    playerRef.current = player
  }, [player])

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

  const replaceContentAndResetPlayback = useCallback(
    (text: string) => {
      if (resumeTimer.current) {
        clearTimeout(resumeTimer.current)
        resumeTimer.current = null
      }
      lastWordHeard.current = 0
      onResumeReset()
      playerRef.current.stop()
      readerRef.current?.reset()
      setResumeBannerDismissedKey(resumeBannerKey)
      onMarkdownChange(text)
    },
    [onMarkdownChange, onResumeReset, resumeBannerKey],
  )

  const handlePasteClick = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        setInlineEdit(true)
        return
      }
      replaceContentAndResetPlayback(text)
      setInlineEdit(false)
    } catch {
      setInlineEdit(true)
    }
  }, [replaceContentAndResetPlayback])

  const prevPlayerStatus = useRef(player.status)
  useEffect(() => {
    if (player.status === 'playing' && prevPlayerStatus.current !== 'playing') {
      onPlaybackBegan?.()
      setResumeBannerDismissedKey(resumeBannerKey)
    }
    if (player.status === 'paused' && prevPlayerStatus.current === 'playing') {
      if (lastWordHeard.current >= 0) flushResumeSave(lastWordHeard.current)
    }
    prevPlayerStatus.current = player.status
  }, [player.status, onPlaybackBegan, flushResumeSave, resumeBannerKey])

  const onWordClick = useCallback((wIdx: number) => {
    void playerRef.current.seekToWord(wIdx)
  }, [])

  useEffect(() => {
    readerRef.current?.reset()
  }, [markdown])

  useEffect(() => {
    if (inlineEdit) return
    if (openResume <= 0) return
    if (parsed.words.length === 0) return
    const maxW = parsed.words[parsed.words.length - 1]!.idx
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
  }, [activeDocId, openResume, inlineEdit, parsed.words])

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
        if (e.target.isContentEditable) return
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V')) {
        // Global paste into the active document (preview / empty state).
        // Leave native paste alone inside editors (handled above).
        if (inlineEdit || showTeleprompter) return
        e.preventDefault()
        void handlePasteClick()
        return
      }
      if (e.code === 'Space') {
        e.preventDefault()
        playerRef.current.toggle()
      } else if (e.code === 'Escape') {
        if (showTeleprompter) {
          e.preventDefault()
          setTeleprompterDismissed(true)
          return
        }
        handleStop()
      } else if (e.key === 't' || e.key === 'T') {
        const live =
          playerRef.current.status === 'playing' || playerRef.current.status === 'paused'
        if (!live || inlineEdit || noPlayableText) return
        e.preventDefault()
        if (showTeleprompter) {
          setTeleprompterDismissed(true)
          return
        }
        setTeleprompterMode(true)
        setTeleprompterDismissed(false)
      } else if (e.key === '[' || e.code === 'ArrowLeft') {
        e.preventDefault()
        void playerRef.current.skipChunk(-1)
      } else if (e.key === ']' || e.code === 'ArrowRight') {
        e.preventDefault()
        void playerRef.current.skipChunk(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleStop, showTeleprompter, inlineEdit, noPlayableText, handlePasteClick])

  const parseKey = `${activeDocId}:${parsed.words.length}:${parsed.chunks.length}:${markdown.length}`

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-0">
      {showTeleprompter && (
        <TeleprompterOverlay
          words={parsed.words}
          activeWordIdx={player.activeWordIdx}
          playing={player.status === 'playing'}
          onWordClick={onWordClick}
          onDismiss={() => setTeleprompterDismissed(true)}
        />
      )}
      <div
        className={`flex min-w-0 min-h-[min(50vh,28rem)] flex-col panel-card lg:min-h-0 lg:flex-1 ${READER_MAX_H}`}
      >
        <ReaderChrome
          inlineEdit={inlineEdit}
          sourceName={sourceName}
          onTitleChange={onTitleChange}
          fontSize={fontSize}
          onFontSizeChange={onFontSizeChange}
          onPaste={() => void handlePasteClick()}
          onToggleInlineEdit={() => setInlineEdit((v) => !v)}
        />

        {inlineEdit ? (
          <textarea
            ref={inlineEditorRef}
            id="md-inline-editor"
            spellCheck={false}
            value={markdown}
            onChange={(e) => onMarkdownChange(e.target.value)}
            onPaste={(e) => {
              // Native insert-at-caret paste. Only treat a full-document replace
              // when the editor is empty (same as "paste into empty preview").
              if (markdown.trim()) return
              const text = e.clipboardData.getData('text/plain')
              if (!text.trim()) return
              e.preventDefault()
              replaceContentAndResetPlayback(text)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setInlineEdit(false)
              }
            }}
            className="w-full min-h-0 flex-1 resize-none overflow-y-auto border-0 bg-ink-950/40 px-4 py-4 font-mono leading-[1.65] text-ink-100 caret-amber-200 [tab-size:2] selection:bg-amber-300/25 focus:outline-none"
            style={{ fontSize: `${fontSize}px` }}
            aria-label="Markdown source (inline editor)"
            placeholder="Write or paste Markdown…"
          />
        ) : noPlayableText ? (
          <ReaderEmptyState
            onOpenFileTab={onOpenFileTab}
            onOpenPasteTab={onOpenPasteTab}
            onWriteHere={() => setInlineEdit(true)}
            onPasteFromClipboard={() => void handlePasteClick()}
          />
        ) : (
          <div
            className={
              'relative min-h-0 min-w-0 flex-1' + (showResumeNudge && resumeNudge ? ' pt-[4.5rem]' : '')
            }
          >
            {showResumeNudge && resumeNudge && (
              <ResumeBanner
                at={resumeNudge.at}
                total={resumeNudge.total}
                onContinue={() => {
                  setResumeBannerDismissedKey(resumeBannerKey)
                  void player.play()
                }}
                onFromStart={onResumeFromStart}
                onDismiss={() => setResumeBannerDismissedKey(resumeBannerKey)}
              />
            )}
            <MarkdownReader
              reactNode={parsed.reactNode}
              parseKey={parseKey}
              onWordClick={onWordClick}
              onActiveVisibilityChange={onActiveVisibilityChange}
              ref={readerRef}
              className="markdown-body min-h-0 min-w-0 h-full max-h-full flex-1 overflow-y-auto px-5 py-4"
              style={{ ['--reader-font-size' as string]: `${fontSize}px`, fontSize: `${fontSize}px` }}
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

      <ColumnResizeHandle
        value={controlsWidth}
        min={CONTROLS_WIDTH_MIN}
        max={CONTROLS_WIDTH_MAX}
        onChange={onControlsWidthChange}
        onReset={() => onControlsWidthChange(DEFAULT_APP_SETTINGS.controlsWidth)}
        panelSide="start"
        ariaLabel="Resize controls panel"
        className={`hidden lg:block ${readingFocus ? 'reading-focus-dim' : ''}`}
      />

      <aside
        className={`min-w-0 w-full space-y-3 lg:shrink-0 lg:w-[var(--controls-width)] ${
          readingFocus ? 'reading-focus-dim' : ''
        }`}
        style={{ ['--controls-width' as string]: `${controlsWidth}px` }}
      >
        <Controls
          status={player.status}
          device={player.device}
          voices={player.voices}
          voice={voice}
          speed={speed}
          volume={volume}
          progress={player.progress}
          error={player.error}
          totalChunks={parsed.chunks.length}
          currentChunkIdx={player.currentChunkIdx}
          totalWords={parsed.words.length}
          activeWordIdx={player.activeWordIdx}
          analyserRef={player.analyserRef}
          onVoice={setVoice}
          onSpeed={setSpeed}
          onVolume={setVolume}
          onPlay={player.play}
          onPause={player.pause}
          onStop={handleStop}
          onPrevChunk={() => void player.skipChunk(-1)}
          onNextChunk={() => void player.skipChunk(1)}
          teleprompterMode={teleprompterMode}
          onTeleprompterMode={(enabled) => {
            setTeleprompterMode(enabled)
            if (enabled) setTeleprompterDismissed(false)
          }}
        />

        <div className="panel-card p-3 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-ink-400">Source</span>
            <span className="font-mono text-ink-200 truncate max-w-[180px]" title={sourceName}>
              {sourceName}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-400">Words</span>
            <span className="font-mono text-ink-200">{parsed.words.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-400">Chunks</span>
            <span className="font-mono text-ink-200">{parsed.chunks.length}</span>
          </div>
        </div>

        <div className="panel-card p-3 text-[11px] text-ink-400 leading-relaxed">
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-ink-200">Space</kbd>{' '}
          play / pause ·{' '}
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-ink-200">⌘V</kbd>{' '}
          paste ·{' '}
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-ink-200">T</kbd>{' '}
          teleprompter ·{' '}
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-ink-200">Esc</kbd> stop ·{' '}
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-ink-200">[</kbd>/
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-ink-200">]</kbd> prev /
          next chunk
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
