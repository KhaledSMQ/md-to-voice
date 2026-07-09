import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { WordToken } from '../lib/tokenize'

type Props = {
  words: WordToken[]
  activeWordIdx: number
  playing: boolean
  onWordClick: (wIdx: number) => void
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

/**
 * Apple Lyrics–style teleprompter: large centered type, active line sharp,
 * neighbors blurred/faded, auto-scrolls so the playhead stays on the eye line.
 */
export function TeleprompterOverlay({
  words,
  activeWordIdx,
  playing,
  onWordClick,
  onDismiss,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([])
  const scrollRafRef = useRef<number | null>(null)
  const scrubbingRef = useRef(false)
  const [scrubOrdinal, setScrubOrdinal] = useState<number | null>(null)
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

  const sliderValue = scrubOrdinal ?? liveOrdinal
  const progressPct = maxOrdinal > 0 ? (sliderValue / maxOrdinal) * 100 : 0
  const previewWordIdx =
    scrubOrdinal != null ? (words[scrubOrdinal]?.idx ?? activeWordIdx) : activeWordIdx

  const activeLineIdx = useMemo(() => {
    if (previewWordIdx < 0 || lines.length === 0) return 0
    const i = lineIdxByWordIdx.get(previewWordIdx)
    return i != null ? i : 0
  }, [lines.length, previewWordIdx, lineIdxByWordIdx])

  const seekToOrdinal = (ordinal: number) => {
    const clamped = Math.max(0, Math.min(maxOrdinal, Math.round(ordinal)))
    const token = words[clamped]
    if (token) onWordClick(token.idx)
  }

  useLayoutEffect(() => {
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

    if (reducedMotion) {
      scroller.scrollTop = targetTop()
      return
    }

    if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current)

    const tick = () => {
      const desired = targetTop()
      const current = scroller.scrollTop
      const delta = desired - current
      if (Math.abs(delta) <= SCROLL_DEAD_ZONE) {
        scroller.scrollTop = desired
        scrollRafRef.current = null
        return
      }
      scroller.scrollTop = current + delta * SCROLL_LERP
      scrollRafRef.current = requestAnimationFrame(tick)
    }
    scrollRafRef.current = requestAnimationFrame(tick)

    return () => {
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
      }
    }
  }, [activeLineIdx, reducedMotion, lines.length])

  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current)
    }
  }, [])

  return (
    <div
      className="teleprompter-overlay fixed inset-0 z-50 flex flex-col"
      role="dialog"
      aria-label="Teleprompter"
      aria-modal="true"
    >
      <div className="teleprompter-backdrop absolute inset-0" aria-hidden />

      <header className="relative z-10 flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/45">
            Teleprompter
          </p>
          <p className="truncate text-sm text-white/70">
            {playing ? 'Follow along' : 'Paused'} · Esc to exit focus
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 text-sm font-medium text-white/90 backdrop-blur-md transition hover:bg-white/16 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
        >
          Exit focus
        </button>
      </header>

      <div
        ref={scrollerRef}
        className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[22vh] pt-[18vh] sm:px-10"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-8 sm:gap-10">
          {lines.map((line, lineIdx) => {
            const dist = Math.min(3, Math.abs(lineIdx - activeLineIdx))
            const isActiveLine = lineIdx === activeLineIdx
            const ahead = lineIdx > activeLineIdx
            return (
              <p
                key={lineIdx}
                ref={(node) => {
                  lineRefs.current[lineIdx] = node
                }}
                data-dist={dist}
                data-ahead={ahead ? '1' : '0'}
                className={`teleprompter-line text-center font-semibold leading-[1.35] tracking-tight ${
                  isActiveLine ? 'teleprompter-line-active' : ''
                } ${reducedMotion ? 'teleprompter-line-static' : ''}`}
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

      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-28 bg-gradient-to-b from-[#070b14] via-[#070b14]/75 to-transparent"
        aria-hidden
      />

      <footer className="relative z-30 shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-8">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[-4.5rem] bg-gradient-to-t from-[#070b14] via-[#070b14]/92 to-transparent" aria-hidden />
        <div className="relative mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-medium tabular-nums tracking-wide text-white/55">
            <span>
              Word {Math.min(words.length, sliderValue + 1)}
              <span className="text-white/30"> / {words.length}</span>
            </span>
            <span>{Math.round(progressPct)}%</span>
          </div>
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
            aria-valuetext={`Word ${sliderValue + 1} of ${words.length}`}
            onPointerDown={() => {
              scrubbingRef.current = true
              setScrubOrdinal(liveOrdinal)
            }}
            onPointerUp={(e) => {
              const next = Number((e.target as HTMLInputElement).value)
              scrubbingRef.current = false
              setScrubOrdinal(null)
              seekToOrdinal(next)
            }}
            onPointerCancel={() => {
              scrubbingRef.current = false
              setScrubOrdinal(null)
            }}
            onChange={(e) => {
              const next = Number(e.target.value)
              if (scrubbingRef.current) {
                setScrubOrdinal(next)
                return
              }
              // Keyboard / a11y: commit immediately.
              seekToOrdinal(next)
            }}
            className="teleprompter-scrubber w-full"
            style={{ ['--scrub-pct' as string]: `${progressPct}%` }}
          />
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
