import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { WordToken } from '../lib/tokenize'
import { useActiveWordIdx, type ActiveWordStore } from '../lib/usePlayer'

type Props = {
  words: WordToken[]
  activeWordStore: ActiveWordStore
  playing: boolean
  canSkip: boolean
  onWordClick: (wIdx: number) => void
  onTogglePlay: () => void
  onPrevChunk: () => void
  onNextChunk: () => void
  /** Hide overlay for this session without changing the saved preference. */
  onDismiss: () => void
}

type Line = {
  sentenceIdx: number
  words: WordToken[]
}

/** Eye-line from top of the scrollport (Apple Lyrics–ish). */
const EYE_LINE = 0.42
/** Per-frame lerp toward the target scroll — ~0.7–1s settle at 60fps. */
const SCROLL_LERP = 0.085
const SCROLL_DEAD_ZONE = 1.5
/** Cap sentence tick density so long docs stay readable. */
const MAX_SENTENCE_TICKS = 40
const PREVIEW_PHRASE_RADIUS = 2
/** Hide the dock after this much pointer idle (ms). */
const DOCK_IDLE_MS = 2200
/** Keep lines sharp this long after the user stops scrolling. */
const BROWSE_IDLE_MS = 900

/**
 * Teleprompter: large left-aligned type, active line sharp, neighbors blurred.
 * Manual scroll / hover clears blur so you can aim a click. Auto-scroll keeps
 * the playhead on the eye line unless the user is browsing.
 */
