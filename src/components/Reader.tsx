import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from 'react'
import { MarkdownReader, type MarkdownReaderHandle, type PlayheadVisibility } from './MarkdownReader'
import { Controls } from './Controls'
import { ColumnResizeHandle } from './ColumnResizeHandle'
import { ResumeBanner } from './ResumeBanner'
import { ReaderChrome } from './ReaderChrome'
import { ReaderEmptyState } from './ReaderEmptyState'
import { PreviewSearchBar } from './PreviewSearchBar'
import { PreviewOutline } from './PreviewOutline'
import { RecentsList } from './RecentsList'
import { TeleprompterOverlay } from './TeleprompterOverlay'
import { FileUploader } from './FileUploader'
import { ShortcutsHelp } from './ShortcutsHelp'
import { ReaderHud } from './ReaderHud'
import { usePlayer } from '../lib/usePlayer'
import {
  loadAppSettings,
  saveAppSettings,
  CONTROLS_WIDTH_MIN,
  CONTROLS_WIDTH_MAX,
  DEFAULT_APP_SETTINGS,
  SPEED_STEP,
  clampFontSize,
  clampSpeed,
} from '../lib/appSettings'
import type { ReadingPresetId } from '../lib/readingPresets'
import {
  MEASURE_WIDTH_DEFAULT,
  MEASURE_WIDTH_MAX,
  MEASURE_WIDTH_STEP,
  clampMeasureWidth,
  measureWidthCss,
} from '../lib/readingPresets'
import { readingBrightnessCssVars } from '../lib/readingBrightness'
import {
  resolveReadingLeading,
  resolveReadingParagraph,
  resolveReadingTracking,
  type ReadingLeadingId,
  type ReadingParagraphId,
  type ReadingTrackingId,
} from '../lib/readingRhythm'
import {
  readingTypographyMeta,
  type ReadingTypographyId,
} from '../lib/readingTypography'
import type { ParsedDocument } from '../lib/parseDocument'
import { sortRecents, type RecentsSort, type StoredDocument } from '../lib/documentStore'
import { scrollHeadingIntoContainer } from '../lib/documentOutline'
import { adjacentSentenceStart, sentenceStartIndices } from '../lib/sentenceNav'
import {
  applyPreviewSearchHighlights,
  clearPreviewSearchHighlights,
  cssHighlightSupported,
  findTextRanges,
  rangeOverlayBoxes,
  scrollRangeIntoContainer,
} from '../lib/previewSearch'
import { MARKDOWN_FILE_ACCEPT, readMarkdownFile } from '../lib/readMarkdownFile'

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
  onFile: (name: string, text: string) => void
  documents: StoredDocument[]
  onSelectDocument: (id: string) => void
  onNewDocument: () => void
  onDeleteDocument: (id: string) => void
  /** Fires whenever audio playback starts (play, resume, or seek to word). */
  onPlaybackBegan?: () => void
  /** True while speaking/paused in normal (non-teleprompter) mode — immersive listen layout. */
  onReadingFocusChange?: (focused: boolean) => void
  fontSize: number
  onFontSizeChange: (size: number) => void
  readingPreset: ReadingPresetId
  onReadingPresetChange: (preset: ReadingPresetId) => void
  readingTypography: ReadingTypographyId
  onReadingTypographyChange: (id: ReadingTypographyId) => void
  readingBrightness: number
  onReadingBrightnessChange: (brightness: number) => void
  measureWidth: number
  onMeasureWidthChange: (ch: number) => void
  readingLeading: ReadingLeadingId
  onReadingLeadingChange: (id: ReadingLeadingId) => void
  readingTracking: ReadingTrackingId
  onReadingTrackingChange: (id: ReadingTrackingId) => void
  readingParagraph: ReadingParagraphId
  onReadingParagraphChange: (id: ReadingParagraphId) => void
  controlsWidth: number
  onControlsWidthChange: (width: number) => void
}

