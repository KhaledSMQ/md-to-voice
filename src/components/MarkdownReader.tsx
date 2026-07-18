import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react'

export type MarkdownReaderHandle = {
  setActive: (wIdx: number) => void
  scrollToActive: () => void
  /** Instant scroll to the current word, ignoring the user-scroll pause. */
  scrollToActiveNow: () => void
  /** Recompute whether the active word is inside the visible scrollport. */
  recheckActiveInView: () => void
  reset: () => void
  /** Scroll container (the preview viewport) for find-in-preview, etc. */
  getContainer: () => HTMLDivElement | null
  /**
   * When locked, karaoke auto-scroll stays off so the user can browse
   * search hits (or anything else) without being yanked back to the playhead.
   */
  setAutoScrollLocked: (locked: boolean) => void
}

export type PlayheadVisibility = {
  inView: boolean
  /** If the playhead is off-screen, whether it lies above or below the visible area. */
  out: 'above' | 'below' | null
}

export type PreviewContextInfo = {
  wIdx: number | null
  clientX: number
  clientY: number
  selectedText: string
}

type Props = {
  /** Pre-parsed karaoke React tree from `parseDocument` / `useParsedDocument`. */
  reactNode: ReactNode
  /** Bumps word-element remapping when the underlying parse changes. */
  parseKey: string | number
  /** Global word indices that should show the bookmark marker. */
  bookmarkWordIdxs?: ReadonlySet<number>
  onWordClick?: (wIdx: number) => void
  /**
   * Right-click / long-press on the preview. Caller should open a context menu;
   * native menu is suppressed when this handler is provided.
   */
  onContextMenuWord?: (info: PreviewContextInfo) => void
  /** Merges with defaults; set full string for embedded layout in Reader shell. */
  className?: string
  style?: CSSProperties
  /** When the playhead leaves the visible scrollport, `out` tells you if it is above or below. */
  onActiveVisibilityChange?: (v: PlayheadVisibility) => void
}

function wordIdxFromTarget(target: EventTarget | null, root: HTMLElement): number | null {
  let el = target as HTMLElement | null
  while (el && el !== root) {
    if (el.classList.contains('word') && el.dataset.wIdx) {
      const idx = Number(el.dataset.wIdx)
      if (Number.isFinite(idx)) return idx
      return null
    }
    el = el.parentElement
  }
  return null
}

function selectedTextInContainer(container: HTMLElement): string {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return ''
  const range = sel.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) return ''
  return sel.toString()
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
  const c = container.getBoundingClientRect()
  const e = el.getBoundingClientRect()
  if (e.bottom < c.top + margin) return 'above'
  if (e.top > c.bottom - margin) return 'below'
  const em = (e.top + e.bottom) / 2
  const cm = (c.top + c.bottom) / 2
  return em < cm ? 'above' : 'below'
}

