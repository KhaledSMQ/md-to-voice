import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react'
import { parseDocument } from '../lib/parseDocument'

export type MarkdownReaderHandle = {
  setActive: (wIdx: number) => void
  scrollToActive: () => void
  /** Instant scroll to the current word, ignoring the user-scroll pause. */
  scrollToActiveNow: () => void
  /** Recompute whether the active word is inside the visible scrollport. */
  recheckActiveInView: () => void
  reset: () => void
}

export type PlayheadVisibility = {
  inView: boolean
  /** If the playhead is off-screen, whether it lies above or below the visible area. */
  out: 'above' | 'below' | null
}

type Props = {
  markdown: string
  onWordClick?: (wIdx: number) => void
  /** Merges with defaults; set full string for embedded layout in Reader shell. */
  className?: string
  /** When the playhead leaves the visible scrollport, `out` tells you if it is above or below. */
  onActiveVisibilityChange?: (v: PlayheadVisibility) => void
}

/**
 * Comfortable reading position for the active word, expressed as a fraction
 * from the top of the scrollable area. 0.4 ≈ slightly above center — the
 * standard "eye-line" used by teleprompters and karaoke apps so the user
 * neither has to look down (tiring) nor up (lose context above).
 */
const EYE_LINE_RATIO = 0.42

/**
 * Per-frame lerp factor toward the target scroll position. 0.18 ≈ ~95%
 * convergence in 16 frames (~270 ms at 60 fps) — fast enough to keep up
 * with normal speech, slow enough to feel like a smooth drift instead of a
 * jump.
 */
const SCROLL_LERP = 0.18

/**
 * Dead-zone around the eye line (px). If the active word is already within
 * this band we don't scroll — avoids constant micro-shifts on same-line
 * word transitions.
 */
const SCROLL_DEAD_ZONE_PX = 6

/**
 * How long auto-scroll stays paused after the user scrolls manually. Lets
 * the reader peek elsewhere without us yanking them back instantly.
 */
const USER_SCROLL_PAUSE_MS = 2500

/** Pixels: active word is "in view" only if its box overlaps the scrollport insets. */
const INVIEW_MARGIN = 6

const DEFAULT_ROOT =
  'markdown-body rounded-xl border border-white/5 bg-white/[0.03] px-6 py-5 max-h-[calc(100vh-260px)] overflow-y-auto'

function computeScrollTargetForActiveWord(container: HTMLDivElement, el: HTMLElement): number {
  const elRect = el.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const elCenterInContent =
    elRect.top - containerRect.top + container.scrollTop + el.offsetHeight / 2
  const eyeLine = container.clientHeight * EYE_LINE_RATIO
  const desired = elCenterInContent - eyeLine
  const maxScroll = container.scrollHeight - container.clientHeight
  return Math.max(0, Math.min(maxScroll, desired))
}

function isActiveWordInView(
  container: HTMLDivElement,
  el: HTMLElement,
  margin = INVIEW_MARGIN,
): boolean {
  const c = container.getBoundingClientRect()
  const e = el.getBoundingClientRect()
  if (e.bottom <= c.top + margin || e.top >= c.bottom - margin) return false
  if (e.right <= c.left + margin || e.left >= c.right - margin) return false
  return true
}

/**
 * "above" = need to scroll up (decrease scrollTop) to reach the playhead;
 * "below" = need to scroll down. Uses the same target as `scrollToActiveNow`
 * (eye-line) so the arrow always matches the direction the button will move.
 */
function directionTowardPlayhead(
  container: HTMLDivElement,
  el: HTMLElement,
  margin = INVIEW_MARGIN,
): 'above' | 'below' {
  const target = computeScrollTargetForActiveWord(container, el)
  const current = container.scrollTop
  const d = target - current
  if (d < -1) return 'above'
  if (d > 1) return 'below'
  // Fallback: vertical position in the viewport
  const c = container.getBoundingClientRect()
  const e = el.getBoundingClientRect()
  if (e.bottom < c.top + margin) return 'above'
  if (e.top > c.bottom - margin) return 'below'
  const em = (e.top + e.bottom) / 2
  const cm = (c.top + c.bottom) / 2
  return em < cm ? 'above' : 'below'
}