const READER_MAX_H = 'reader-panel min-h-0 flex-1'
const UI_SAVE_MS = 400
const RESUME_DEBOUNCE_MS = 700
const SEARCH_DEBOUNCE_MS = 150
const USE_CSS_HIGHLIGHT = cssHighlightSupported()

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
  onFile,
  documents,
  onSelectDocument,
  onNewDocument,
  onDeleteDocument,
  onPlaybackBegan,
  onReadingFocusChange,
  fontSize,
  onFontSizeChange,
  readingPreset,
  onReadingPresetChange,
  readingTypography,
  onReadingTypographyChange,
  readingBrightness,
  onReadingBrightnessChange,
  measureWidth,
  onMeasureWidthChange,
  readingLeading,
  onReadingLeadingChange,
  readingTracking,
  onReadingTrackingChange,
  readingParagraph,
  onReadingParagraphChange,
  controlsWidth,
  onControlsWidthChange,
}: Props) {
  const readerRef = useRef<MarkdownReaderHandle>(null)
  const readerSurfaceRef = useRef<HTMLDivElement>(null)
  const fontSizeRef = useRef(fontSize)
  fontSizeRef.current = fontSize
  const measureWidthRef = useRef(measureWidth)
  measureWidthRef.current = measureWidth
  const face = readingTypographyMeta(readingTypography)
  const surfaceStyle = useMemo(
    () =>
      ({
        ...readingBrightnessCssVars(readingPreset, readingBrightness),
        ['--reader-font' as string]: face.stack,
        ['--reader-leading' as string]: resolveReadingLeading(readingLeading, face.leading),
        ['--reader-tracking' as string]: resolveReadingTracking(readingTracking, face.tracking),
        ['--reader-paragraph-gap' as string]: resolveReadingParagraph(readingParagraph),
      }) as CSSProperties,
    [
      readingPreset,
      readingBrightness,
      face.stack,
      face.leading,
      face.tracking,
      readingLeading,
      readingTracking,
      readingParagraph,
    ],
  )
  const previewFrameRef = useRef<HTMLDivElement>(null)
  const inlineEditorRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [inlineEdit, setInlineEdit] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [bookmarkWordIdx, setBookmarkWordIdx] = useState<number | null>(null)
  const [hudMessage, setHudMessage] = useState<string | null>(null)
  const hudTimer = useRef<number>(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatches, setSearchMatches] = useState<Range[]>([])
  const [searchIndex, setSearchIndex] = useState(0)
  const [searchFocusNonce, setSearchFocusNonce] = useState(0)
  const [overlayBoxes, setOverlayBoxes] = useState<
    Array<{ top: number; left: number; width: number; height: number }>
  >([])
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null)
  const searchMatchesRef = useRef<Range[]>([])
  const searchIndexRef = useRef(0)
  const outlineUnlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const useCssHighlight = USE_CSS_HIGHLIGHT

  const noPlayableText = !markdown.trim() || parsed.words.length === 0

  const [voice, setVoice] = useState(() => loadAppSettings().voice)
  const [speed, setSpeed] = useState(() => loadAppSettings().speed)
  const [volume, setVolume] = useState(() => loadAppSettings().volume)
  const [recentsSort, setRecentsSort] = useState<RecentsSort>(() => loadAppSettings().recentsSort)
  const [teleprompterMode, setTeleprompterMode] = useState(
    () => loadAppSettings().teleprompterMode,
  )
  /** Session-only hide (Esc / Exit) without flipping the saved preference. */
  const [teleprompterDismissed, setTeleprompterDismissed] = useState(false)
  const [playhead, setPlayhead] = useState<PlayheadVisibility>({ inView: true, out: null })
  const [nowPlayingVisible, setNowPlayingVisible] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
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
    return () => {
      if (resumeTimer.current) {
        clearTimeout(resumeTimer.current)
        resumeTimer.current = null
      }
    }
  }, [])

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
    documentId: activeDocId,
    chunks: parsed.chunks,
    voice,
    speed,
    volume,
    onActiveWord,
    resumeAtWordIdx,
  })

  const activeWordStore = useMemo(
    () => ({
      subscribeActiveWord: player.subscribeActiveWord,
      getActiveWord: player.getActiveWord,
    }),
    [player.subscribeActiveWord, player.getActiveWord],
  )

  const sentenceStarts = useMemo(
    () => sentenceStartIndices(parsed.words),
    [parsed.words],
  )

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

  const immersive = readingFocus || focusMode

  useEffect(() => {
    if (inlineEdit && focusMode) setFocusMode(false)
  }, [inlineEdit, focusMode])

  useEffect(() => {
    setBookmarkWordIdx(null)
  }, [activeDocId])

  const showHud = useCallback((text: string, ms = 900) => {
    setHudMessage(text)
    window.clearTimeout(hudTimer.current)
    hudTimer.current = window.setTimeout(() => setHudMessage(null), ms)
  }, [])

  useEffect(() => {
    return () => window.clearTimeout(hudTimer.current)
  }, [])

  const bumpFontSize = useCallback(
    (delta: number) => {
      const next = clampFontSize(fontSizeRef.current + delta)
      if (next === fontSizeRef.current) return
      onFontSizeChange(next)
      showHud(`${next}px`)
    },
    [onFontSizeChange, showHud],
  )

  const bumpMeasureWidth = useCallback(
    (delta: number) => {
      const next = clampMeasureWidth(measureWidthRef.current + delta)
      if (next === measureWidthRef.current) return
      onMeasureWidthChange(next)
      showHud(next >= MEASURE_WIDTH_MAX ? 'Full width' : `${next}ch`)
    },
    [onMeasureWidthChange, showHud],
  )

  const resetReadingZoom = useCallback(() => {
    onFontSizeChange(DEFAULT_APP_SETTINGS.fontSize)
    onMeasureWidthChange(MEASURE_WIDTH_DEFAULT)
    showHud(`${DEFAULT_APP_SETTINGS.fontSize}px · ${MEASURE_WIDTH_DEFAULT}ch`)
  }, [onFontSizeChange, onMeasureWidthChange, showHud])

  const bumpSpeed = useCallback(
    (delta: number) => {
      setSpeed((prev) => {
        const next = clampSpeed(prev + delta)
        if (next !== prev) showHud(`${next.toFixed(2)}×`)
        return next
      })
    },
    [showHud],
  )

  const sortedDocuments = useMemo(
    () =>
      sortRecents(documents, recentsSort, (d) =>
        d.id === activeDocId ? sourceName : d.title,
      ),
    [documents, activeDocId, sourceName, recentsSort],
  )

  useEffect(() => {
    onReadingFocusChange?.(immersive)
    return () => onReadingFocusChange?.(false)
  }, [immersive, onReadingFocusChange])

  useEffect(() => {
    if (player.status === 'ready' || player.status === 'idle' || player.status === 'finished') {
      // Defer so we don't cascade a render from the status sync effect.
      let cancelled = false
      queueMicrotask(() => {
        if (cancelled) return
        setTeleprompterDismissed(false)
      })
      return () => {
        cancelled = true
      }
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

  const skipSentence = useCallback(
    (delta: 1 | -1) => {
      const words = parsed.words
      if (words.length === 0) return
      const from =
        playerRef.current.getActiveWord() >= 0
          ? playerRef.current.getActiveWord()
          : (words[0]?.idx ?? 0)
      const target = adjacentSentenceStart(words, from, delta, sentenceStarts)
      if (target == null) return
      void playerRef.current.seekToWord(target)
      showHud(delta > 0 ? 'Next sentence' : 'Previous sentence')
    },
    [parsed.words, sentenceStarts, showHud],
  )

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

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const onFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      void readMarkdownFile(file).then((result) => {
        if (result.ok) onFile(result.name, result.text)
      })
    },
    [onFile],
  )

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

  const onWordClick = useCallback(
    (wIdx: number) => {
      void playerRef.current.seekToWord(wIdx)
      const word = parsed.words.find((w) => w.idx === wIdx)
      showHud(word ? `Playing from “${word.text}”` : 'Playing from here', 1200)
    },
    [parsed.words, showHud],
  )

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
    let innerId = 0
    const outerId = requestAnimationFrame(() => {
      innerId = requestAnimationFrame(() => {
        const h = readerRef.current
        if (!h) return
        h.setActive(w)
        h.scrollToActiveNow()
      })
    })
    return () => {
      cancelAnimationFrame(outerId)
      if (innerId) cancelAnimationFrame(innerId)
    }
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

  const parseKey = `${activeDocId}:${parsed.words.length}:${parsed.chunks.length}:${markdown.length}`
  const outline = parsed.outline
  const outlineAvailable = outline.length > 0 && !inlineEdit && !noPlayableText

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchMatches([])
    setSearchIndex(0)
    searchMatchesRef.current = []
    searchIndexRef.current = 0
    setOverlayBoxes([])
    clearPreviewSearchHighlights()
    readerRef.current?.setAutoScrollLocked(false)
  }, [])

  const openSearch = useCallback(() => {
    if (inlineEdit || noPlayableText || showTeleprompter) return
    setOutlineOpen(false)
    setSearchOpen(true)
    setSearchFocusNonce((n) => n + 1)
    readerRef.current?.setAutoScrollLocked(true)
  }, [inlineEdit, noPlayableText, showTeleprompter])

  const paintSearchHit = useCallback(
    (ranges: Range[], index: number) => {
      const container = readerRef.current?.getContainer()
      if (!container) {
        setOverlayBoxes([])
        return
      }
      if (ranges.length === 0 || index < 0 || index >= ranges.length) {
        clearPreviewSearchHighlights()
        setOverlayBoxes([])
        return
      }
      const range = ranges[index]!
      scrollRangeIntoContainer(container, range)
      if (useCssHighlight) {
        applyPreviewSearchHighlights(ranges, index)
        setOverlayBoxes([])
      } else {
        clearPreviewSearchHighlights()
        const frame = previewFrameRef.current
        setOverlayBoxes(frame ? rangeOverlayBoxes(range, frame) : [])
      }
    },
    [useCssHighlight],
  )

  const goToSearchMatch = useCallback(
    (nextIndex: number) => {
      const ranges = searchMatchesRef.current
      if (ranges.length === 0) return
      const idx = ((nextIndex % ranges.length) + ranges.length) % ranges.length
      searchIndexRef.current = idx
      setSearchIndex(idx)
      paintSearchHit(ranges, idx)
    },
    [paintSearchHit],
  )

  const goNextSearch = useCallback(() => {
    goToSearchMatch(searchIndexRef.current + 1)
  }, [goToSearchMatch])

  const goPrevSearch = useCallback(() => {
    goToSearchMatch(searchIndexRef.current - 1)
  }, [goToSearchMatch])

  const searchActive = searchOpen && !inlineEdit && !noPlayableText && !showTeleprompter

  // Delay the "Now playing" chip so brief scroll jitter doesn't flash it.
  useEffect(() => {
    const away =
      !playhead.inView &&
      Boolean(playhead.out) &&
      !searchActive &&
      (player.status === 'playing' || player.status === 'paused')
    if (!away) {
      setNowPlayingVisible(false)
      return
    }
    const t = setTimeout(() => setNowPlayingVisible(true), 900)
    return () => clearTimeout(t)
  }, [playhead.inView, playhead.out, searchActive, player.status])

  // Close the sections rail when editing or entering teleprompter.
  useEffect(() => {
    if (inlineEdit || showTeleprompter) setOutlineOpen(false)
  }, [inlineEdit, showTeleprompter])

  const jumpToOutlineSection = useCallback(
    (id: string) => {
      const reader = readerRef.current
      const container = reader?.getContainer()
      if (!reader || !container) return
      const heading = container.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
      if (!heading) return

      setActiveOutlineId(id)
      // Pause karaoke follow so jumping sections isn't yanked back.
      reader.setAutoScrollLocked(true)
      if (outlineUnlockTimer.current) clearTimeout(outlineUnlockTimer.current)
      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      scrollHeadingIntoContainer(container, heading, {
        behavior: reduced ? 'auto' : 'smooth',
      })
      outlineUnlockTimer.current = setTimeout(() => {
        outlineUnlockTimer.current = null
        // Keep locked if find-in-preview took over meanwhile.
        if (!searchOpen) readerRef.current?.setAutoScrollLocked(false)
      }, 2800)
    },
    [searchOpen],
  )

  // Track which section is in view inside the preview scrollport.
  useEffect(() => {
    if (!outlineAvailable || outline.length === 0) {
      setActiveOutlineId(null)
      return
    }
    const container = readerRef.current?.getContainer()
    if (!container) return

    const headings = outline
      .map((item) => container.querySelector<HTMLElement>(`#${CSS.escape(item.id)}`))
      .filter((el): el is HTMLElement => Boolean(el))
    if (headings.length === 0) {
      setActiveOutlineId(null)
      return
    }

    const visible = new Map<string, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id
          if (!id) continue
          if (entry.isIntersecting) visible.set(id, entry.intersectionRatio)
          else visible.delete(id)
        }
        // Prefer the topmost intersecting heading in document order.
        let next: string | null = null
        for (const item of outline) {
          if (visible.has(item.id)) {
            next = item.id
            break
          }
        }
        if (next == null && headings[0]) {
          // Above all headings → first; below all → last.
          const first = headings[0].getBoundingClientRect()
          const c = container.getBoundingClientRect()
          next = first.top >= c.bottom ? outline[0]!.id : outline[outline.length - 1]!.id
        }
        setActiveOutlineId((prev) => (prev === next ? prev : next))
      },
      {
        root: container,
        // Bias toward the upper band of the viewport (reading eye-line).
        rootMargin: '-8% 0px -72% 0px',
        threshold: [0, 0.25, 0.5, 1],
      },
    )
    headings.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [outlineAvailable, outline, parseKey])

  useEffect(() => {
    return () => {
      if (outlineUnlockTimer.current) clearTimeout(outlineUnlockTimer.current)
    }
  }, [])

  // Recompute matches when the query or document changes (debounced for large docs).
  useEffect(() => {
    if (!searchActive) {
      searchMatchesRef.current = []
      clearPreviewSearchHighlights()
      return
    }
    const container = readerRef.current?.getContainer()
    if (!container) {
      searchMatchesRef.current = []
      clearPreviewSearchHighlights()
      setSearchMatches([])
      setSearchIndex(0)
      setOverlayBoxes([])
      return
    }
    const t = window.setTimeout(() => {
      const ranges = findTextRanges(container, searchQuery)
      searchMatchesRef.current = ranges
      setSearchMatches(ranges)
      searchIndexRef.current = 0
      setSearchIndex(0)
      paintSearchHit(ranges, 0)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [searchActive, searchQuery, parseKey, paintSearchHit])

  // Lock karaoke auto-scroll while find is active so hits stay navigable.
  useEffect(() => {
    const reader = readerRef.current
    if (!searchActive) {
      reader?.setAutoScrollLocked(false)
      clearPreviewSearchHighlights()
      return
    }
    reader?.setAutoScrollLocked(true)
    return () => {
      reader?.setAutoScrollLocked(false)
      clearPreviewSearchHighlights()
    }
  }, [searchActive])

  // Keep overlay boxes aligned if the user scrolls (Highlight API fallback only).
  useEffect(() => {
    if (!searchActive || useCssHighlight) return
    const container = readerRef.current?.getContainer()
    const frame = previewFrameRef.current
    if (!container || !frame) return
    const sync = () => {
      const ranges = searchMatchesRef.current
      const idx = searchIndexRef.current
      if (ranges.length === 0 || idx < 0 || idx >= ranges.length) {
        setOverlayBoxes([])
        return
      }
      setOverlayBoxes(rangeOverlayBoxes(ranges[idx]!, frame))
    }
    container.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)
    return () => {
      container.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [searchActive, useCssHighlight, searchMatches, searchIndex])

  useEffect(() => {
    const el = readerSurfaceRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      // macOS often remaps Shift+wheel to deltaX (horizontal).
      const raw = e.shiftKey
        ? e.deltaY !== 0
          ? e.deltaY
          : e.deltaX
        : e.deltaY
      if (raw === 0) return
      e.preventDefault()
      const delta = raw < 0 ? 1 : -1
      if (e.shiftKey) {
        bumpMeasureWidth(delta * MEASURE_WIDTH_STEP)
        return
      }
      bumpFontSize(delta)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [bumpFontSize, bumpMeasureWidth])

  // Stable keydown listener — volatile state/callbacks live in a ref so toggling
  // help/outline/search does not tear down and re-attach the window handler.
  const keydownCtxRef = useRef({
    inlineEdit,
    noPlayableText,
    showTeleprompter,
    searchActive,
    helpOpen,
    focusMode,
    outlineOpen,
    outlineAvailable,
    bookmarkWordIdx,
    openResume,
    activeDocId,
    sortedDocuments,
    parsedWords: parsed.words,
    handleStop,
    handlePasteClick,
    openSearch,
    closeSearch,
    goNextSearch,
    goPrevSearch,
    bumpFontSize,
    resetReadingZoom,
    onSelectDocument,
    showHud,
    skipSentence,
    bumpSpeed,
  })
  keydownCtxRef.current = {
    inlineEdit,
    noPlayableText,
    showTeleprompter,
    searchActive,
    helpOpen,
    focusMode,
    outlineOpen,
    outlineAvailable,
    bookmarkWordIdx,
    openResume,
    activeDocId,
    sortedDocuments,
    parsedWords: parsed.words,
    handleStop,
    handlePasteClick,
    openSearch,
    closeSearch,
    goNextSearch,
    goPrevSearch,
    bumpFontSize,
    resetReadingZoom,
    onSelectDocument,
    showHud,
    skipSentence,
    bumpSpeed,
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctx = keydownCtxRef.current
      const isMod = e.metaKey || e.ctrlKey
      const inField =
        e.target instanceof HTMLElement &&
        (e.target.tagName === 'INPUT' ||
          e.target.tagName === 'TEXTAREA' ||
          e.target.tagName === 'SELECT' ||
          e.target.isContentEditable)

      if (isMod && (e.key === 'f' || e.key === 'F')) {
        if (ctx.inlineEdit || ctx.noPlayableText || ctx.showTeleprompter) return
        e.preventDefault()
        ctx.openSearch()
        return
      }
      if (isMod && (e.key === 'g' || e.key === 'G')) {
        if (!ctx.searchActive || searchMatchesRef.current.length === 0) return
        e.preventDefault()
        if (e.shiftKey) ctx.goPrevSearch()
        else ctx.goNextSearch()
        return
      }
      if (isMod && (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd')) {
        e.preventDefault()
        ctx.bumpFontSize(1)
        return
      }
      if (isMod && (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract')) {
        e.preventDefault()
        ctx.bumpFontSize(-1)
        return
      }
      if (isMod && (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0')) {
        e.preventDefault()
        ctx.resetReadingZoom()
        return
      }
      if (isMod && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        if (ctx.sortedDocuments.length === 0) return
        e.preventDefault()
        const cur = ctx.sortedDocuments.findIndex((d) => d.id === ctx.activeDocId)
        const delta = e.key === 'ArrowUp' ? -1 : 1
        const next =
          ctx.sortedDocuments[
            (cur < 0 ? 0 : cur + delta + ctx.sortedDocuments.length) % ctx.sortedDocuments.length
          ]
        if (next && next.id !== ctx.activeDocId) ctx.onSelectDocument(next.id)
        return
      }
      if (isMod && !e.altKey && e.key >= '1' && e.key <= '9') {
        const doc = ctx.sortedDocuments[Number(e.key) - 1]
        if (!doc) return
        e.preventDefault()
        if (doc.id !== ctx.activeDocId) ctx.onSelectDocument(doc.id)
        return
      }
      if (isMod && (e.key === 'v' || e.key === 'V')) {
        if (inField || ctx.inlineEdit || ctx.showTeleprompter) return
        e.preventDefault()
        void ctx.handlePasteClick()
        return
      }
      if (e.key === '/' && !e.shiftKey && !isMod && !e.altKey) {
        if (inField || ctx.showTeleprompter) return
        e.preventDefault()
        const next = !ctx.inlineEdit
        if (next) ctx.closeSearch()
        setInlineEdit(next)
        ctx.showHud(next ? 'Editing' : 'Preview')
        return
      }
      if ((e.key === 'o' || e.key === 'O') && !isMod) {
        if (inField || ctx.inlineEdit || ctx.showTeleprompter) return
        e.preventDefault()
        if (!ctx.outlineAvailable) {
          ctx.showHud('No sections')
          return
        }
        const next = !ctx.outlineOpen
        if (next) ctx.closeSearch()
        setOutlineOpen(next)
        ctx.showHud(next ? 'Sections' : 'Sections hidden')
        return
      }
      if (inField) return

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        setHelpOpen((v) => !v)
        return
      }
      if (ctx.helpOpen) {
        if (e.code === 'Escape') {
          e.preventDefault()
          setHelpOpen(false)
        }
        return
      }

      if (e.code === 'Space') {
        e.preventDefault()
        playerRef.current.toggle()
      } else if (e.code === 'Escape') {
        if (ctx.searchActive) {
          e.preventDefault()
          ctx.closeSearch()
          return
        }
        if (ctx.outlineOpen) {
          e.preventDefault()
          setOutlineOpen(false)
          ctx.showHud('Sections hidden')
          return
        }
        if (ctx.showTeleprompter) {
          e.preventDefault()
          setTeleprompterDismissed(true)
          return
        }
        if (ctx.focusMode) {
          e.preventDefault()
          setFocusMode(false)
          return
        }
        ctx.handleStop()
      } else if (e.key === 'f' || e.key === 'F') {
        if (ctx.inlineEdit || ctx.noPlayableText || ctx.showTeleprompter) return
        e.preventDefault()
        const next = !ctx.focusMode
        setFocusMode(next)
        ctx.showHud(next ? 'Focus mode' : 'Focus off')
      } else if (e.key === 'b' || e.key === 'B') {
        if (ctx.noPlayableText) return
        e.preventDefault()
        const active = playerRef.current.getActiveWord()
        const w =
          active >= 0
            ? active
            : ctx.openResume > 0
              ? ctx.openResume
              : (ctx.parsedWords[0]?.idx ?? null)
        if (w == null) return
        setBookmarkWordIdx(w)
        const word = ctx.parsedWords.find((t) => t.idx === w)
        ctx.showHud(word ? `Bookmark “${word.text}”` : 'Bookmark set')
      } else if (e.key === "'") {
        if (ctx.bookmarkWordIdx == null) {
          ctx.showHud('No bookmark')
          return
        }
        e.preventDefault()
        void playerRef.current.seekToWord(ctx.bookmarkWordIdx)
        ctx.showHud('Jumped to bookmark')
      } else if (e.key === 't' || e.key === 'T') {
        const live =
          playerRef.current.status === 'playing' || playerRef.current.status === 'paused'
        if (!live || ctx.inlineEdit || ctx.noPlayableText) return
        e.preventDefault()
        if (ctx.showTeleprompter) {
          setTeleprompterDismissed(true)
          return
        }
        ctx.closeSearch()
        setTeleprompterMode(true)
        setTeleprompterDismissed(false)
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault()
        ctx.skipSentence(1)
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        ctx.skipSentence(-1)
      } else if (e.key === ',' || e.key === '<') {
        e.preventDefault()
        ctx.bumpSpeed(-SPEED_STEP)
      } else if (e.key === '.' || e.key === '>') {
        e.preventDefault()
        ctx.bumpSpeed(SPEED_STEP)
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
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept={MARKDOWN_FILE_ACCEPT}
        className="hidden"
        onChange={onFileInputChange}
      />
      <ShortcutsHelp
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        backend={player.device}
      />
      {showTeleprompter && (
        <TeleprompterOverlay
          words={parsed.words}
          activeWordStore={activeWordStore}
          playing={player.status === 'playing'}
          canSkip={parsed.chunks.length > 1}
          onWordClick={onWordClick}
          onTogglePlay={() => player.toggle()}
          onPrevChunk={() => void player.skipChunk(-1)}
          onNextChunk={() => void player.skipChunk(1)}
          onDismiss={() => setTeleprompterDismissed(true)}
        />
      )}

      <ReaderChrome
        inlineEdit={inlineEdit}
        sourceName={sourceName}
        onTitleChange={onTitleChange}
        fontSize={fontSize}
        onFontSizeChange={onFontSizeChange}
        readingPreset={readingPreset}
        onReadingPresetChange={onReadingPresetChange}
        readingTypography={readingTypography}
        onReadingTypographyChange={onReadingTypographyChange}
        readingBrightness={readingBrightness}
        onReadingBrightnessChange={onReadingBrightnessChange}
        measureWidth={measureWidth}
        onMeasureWidthChange={onMeasureWidthChange}
        readingLeading={readingLeading}
        onReadingLeadingChange={onReadingLeadingChange}
        readingTracking={readingTracking}
        onReadingTrackingChange={onReadingTrackingChange}
        readingParagraph={readingParagraph}
        onReadingParagraphChange={onReadingParagraphChange}
        onPaste={() => void handlePasteClick()}
        onOpenFile={openFilePicker}
        onToggleInlineEdit={() => {
          setInlineEdit((v) => {
            if (!v) closeSearch()
            return !v
          })
        }}
        onOpenSearch={openSearch}
        searchOpen={searchActive}
        onToggleOutline={() => {
          setOutlineOpen((v) => {
            if (!v) closeSearch()
            return !v
          })
        }}
        outlineOpen={outlineOpen}
        outlineAvailable={outlineAvailable}
        listening={immersive}
      />

      <div className={`flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-0 ${focusMode ? 'is-focus-mode' : ''}`}>
      <aside
        className="studio-deck min-w-0 w-full lg:shrink-0 lg:w-[var(--controls-width)] lg:min-h-0 lg:overflow-y-auto"
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
          activeWordStore={activeWordStore}
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
            if (enabled) closeSearch()
            setTeleprompterMode(enabled)
            if (enabled) setTeleprompterDismissed(false)
          }}
          buffering={player.buffering}
          chunkReadyTick={player.chunkReadyTick}
        />

        <div
          className={`studio-shelf ${immersive ? 'is-collapsed' : ''}`}
          inert={immersive || undefined}
          aria-hidden={immersive || undefined}
        >
          <div className="studio-shelf-inner">
            <FileUploader onFile={onFile} compact label="Open Markdown" />
            <RecentsList
              documents={documents}
              activeId={activeDocId}
              title={sourceName}
              onSelectDocument={onSelectDocument}
              onNewDocument={onNewDocument}
              onDeleteDocument={onDeleteDocument}
              onOpenFile={openFilePicker}
              recentsSort={recentsSort}
              onRecentsSortChange={setRecentsSort}
            />
          </div>
        </div>
      </aside>

      <ColumnResizeHandle
        value={controlsWidth}
        min={CONTROLS_WIDTH_MIN}
        max={CONTROLS_WIDTH_MAX}
        onChange={onControlsWidthChange}
        onReset={() => onControlsWidthChange(DEFAULT_APP_SETTINGS.controlsWidth)}
        panelSide="end"
        ariaLabel="Resize controls panel"
        className={`column-resize-handle hidden lg:block ${focusMode ? '!hidden' : ''}`}
      />

      <div
        ref={readerSurfaceRef}
        className={`relative flex min-w-0 min-h-[min(50vh,28rem)] flex-col panel-card lg:min-h-0 lg:flex-1 ${READER_MAX_H}`}
      >
        <ReaderHud message={hudMessage} />
        {searchActive && (
          <PreviewSearchBar
            query={searchQuery}
            onQueryChange={setSearchQuery}
            matchCount={searchMatches.length}
            currentIndex={searchMatches.length === 0 ? -1 : searchIndex}
            onNext={goNextSearch}
            onPrev={goPrevSearch}
            onClose={closeSearch}
            focusNonce={searchFocusNonce}
          />
        )}

        {inlineEdit ? (
          <div
            className="reader-preview flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            data-reading-preset={readingPreset}
            data-typography={readingTypography}
            style={surfaceStyle}
          >
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
              className="reader-editor-measure w-full min-h-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent py-5 font-mono leading-[1.7] caret-amber-200 [tab-size:2] selection:bg-amber-300/25 focus:outline-none sm:py-6"
              style={{
                fontSize: `${fontSize}px`,
                color: 'var(--reader-fg)',
                ['--reader-measure' as string]: measureWidthCss(measureWidth),
              }}
              aria-label="Markdown source (inline editor)"
              placeholder="Write or paste Markdown…"
            />
          </div>
        ) : noPlayableText ? (
          <ReaderEmptyState
            onOpenFile={openFilePicker}
            onWriteHere={() => setInlineEdit(true)}
            onPasteFromClipboard={() => void handlePasteClick()}
          />
        ) : (
          <div
            className={
              'relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[inherit]' +
              (showResumeNudge && resumeNudge ? ' pt-[4.5rem]' : '')
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
            {outlineAvailable && (
              <PreviewOutline
                items={outline}
                open={outlineOpen}
                onOpenChange={(open) => {
                  if (open) closeSearch()
                  setOutlineOpen(open)
                }}
                activeId={activeOutlineId}
                onSelect={jumpToOutlineSection}
              />
            )}
            <div
              ref={previewFrameRef}
              className="reader-preview relative min-h-0 min-w-0 flex-1 overflow-hidden"
              data-reading-preset={readingPreset}
              data-typography={readingTypography}
              style={surfaceStyle}
            >
              <MarkdownReader
                reactNode={parsed.reactNode}
                parseKey={parseKey}
                onWordClick={onWordClick}
                onActiveVisibilityChange={onActiveVisibilityChange}
                ref={readerRef}
                className="markdown-body reader-measure min-h-0 min-w-0 h-full max-h-full flex-1 overflow-y-auto py-6 sm:py-8"
                style={{
                  ['--reader-font-size' as string]: `${fontSize}px`,
                  ['--reader-measure' as string]: measureWidthCss(measureWidth),
                  fontSize: `${fontSize}px`,
                }}
              />
              {!useCssHighlight &&
                overlayBoxes.map((box, i) => (
                  <div
                    key={i}
                    className="pointer-events-none absolute z-[5] rounded-sm bg-sky-300/20 ring-1 ring-sky-200/30"
                    style={{
                      top: box.top,
                      left: box.left,
                      width: box.width,
                      height: box.height,
                    }}
                    aria-hidden
                  />
                ))}
              {nowPlayingVisible && playhead.out && (
                <div className="pointer-events-none absolute bottom-3 left-0 right-0 z-10 flex justify-center">
                  <button
                    type="button"
                    onClick={() => readerRef.current?.scrollToActiveNow()}
                    title={
                      playhead.out === 'above'
                        ? 'Current word is above — scroll up'
                        : 'Current word is below — scroll down'
                    }
                    className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-300/30 bg-ink-900/85 px-3.5 py-1.5 text-sm text-amber-100/95 shadow-md shadow-ink-950/30 backdrop-blur transition-colors hover:border-amber-200/50 hover:bg-ink-800/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
                  >
                    <PlayArrows direction={playhead.out} />
                    <span>Now playing</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {!noPlayableText && !inlineEdit && (
          <div className="flex shrink-0 items-center gap-3 border-t border-white/[0.05] px-4 py-1.5 text-[11px] text-ink-500">
            <span className="min-w-0 flex-1 truncate font-mono text-ink-400" title={sourceName}>
              {sourceName}
            </span>
            {bookmarkWordIdx != null && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void playerRef.current.seekToWord(bookmarkWordIdx)
                    showHud('Jumped to bookmark')
                  }}
                  title="Jump to bookmark (')"
                  className="shrink-0 rounded border border-amber-300/25 bg-amber-300/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-100/90 transition hover:bg-amber-300/20"
                >
                  Bookmark
                </button>
                <span className="shrink-0 text-ink-600" aria-hidden>
                  ·
                </span>
              </>
            )}
            {focusMode && (
              <>
                <span className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-ink-400">
                  Focus
                </span>
                <span className="shrink-0 text-ink-600" aria-hidden>
                  ·
                </span>
              </>
            )}
            <span className="shrink-0 tabular-nums">
              {parsed.words.length.toLocaleString()} word
              {parsed.words.length === 1 ? '' : 's'}
            </span>
            <span className="shrink-0 text-ink-600" aria-hidden>
              ·
            </span>
            <span className="shrink-0 tabular-nums">
              {parsed.chunks.length.toLocaleString()} chunk
              {parsed.chunks.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              title="Keyboard shortcuts (?)"
              aria-label="Keyboard shortcuts"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-transparent font-mono text-[11px] text-ink-500 transition-colors hover:border-white/10 hover:bg-white/[0.06] hover:text-ink-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/40"
            >
              ?
            </button>
          </div>
        )}
      </div>
      </div>
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