export const MarkdownReader = forwardRef<MarkdownReaderHandle, Props>(function MarkdownReader(
  {
    reactNode,
    parseKey,
    bookmarkWordIdxs,
    onWordClick,
    onContextMenuWord,
    className: classNameProp,
    style,
    onActiveVisibilityChange,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wordEls = useRef<Map<number, HTMLElement>>(new Map())
  const activeRef = useRef<number>(-1)
  const scrollRafRef = useRef<number | null>(null)
  const userPauseUntilRef = useRef<number>(0)
  const reducedMotionRef = useRef<boolean>(false)
  const programmaticScrollRef = useRef<boolean>(false)
  const autoScrollLockedRef = useRef<boolean>(false)
  const lastVisNotified = useRef<string>('')
  const onWordClickRef = useRef(onWordClick)
  const onContextMenuWordRef = useRef(onContextMenuWord)
  const onVisRef = useRef(onActiveVisibilityChange)
  const pendingNotifyRaf = useRef<number | null>(null)
  const notifyActiveInViewRef = useRef<() => void>(() => {})
  useEffect(() => {
    onWordClickRef.current = onWordClick
  }, [onWordClick])
  useEffect(() => {
    onContextMenuWordRef.current = onContextMenuWord
  }, [onContextMenuWord])
  useEffect(() => {
    onVisRef.current = onActiveVisibilityChange
  }, [onActiveVisibilityChange])

  const notifyActiveInView = useCallback(() => {
    const cb = onVisRef.current
    if (!cb) return
    const container = containerRef.current
    const idx = activeRef.current
    if (idx < 0 || !container) {
      const key = 'in'
      if (lastVisNotified.current !== key) {
        lastVisNotified.current = key
        cb({ inView: true, out: null })
      }
      return
    }
    const el = wordEls.current.get(idx)
    if (!el) {
      const key = 'in'
      if (lastVisNotified.current !== key) {
        lastVisNotified.current = key
        cb({ inView: true, out: null })
      }
      return
    }
    const inView = isActiveWordInView(container, el)
    const out: 'above' | 'below' | null = inView ? null : directionTowardPlayhead(container, el)
    const key = inView ? 'in' : out === 'above' ? 'above' : 'below'
    if (lastVisNotified.current !== key) {
      lastVisNotified.current = key
      cb({ inView, out })
    }
  }, [])

  useEffect(() => {
    notifyActiveInViewRef.current = notifyActiveInView
  }, [notifyActiveInView])

  const scheduleNotifyActiveInView = useCallback(() => {
    if (pendingNotifyRaf.current != null) return
    pendingNotifyRaf.current = requestAnimationFrame(() => {
      pendingNotifyRaf.current = null
      notifyActiveInViewRef.current()
    })
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
    scheduleNotifyActiveInView()
    return () => {
      wordEls.current.clear()
    }
  }, [parseKey, reactNode, scheduleNotifyActiveInView])

  useLayoutEffect(() => {
    const set = bookmarkWordIdxs
    wordEls.current.forEach((el, idx) => {
      if (set?.has(idx)) el.classList.add('is-bookmark')
      else el.classList.remove('is-bookmark')
    })
  }, [parseKey, reactNode, bookmarkWordIdxs])

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
    const onScrollOrResize = () => scheduleNotifyActiveInView()
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
      if (pendingNotifyRaf.current != null) {
        cancelAnimationFrame(pendingNotifyRaf.current)
        pendingNotifyRaf.current = null
      }
    }
  }, [scheduleNotifyActiveInView])

  useEffect(() => {
    const c = containerRef.current
    if (!c) return
    const onClick = (e: MouseEvent) => {
      const cb = onWordClickRef.current
      if (!cb) return
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed && sel.toString().length > 0) return
      const idx = wordIdxFromTarget(e.target, c)
      if (idx != null) cb(idx)
    }
    const onContextMenu = (e: MouseEvent) => {
      const cb = onContextMenuWordRef.current
      if (!cb) return
      e.preventDefault()
      cb({
        wIdx: wordIdxFromTarget(e.target, c),
        clientX: e.clientX,
        clientY: e.clientY,
        selectedText: selectedTextInContainer(c),
      })
    }
    c.addEventListener('click', onClick)
    c.addEventListener('contextmenu', onContextMenu)
    return () => {
      c.removeEventListener('click', onClick)
      c.removeEventListener('contextmenu', onContextMenu)
    }
  }, [])

  const animateScroll = useCallback(() => {
    scrollRafRef.current = null
    const container = containerRef.current
    if (!container) return
    const idx = activeRef.current
    if (idx < 0) return
    if (autoScrollLockedRef.current) return
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
      scheduleNotifyActiveInView()
    })
  }, [scheduleNotifyActiveInView])

  useImperativeHandle(
    ref,
    () => ({
      setActive(wIdx: number) {
        const prev = activeRef.current
        if (prev === wIdx) {
          scheduleNotifyActiveInView()
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
        scheduleNotifyActiveInView()
      },
      scrollToActive() {
        if (activeRef.current < 0) return
        if (autoScrollLockedRef.current) return
        if (scrollRafRef.current != null) return
        scrollRafRef.current = requestAnimationFrame(animateScroll)
      },
      scrollToActiveNow,
      recheckActiveInView: () => {
        scheduleNotifyActiveInView()
      },
      reset() {
        const prev = activeRef.current
        if (prev >= 0) {
          wordEls.current.get(prev)?.classList.remove('is-active')
        }
        wordEls.current.forEach((el) => {
          el.classList.remove('is-spoken', 'is-active')
        })
        activeRef.current = -1
        if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
        lastVisNotified.current = ''
        scheduleNotifyActiveInView()
      },
      getContainer: () => containerRef.current,
      setAutoScrollLocked(locked: boolean) {
        autoScrollLockedRef.current = locked
        if (locked && scrollRafRef.current != null) {
          cancelAnimationFrame(scrollRafRef.current)
          scrollRafRef.current = null
        }
      },
    }),
    [animateScroll, scheduleNotifyActiveInView, scrollToActiveNow],
  )

  return (
    <div ref={containerRef} className={classNameProp ?? DEFAULT_ROOT} style={style}>
      {reactNode}
    </div>
  )
})
