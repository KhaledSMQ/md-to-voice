import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MiniTransport } from './MiniTransport'
import type { ActiveWordStore, PlayerStatus } from '../lib/usePlayer'

type Props = {
  status: PlayerStatus
  totalChunks: number
  totalWords: number
  activeWordStore: ActiveWordStore
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onPrevChunk: () => void
  onNextChunk: () => void
  onExpand: () => void
}

/** Reveal when the pointer is within this many px of the bottom edge. */
const EDGE_REVEAL_PX = 72
/** Delay before sliding away after the pointer leaves the edge / dock. */
const HIDE_DELAY_MS = 480

/**
 * Focus-mode glass transport: auto-hides while playing (macOS-dock style) and
 * slides up when the pointer nears the bottom edge or the bar itself.
 */
export function FocusMiniPlayer({
  status,
  totalChunks,
  totalWords,
  activeWordStore,
  onPlay,
  onPause,
  onStop,
  onPrevChunk,
  onNextChunk,
  onExpand,
}: Props) {
  const playing = status === 'playing'
  const [visible, setVisible] = useState(true)
  const playingRef = useRef(playing)
  const dockHoverRef = useRef(false)
  const nearEdgeRef = useRef(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reducedMotion = usePrefersReducedMotion()

  playingRef.current = playing

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  const reveal = () => {
    clearHideTimer()
    setVisible(true)
  }

  const scheduleHide = () => {
    if (!playingRef.current || dockHoverRef.current || nearEdgeRef.current) return
    if (hideTimerRef.current) return
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null
      if (dockHoverRef.current || nearEdgeRef.current || !playingRef.current) return
      setVisible(false)
    }, HIDE_DELAY_MS)
  }

  // Stay up while paused / idle so transport stays findable; hide only while playing.
  useEffect(() => {
    if (!playing) {
      reveal()
      return
    }
    scheduleHide()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- playing gate only
  }, [playing])

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const near = window.innerHeight - e.clientY <= EDGE_REVEAL_PX
      if (near === nearEdgeRef.current) return
      nearEdgeRef.current = near
      if (near) reveal()
      else scheduleHide()
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      clearHideTimer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only edge tracking
  }, [])

  const shown = visible || !playing

  return createPortal(
    <>
      {/* Touch / edge summon strip — only interactive while the bar is tucked away. */}
      <div
        className={`focus-mini-edge${shown ? '' : ' is-active'}`}
        aria-hidden
        onPointerEnter={() => {
          nearEdgeRef.current = true
          reveal()
        }}
        onPointerLeave={() => {
          nearEdgeRef.current = false
          scheduleHide()
        }}
      />
      <div
        className={`focus-mini-player ${shown ? 'is-visible' : 'is-hidden'}${
          reducedMotion ? ' is-static' : ''
        }`}
        role="region"
        aria-label="Focus mini player"
        aria-hidden={shown ? undefined : true}
        onPointerEnter={() => {
          dockHoverRef.current = true
          reveal()
        }}
        onPointerLeave={() => {
          dockHoverRef.current = false
          scheduleHide()
        }}
        onFocusCapture={() => {
          dockHoverRef.current = true
          reveal()
        }}
        onBlurCapture={(e) => {
          const next = e.relatedTarget
          if (next instanceof Node && e.currentTarget.contains(next)) return
          dockHoverRef.current = false
          scheduleHide()
        }}
      >
        <MiniTransport
          status={status}
          totalChunks={totalChunks}
          totalWords={totalWords}
          activeWordStore={activeWordStore}
          onPlay={onPlay}
          onPause={onPause}
          onStop={onStop}
          onPrevChunk={onPrevChunk}
          onNextChunk={onNextChunk}
          onExpand={onExpand}
        />
      </div>
    </>,
    document.body,
  )
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