export function TeleprompterOverlay({
  words,
  activeWordStore,
  playing,
  canSkip,
  onWordClick,
  onTogglePlay,
  onPrevChunk,
  onNextChunk,
  onDismiss,
}: Props) {
  const activeWordIdx = useActiveWordIdx(activeWordStore)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([])
  const scrollRafRef = useRef<number | null>(null)
  const scrubbingRef = useRef(false)
  const dockHoverRef = useRef(false)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const browseIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Ignore scroll events fired by our eye-line lerp. */
  const programmaticScrollRef = useRef(false)
  /** activeWordIdx at the moment a seek was committed — used to detect when playback advances. */
  const pendingFromActiveRef = useRef<number | null>(null)
  /** Ordinal while the pointer is dragging the scrubber. */
  const [scrubOrdinal, setScrubOrdinal] = useState<number | null>(null)
  /** Ordinal held after commit until playback catches up (avoids snap-back while chunk loads). */
  const [pendingOrdinal, setPendingOrdinal] = useState<number | null>(null)
  const [dockVisible, setDockVisible] = useState(true)
  /** User is scanning — clear blur so lines are readable / clickable. */
  const [browsing, setBrowsing] = useState(false)
  const [hoveredLineIdx, setHoveredLineIdx] = useState<number | null>(null)
  const reducedMotion = usePrefersReducedMotion()

  const lines = useMemo(() => groupIntoLines(words), [words])
  const maxOrdinal = Math.max(0, words.length - 1)

  /** O(1) word-idx → ordinal / line lookups (avoid findIndex every active-word tick). */
  const wordOrdinalByIdx = useMemo(() => {
    const map = new Map<number, number>()
    for (let i = 0; i < words.length; i++) map.set(words[i]!.idx, i)
    return map
  }, [words])

  const lineIdxByWordIdx = useMemo(() => {
    const map = new Map<number, number>()
    for (let li = 0; li < lines.length; li++) {
      for (const w of lines[li]!.words) map.set(w.idx, li)
    }
    return map
  }, [lines])

  const liveOrdinal = useMemo(() => {
    if (words.length === 0) return 0
    if (activeWordIdx < 0) return 0
    const i = wordOrdinalByIdx.get(activeWordIdx)
    return i != null ? i : 0
  }, [words.length, activeWordIdx, wordOrdinalByIdx])

  const clearPending = () => {
    setPendingOrdinal(null)
    pendingFromActiveRef.current = null
    if (pendingClearRef.current) {
      clearTimeout(pendingClearRef.current)
      pendingClearRef.current = null
    }
  }

  const commitSeekOrdinal = (ordinal: number) => {
    const clamped = Math.max(0, Math.min(maxOrdinal, Math.round(ordinal)))
    const token = words[clamped]
    if (!token) return
    setPendingOrdinal(clamped)
    pendingFromActiveRef.current = activeWordIdx
    if (pendingClearRef.current) clearTimeout(pendingClearRef.current)
    // Safety: don't pin forever if seek fails / never advances playback.
    pendingClearRef.current = setTimeout(() => {
      pendingClearRef.current = null
      setPendingOrdinal(null)
      pendingFromActiveRef.current = null
    }, 12_000)
    onWordClick(token.idx)
  }

  // Keep the scrubber on the seek target until playback actually advances
  // (chunk load). seekToWord starts at chunk start, so any new active word
  // after commit means the seek landed — hand off to live.
  useEffect(() => {
    if (pendingOrdinal == null || scrubbingRef.current) return
    const targetIdx = words[pendingOrdinal]?.idx
    if (targetIdx != null && activeWordIdx === targetIdx) {
      clearPending()
      return
    }
    const from = pendingFromActiveRef.current
    if (from != null && activeWordIdx !== from && activeWordIdx >= 0) {
      clearPending()
    }
  }, [activeWordIdx, pendingOrdinal, words])

  useEffect(() => {
    return () => {
      if (pendingClearRef.current) clearTimeout(pendingClearRef.current)
    }
  }, [])

  const displayOrdinal = scrubOrdinal ?? pendingOrdinal ?? liveOrdinal
  const sliderValue = displayOrdinal
  const progressPct = maxOrdinal > 0 ? (sliderValue / maxOrdinal) * 100 : 0
  const isScrubbing = scrubOrdinal != null
  const previewWordIdx =
    scrubOrdinal != null || pendingOrdinal != null
      ? (words[displayOrdinal]?.idx ?? activeWordIdx)
      : activeWordIdx

  const scrubPreviewLabel = useMemo(() => {
    if (words.length === 0 || scrubOrdinal == null) return ''
    const center = scrubOrdinal
    const start = Math.max(0, center - PREVIEW_PHRASE_RADIUS)
    const end = Math.min(words.length - 1, center + PREVIEW_PHRASE_RADIUS)
    const parts: string[] = []
    for (let i = start; i <= end; i++) {
      const t = words[i]?.text
      if (t) parts.push(t)
    }
    return parts.join(' ')
  }, [words, scrubOrdinal])

  /** Sentence-start ordinals as % positions along the scrub track. */
  const sentenceTicks = useMemo(() => {
    if (words.length < 2 || maxOrdinal <= 0) return [] as number[]
    const starts: number[] = []
    let prevSentence = -1
    for (let i = 0; i < words.length; i++) {
      const s = words[i]!.sentenceIdx
      if (s !== prevSentence) {
        if (i > 0) starts.push(i)
        prevSentence = s
      }
    }
    if (starts.length === 0) return []
    if (starts.length <= MAX_SENTENCE_TICKS) {
      return starts.map((ord) => (ord / maxOrdinal) * 100)
    }
    const step = starts.length / MAX_SENTENCE_TICKS
    const thinned: number[] = []
    for (let i = 0; i < MAX_SENTENCE_TICKS; i++) {
      const ord = starts[Math.min(starts.length - 1, Math.floor(i * step))]!
      thinned.push((ord / maxOrdinal) * 100)
    }
    return thinned
  }, [words, maxOrdinal])

  const activeLineIdx = useMemo(() => {
    if (previewWordIdx < 0 || lines.length === 0) return 0
    const i = lineIdxByWordIdx.get(previewWordIdx)
    return i != null ? i : 0
  }, [lines.length, previewWordIdx, lineIdxByWordIdx])

  useLayoutEffect(() => {
    if (browsing) return

    const scroller = scrollerRef.current
    const el = lineRefs.current[activeLineIdx]
    if (!scroller || !el) return

    // Drop stale refs when the document shrinks.
    if (lineRefs.current.length > lines.length) {
      lineRefs.current.length = lines.length
    }

    const targetTop = () => {
      const eye = scroller.clientHeight * EYE_LINE
      return Math.max(0, el.offsetTop - eye + el.offsetHeight / 2)
    }

    const applyScroll = (top: number) => {
      programmaticScrollRef.current = true
      scroller.scrollTop = top
      // Clear after the browser has dispatched any scroll event from this write.
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false
      })
    }

    if (reducedMotion) {
      applyScroll(targetTop())
      return
    }

    if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current)

    const tick = () => {
      if (browsing) {
        scrollRafRef.current = null
        return
      }
      const desired = targetTop()
      const current = scroller.scrollTop
      const delta = desired - current
      if (Math.abs(delta) <= SCROLL_DEAD_ZONE) {
        applyScroll(desired)
        scrollRafRef.current = null
        return
      }
      applyScroll(current + delta * SCROLL_LERP)
      scrollRafRef.current = requestAnimationFrame(tick)
    }
    scrollRafRef.current = requestAnimationFrame(tick)

    return () => {
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
      }
    }
  }, [activeLineIdx, reducedMotion, lines.length, browsing])

  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current)
      if (browseIdleRef.current) clearTimeout(browseIdleRef.current)
    }
  }, [])

  const markBrowsing = () => {
    setBrowsing(true)
    if (browseIdleRef.current) clearTimeout(browseIdleRef.current)
    browseIdleRef.current = setTimeout(() => {
      browseIdleRef.current = null
      setBrowsing(false)
    }, BROWSE_IDLE_MS)
  }

  const onScrollerScroll = () => {
    if (programmaticScrollRef.current) return
    markBrowsing()
  }

  const bumpDockVisible = () => {
    setDockVisible(true)
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null
      // Stay up while interacting with the dock or scrubbing.
      if (dockHoverRef.current || scrubbingRef.current) return
      setDockVisible(false)
    }, DOCK_IDLE_MS)
  }

  useEffect(() => {
    bumpDockVisible()
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only idle arm
  }, [])

  // Keep chrome visible while paused so transport stays easy to find.
  useEffect(() => {
    if (!playing) {
      setDockVisible(true)
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    } else {
      bumpDockVisible()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- playing gate only
  }, [playing])

  return (
    <div
      className="teleprompter-overlay fixed inset-0 z-50 flex flex-col"
      role="dialog"
      aria-label="Teleprompter"
      aria-modal="true"
      onPointerMove={bumpDockVisible}
      onPointerDown={bumpDockVisible}
    >
      <div className="teleprompter-backdrop absolute inset-0" aria-hidden />

      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-24 bg-gradient-to-b from-[#070b14] via-[#070b14]/70 to-transparent"
        aria-hidden
      />

      <div
        ref={scrollerRef}
        className={`teleprompter-stage relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[28vh] pt-[14vh] sm:px-10 ${
          browsing ? 'is-browsing' : ''
        }`}
        onScroll={onScrollerScroll}
        onWheel={markBrowsing}
        onTouchMove={markBrowsing}
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-7 sm:gap-9">
          {lines.map((line, lineIdx) => {
            const dist = Math.min(3, Math.abs(lineIdx - activeLineIdx))
            const isActiveLine = lineIdx === activeLineIdx
            const ahead = lineIdx > activeLineIdx
            const isHovered = hoveredLineIdx === lineIdx
            return (
              <p
                key={lineIdx}
                ref={(node) => {
                  lineRefs.current[lineIdx] = node
                }}
                data-dist={dist}
                data-ahead={ahead ? '1' : '0'}
                onPointerEnter={() => setHoveredLineIdx(lineIdx)}
                onPointerLeave={() =>
                  setHoveredLineIdx((cur) => (cur === lineIdx ? null : cur))
                }
                className={`teleprompter-line text-left font-semibold leading-[1.4] tracking-tight ${
                  isActiveLine ? 'teleprompter-line-active' : ''
                } ${isHovered ? 'is-hovered' : ''} ${
                  reducedMotion ? 'teleprompter-line-static' : ''
                }`}
              >
                {line.words.map((w, wi) => {
                  const isActive = w.idx === previewWordIdx
                  const isSpoken = previewWordIdx >= 0 && w.idx < previewWordIdx
                  return (
                    <button
                      key={w.idx}
                      type="button"
                      onClick={() => onWordClick(w.idx)}
                      className={`teleprompter-word inline rounded-[0.2em] px-[0.06em] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 ${
                        isActive
                          ? 'is-active'
                          : isSpoken && isActiveLine
                            ? 'is-spoken'
                            : ''
                      }`}
                    >
                      {w.text}
                      {wi < line.words.length - 1 && !w.text.endsWith('-') ? ' ' : ''}
                    </button>
                  )
                })}
              </p>
            )
          })}
        </div>
      </div>

      <footer
        className={`teleprompter-dock-chrome absolute inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-8 ${
          dockVisible || !playing ? 'is-visible' : 'is-hidden'
        } ${reducedMotion ? 'is-static' : ''}`}
        onPointerEnter={() => {
          dockHoverRef.current = true
          setDockVisible(true)
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        }}
        onPointerLeave={() => {
          dockHoverRef.current = false
          if (playing) bumpDockVisible()
        }}
        onFocusCapture={() => {
          dockHoverRef.current = true
          setDockVisible(true)
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        }}
        onBlurCapture={(e) => {
          const next = e.relatedTarget
          if (next instanceof Node && e.currentTarget.contains(next)) return
          dockHoverRef.current = false
          if (playing) bumpDockVisible()
        }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 top-[-5.5rem] bg-gradient-to-t from-[#070b14]/95 via-[#070b14]/55 to-transparent"
          aria-hidden
        />
        <div className="teleprompter-dock relative mx-auto max-w-3xl px-4 py-3.5 sm:px-5">
          <div className="relative z-10 mb-3 flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={onPrevChunk}
                disabled={!canSkip}
                className="teleprompter-dock-btn"
                title="Previous chunk"
                aria-label="Previous chunk"
                tabIndex={dockVisible || !playing ? 0 : -1}
              >
                <SkipPrevIcon />
              </button>
              <button
                type="button"
                onClick={onTogglePlay}
                className={`teleprompter-dock-play ${playing ? 'is-playing' : ''}`}
                title={playing ? 'Pause' : 'Play'}
                aria-label={playing ? 'Pause' : 'Play'}
                tabIndex={dockVisible || !playing ? 0 : -1}
              >
                {playing ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button
                type="button"
                onClick={onNextChunk}
                disabled={!canSkip}
                className="teleprompter-dock-btn"
                title="Next chunk"
                aria-label="Next chunk"
                tabIndex={dockVisible || !playing ? 0 : -1}
              >
                <SkipNextIcon />
              </button>
            </div>

            <p className="min-w-0 flex-1 truncate text-center text-[11px] font-medium tracking-wide text-white/50 sm:text-xs">
              {playing ? 'Follow along' : 'Paused'}
              <span className="text-white/28"> · Esc to exit</span>
            </p>

            <button
              type="button"
              onClick={onDismiss}
              className="teleprompter-dock-exit"
              tabIndex={dockVisible || !playing ? 0 : -1}
            >
              Exit
            </button>
          </div>

          <div className="relative z-10 mb-1.5 flex items-baseline justify-between gap-3 text-[11px] font-medium tabular-nums tracking-wide">
            <div className="min-w-0 flex-1">
              {isScrubbing && scrubPreviewLabel ? (
                <p className="truncate text-amber-100/90" title={scrubPreviewLabel}>
                  <span className="text-white/40">Seek · </span>
                  {scrubPreviewLabel}
                </p>
              ) : (
                <p className="text-white/55">
                  Word {Math.min(words.length, sliderValue + 1)}
                  <span className="text-white/30"> / {words.length}</span>
                </p>
              )}
            </div>
            <span className="shrink-0 text-white/35">{Math.round(progressPct)}%</span>
          </div>

          <div className="teleprompter-scrubber-wrap relative z-10">
            {sentenceTicks.length > 0 && (
              <div className="teleprompter-scrubber-ticks pointer-events-none absolute inset-x-0" aria-hidden>
                {sentenceTicks.map((pct, i) => (
                  <span
                    key={i}
                    className="teleprompter-scrubber-tick"
                    style={{ left: `${pct}%` }}
                  />
                ))}
              </div>
            )}
            <label className="sr-only" htmlFor="teleprompter-scrubber">
              Scrub playback position
            </label>
            <input
              id="teleprompter-scrubber"
              type="range"
              min={0}
              max={maxOrdinal}
              step={1}
              value={sliderValue}
              disabled={words.length === 0}
              aria-valuemin={0}
              aria-valuemax={maxOrdinal}
              aria-valuenow={sliderValue}
              aria-valuetext={
                isScrubbing && scrubPreviewLabel
                  ? scrubPreviewLabel
                  : `Word ${sliderValue + 1} of ${words.length}`
              }
              onPointerDown={() => {
                scrubbingRef.current = true
                clearPending()
                setScrubOrdinal(displayOrdinal)
                setDockVisible(true)
                if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
              }}
              onPointerUp={(e) => {
                const next = Number((e.target as HTMLInputElement).value)
                scrubbingRef.current = false
                setScrubOrdinal(null)
                commitSeekOrdinal(next)
                if (playing) bumpDockVisible()
              }}
              onPointerCancel={() => {
                scrubbingRef.current = false
                setScrubOrdinal(null)
                // Cancel without seeking — drop any in-flight pin.
                clearPending()
                if (playing) bumpDockVisible()
              }}
              onChange={(e) => {
                const next = Number(e.target.value)
                if (scrubbingRef.current) {
                  setScrubOrdinal(next)
                  return
                }
                // Keyboard / a11y: commit immediately, keep pin until live catches up.
                commitSeekOrdinal(next)
              }}
              className="teleprompter-scrubber relative z-10 w-full"
              style={{ ['--scrub-pct' as string]: `${progressPct}%` }}
            />
          </div>
        </div>
      </footer>
    </div>
  )
}

function groupIntoLines(words: WordToken[]): Line[] {
  if (words.length === 0) return []
  const lines: Line[] = []
  let buf: WordToken[] = []
  let sentenceIdx = words[0]!.sentenceIdx

  const flush = () => {
    if (buf.length === 0) return
    lines.push({ sentenceIdx, words: buf })
    buf = []
  }

  for (const w of words) {
    if (buf.length > 0 && w.sentenceIdx !== sentenceIdx) {
      flush()
      sentenceIdx = w.sentenceIdx
    }
    sentenceIdx = w.sentenceIdx
    buf.push(w)
    // Soft wrap very long sentences so the stage stays readable.
    if (buf.length >= 18 && (w.text.endsWith(',') || w.text.endsWith(';') || w.text.endsWith(':'))) {
      flush()
      sentenceIdx = w.sentenceIdx
    }
  }
  flush()
  return lines
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  )
}

function SkipPrevIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
    </svg>
  )
}

function SkipNextIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M16 6h2v12h-2zM5.5 18l8.5-6-8.5-6z" />
    </svg>
  )
}
