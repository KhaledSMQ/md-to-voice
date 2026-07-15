import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

/** Peek chrome height used for preview bottom padding (handle 20 + meter/gap 13 + row 44 + bottom 10). */
export const MOBILE_PEEK_HEIGHT_PX = 87

type Props = {
  /** When true, sheet is expanded. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Focus mode — hide peek and sheet entirely. */
  hidden?: boolean
  peek: ReactNode
  children: ReactNode
}

/**
 * Spotify-style bottom sheet: peek mini-player snaps to an expandable studio panel.
 * Desktop layouts should not mount this — it is fixed to the viewport.
 */
export function MobileStudioSheet({
  open,
  onOpenChange,
  hidden = false,
  peek,
  children,
}: Props) {
  const titleId = useId()
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startY: number
    startOffset: number
  } | null>(null)
  const [dragOffset, setDragOffset] = useState<number | null>(null)
  const reduceMotion = usePrefersReducedMotion()

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  const peekPx = MOBILE_PEEK_HEIGHT_PX

  const maxTravel = useCallback(() => {
    const el = sheetRef.current
    if (!el) return 0
    return Math.max(0, el.offsetHeight - peekPx)
  }, [peekPx])

  // Esc closes the open sheet before other Reader shortcuts (capture).
  useEffect(() => {
    if (!open || hidden) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, hidden, close])

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!open || hidden) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, hidden])

  const onHandlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const max = maxTravel()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startOffset: open ? 0 : max,
    }
    setDragOffset(dragRef.current.startOffset)
  }

  const onHandlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const max = maxTravel()
    const next = clamp(drag.startOffset + (e.clientY - drag.startY), 0, max)
    setDragOffset(next)
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    const max = maxTravel() || 1
    const offset = dragOffset ?? drag.startOffset
    setDragOffset(null)
    onOpenChange(offset < max * 0.55)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }

  if (hidden) return null

  const dragging = dragOffset != null

  return createPortal(
    <div
      className={`mobile-studio ${open ? 'is-open' : 'is-peek'}`}
      data-dragging={dragging || undefined}
      style={{ ['--mobile-peek-h' as string]: `${peekPx}px` }}
    >
      <div
        className="mobile-studio-backdrop"
        aria-hidden={!open}
        onClick={close}
      />

      <div
        ref={sheetRef}
        className={`mobile-studio-sheet ${open ? 'is-open' : 'is-peek'}`}
        role={open ? 'dialog' : undefined}
        aria-modal={open || undefined}
        aria-labelledby={open ? titleId : undefined}
        style={
          dragging
            ? {
                transform: `translate3d(0, ${dragOffset}px, 0)`,
                transition: 'none',
              }
            : reduceMotion
              ? { transition: 'none' }
              : undefined
        }
      >
        <div className="mobile-studio-peek-zone">
          <div
            className="mobile-studio-handle-hit"
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className="mobile-studio-handle" aria-hidden />
            <span id={titleId} className="sr-only">
              Studio controls
            </span>
          </div>

          {open ? (
            <button
              type="button"
              className="mobile-studio-collapse"
              onClick={close}
              aria-label="Collapse studio"
              title="Collapse"
            >
              <ChevronDownIcon />
              <span>Console</span>
            </button>
          ) : (
            <div className="mobile-studio-peek">{peek}</div>
          )}
        </div>

        <div
          className="mobile-studio-body"
          inert={!open || undefined}
          aria-hidden={!open || undefined}
        >
          <div className="mobile-studio-body-inner studio-deck">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" className="h-4 w-4">
      <path d="M6 10l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
