import { memo } from 'react'
import {
  useActiveWordIdx,
  type ActiveWordStore,
  type PlayerStatus,
} from '../lib/usePlayer'

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

export const MiniTransport = memo(function MiniTransport({
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
  const activeWordIdx = useActiveWordIdx(activeWordStore)
  const isLoading = status === 'loading-model'
  const isPlaying = status === 'playing'
  const canStop = status === 'playing' || status === 'paused'
  const canSkip = totalChunks > 0 && !isLoading

  const heardOrdinal =
    activeWordIdx >= 0 && totalWords > 0
      ? Math.min(totalWords, activeWordIdx + 1)
      : status === 'finished'
        ? totalWords
        : 0
  const wordPct =
    totalWords > 0 ? Math.min(100, Math.max(0, (heardOrdinal / totalWords) * 100)) : 0
  const showProgress =
    (status === 'playing' || status === 'paused' || status === 'finished') && totalWords > 0

  return (
    <div className="mini-transport">
      <div className="mini-transport-meter" aria-hidden={!showProgress}>
        <div
          className="mini-transport-meter-fill"
          style={{ width: `${status === 'finished' ? 100 : showProgress ? wordPct : 0}%` }}
        />
      </div>

      <div className="mini-transport-row">
        <button
          type="button"
          onClick={onPrevChunk}
          disabled={!canSkip}
          className="mini-transport-btn"
          title="Previous chunk (["
          aria-label="Previous chunk"
        >
          <SkipPrevIcon />
        </button>

        <button
          type="button"
          onClick={isPlaying ? onPause : onPlay}
          disabled={isLoading}
          className={`mini-transport-play ${isPlaying ? 'is-playing' : ''}`}
          title={isPlaying ? 'Pause (space)' : 'Play (space)'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isLoading ? (
            <SpinnerIcon />
          ) : isPlaying ? (
            <PauseIcon />
          ) : (
            <PlayIcon />
          )}
        </button>

        <button
          type="button"
          onClick={onNextChunk}
          disabled={!canSkip}
          className="mini-transport-btn"
          title="Next chunk (])"
          aria-label="Next chunk"
        >
          <SkipNextIcon />
        </button>

        <button
          type="button"
          onClick={onStop}
          disabled={!canStop}
          className="mini-transport-btn"
          title="Stop (Esc)"
          aria-label="Stop"
        >
          <StopIcon />
        </button>

        <button
          type="button"
          onClick={onExpand}
          className="mini-transport-btn mini-transport-expand"
          title="Open studio"
          aria-label="Open studio controls"
        >
          <ChevronUpIcon />
        </button>
      </div>
    </div>
  )
})

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 translate-x-px">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M6 6h12v12H6z" />
    </svg>
  )
}

function SkipPrevIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
    </svg>
  )
}

function SkipNextIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M16 6h2v12h-2zM5.5 18l8.5-6-8.5-6z" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5 animate-spin"
    >
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  )
}

function ChevronUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" className="h-5 w-5">
      <path d="M6 14l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