export const MarkdownReader = forwardRef<MarkdownReaderHandle, Props>(function MarkdownReader(
  { markdown, onWordClick, className: classNameProp, onActiveVisibilityChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wordEls = useRef<Map<number, HTMLElement>>(new Map())
  const activeRef = useRef<number>(-1)
  const scrollRafRef = useRef<number | null>(null)
  const userPauseUntilRef = useRef<number>(0)
  const reducedMotionRef = useRef<boolean>(false)
  const programmaticScrollRef = useRef<boolean>(false)
  const lastVisNotified = useRef<string>('')
  const onWordClickRef = useRef(onWordClick)
  onWordClickRef.current = onWordClick
  const onVisRef = useRef(onActiveVisibilityChange)
  onVisRef.current = onActiveVisibilityChange

  const parsed = useMemo(() => parseDocument(markdown), [markdown])

  const notifyActiveInView = useCallback(() => {
    const cb = onVisRef.current
    if (!cb) return
    const container = containerRef.current
    const idx = activeRef.current
    if (idx < 0 || !container) {
      const payload: PlayheadVisibility = { inView: true, out: null }
      const key = JSON.stringify(payload)
      if (lastVisNotified.current !== key) {
        lastVisNotified.current = key
        cb(payload)
      }
      return
    }
    const el = wordEls.current.get(idx)
    if (!el) {
      const payload: PlayheadVisibility = { inView: true, out: null }
      const key = JSON.stringify(payload)
      if (lastVisNotified.current !== key) {
        lastVisNotified.current = key
        cb(payload)
      }
      return
    }
    const inView = isActiveWordInView(container, el)
    const out: 'above' | 'below' | null = inView ? null : directionTowardPlayhead(container, el)
    const payload: PlayheadVisibility = { inView, out }
    const key = JSON.stringify(payload)
    if (lastVisNotified.current !== key) {
      lastVisNotified.current = key
      cb(payload)
    }
  }, [])

  useLayoutEffect(() => {
    activeRef.current = -1
    const map = new Map<number, HTMLElement>()
    const root = containerRef.current
    if (!root) return
    const nodes = root.querySelectorAll<HTMLElement>('span.word[data-w-idx]')
    nodes.forEach((el) => {
      const idx = Number(el.dataset.wIdx)
      if (Number.isFinite(idx)) map.set(idx, el)
    })
    wordEls.current = map
    requestAnimationFrame(() => notifyActiveInView())
    return () => {
      wordEls.current.clear()
    }
  }, [parsed, notifyActiveInView])

  useEffect(() => {
    reducedMotionRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const c = containerRef.current
    if (!c) return
    const markUserScroll = () => {
      if (programmaticScrollRef.current) return
      userPauseUntilRef.current = performance.now() + USER_SCROLL_PAUSE_MS
    }
    const onScrollOrResize = () => notifyActiveInView()
    c.addEventListener('scroll', onScrollOrResize, { passive: true })
    window.addEventListener('resize', onScrollOrResize)
    c.addEventListener('wheel', markUserScroll, { passive: true })
    c.addEventListener('touchmove', markUserScroll, { passive: true })
    c.addEventListener('keydown', markUserScroll)
    return () => {
      c.removeEventListener('scroll', onScrollOrResize)
      window.removeEventListener('resize', onScrollOrResize)
      c.removeEventListener('wheel', markUserScroll)
      c.removeEventListener('touchmove', markUserScroll)
      c.removeEventListener('keydown', markUserScroll)
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current)
      scrollRafRef.current = null
    }
  }, [notifyActiveInView])

  useEffect(() => {
    const c = containerRef.current
    if (!c) return
    const onClick = (e: MouseEvent) => {
      const cb = onWordClickRef.current
      if (!cb) return
      // Don't hijack the click if the user just finished a text selection —
      // browsers fire `click` after a drag-select if the mouse didn't move
      // much, and we don't want a stray click to wipe the selection.
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed && sel.toString().length > 0) return
      let el = e.target as HTMLElement | null
      while (el && el !== c) {
        if (el.classList.contains('word') && el.dataset.wIdx) {
          const idx = Number(el.dataset.wIdx)
          if (Number.isFinite(idx)) cb(idx)
          return
        }
        el = el.parentElement
      }
    }
    c.addEventListener('click', onClick)
    return () => c.removeEventListener('click', onClick)
  }, [])

  const animateScroll = useCallback(() => {
    scrollRafRef.current = null
    const container = containerRef.current
    if (!container) return
    const idx = activeRef.current
    if (idx < 0) return
    if (performance.now() < userPauseUntilRef.current) return
    const el = wordEls.current.get(idx)
    if (!el) return

    const target = computeScrollTargetForActiveWord(container, el)

    const current = container.scrollTop
    const diff = target - current
    const absDiff = Math.abs(diff)

    if (absDiff < SCROLL_DEAD_ZONE_PX) return

    programmaticScrollRef.current = true
    if (reducedMotionRef.current || absDiff < 1) {
      container.scrollTop = target
    } else {
      container.scrollTop = current + diff * SCROLL_LERP
      scrollRafRef.current = requestAnimationFrame(animateScroll)
    }
    // Release the programmatic flag on the next microtask so our own
    // scroll event doesn't get mistaken for a user scroll.
    queueMicrotask(() => {
      programmaticScrollRef.current = false
    })
  }, [])

  const scrollToActiveNow = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const idx = activeRef.current
    if (idx < 0) return
    const el = wordEls.current.get(idx)
    if (!el) return
    if (scrollRafRef.current != null) {
      cancelAnimationFrame(scrollRafRef.current)
      scrollRafRef.current = null
    }
    const target = computeScrollTargetForActiveWord(container, el)
    programmaticScrollRef.current = true
    const smooth =
      typeof window !== 'undefined' &&
      !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (smooth && typeof container.scrollTo === 'function') {
      container.scrollTo({ top: target, behavior: 'smooth' })
    } else {
      container.scrollTop = target
    }
    userPauseUntilRef.current = 0
    queueMicrotask(() => {
      programmaticScrollRef.current = false
      requestAnimationFrame(() => notifyActiveInView())
    })
  }, [notifyActiveInView])

  useImperativeHandle(
    ref,
    () => ({
      setActive(wIdx: number) {
        const prev = activeRef.current
        if (prev === wIdx) {
          requestAnimationFrame(() => notifyActiveInView())
          return
        }
        const map = wordEls.current
        if (prev >= 0) {
          const prevEl = map.get(prev)
          prevEl?.classList.remove('is-active')
          if (prevEl) prevEl.classList.add('is-spoken')
        }
        if (wIdx >= 0) {
          const nextEl = map.get(wIdx)
          nextEl?.classList.add('is-active')
          nextEl?.classList.remove('is-spoken')
        }
        activeRef.current = wIdx
        requestAnimationFrame(() => notifyActiveInView())
      },
      scrollToActive() {
        if (activeRef.current < 0) return
        if (scrollRafRef.current != null) return
        scrollRafRef.current = requestAnimationFrame(animateScroll)
      },
      scrollToActiveNow,
      recheckActiveInView: () => {
        requestAnimationFrame(() => notifyActiveInView())
      },
      reset() {
        const prev = activeRef.current
        if (prev >= 0) {
          wordEls.current.get(prev)?.classList.remove('is-active')
        }
        wordEls.current.forEach((el) => el.classList.remove('is-spoken', 'is-active'))
        activeRef.current = -1
        if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
        lastVisNotified.current = ''
        requestAnimationFrame(() => notifyActiveInView())
      },
    }),
    [animateScroll, notifyActiveInView, scrollToActiveNow],
  )

  return (
    <div ref={containerRef} className={classNameProp ?? DEFAULT_ROOT}>
      {parsed.reactNode}
    </div>
  )
})
