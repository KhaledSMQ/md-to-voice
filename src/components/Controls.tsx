import { memo, useEffect, useRef, type RefObject } from 'react'
import type { Device, VoiceInfo } from '../lib/tts/types'
import {
  useActiveWordIdx,
  type ActiveWordStore,
  type LoadProgress,
  type PlayerStatus,
} from '../lib/usePlayer'
import { AudioVisualizer } from './AudioVisualizer'
import { VoiceCarousel } from './VoiceCarousel'
import { MixControls } from './StudioMeters'

type Props = {
  status: PlayerStatus
  device: Device | null
  voices: VoiceInfo[]
  voice: string
  speed: number
  volume: number
  progress: LoadProgress
  error: string | null
  totalChunks: number
  currentChunkIdx: number
  totalWords: number
  activeWordStore: ActiveWordStore
  analyserRef: RefObject<AnalyserNode | null>
  onVoice: (voice: string) => void
  onSpeed: (speed: number) => void
  onVolume: (volume: number) => void
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onPrevChunk: () => void
  onNextChunk: () => void
  teleprompterMode: boolean
  onTeleprompterMode: (enabled: boolean) => void
  autoplayOnPaste: boolean
  onAutoplayOnPaste: (enabled: boolean) => void
  autoHideOnPlay: boolean
  onAutoHideOnPlay: (enabled: boolean) => void
  autoFocusOnPlay: boolean
  onAutoFocusOnPlay: (enabled: boolean) => void
  focusMiniPlayer: boolean
  onFocusMiniPlayer: (enabled: boolean) => void
  buffering?: boolean
  chunkReadyTick?: number
}

export const Controls = memo(function Controls({
  status,
  device,
  voices,
  voice,
  speed,
  volume,
  progress,
  error,
  totalChunks,
  currentChunkIdx,
  totalWords,
  activeWordStore,
  analyserRef,
  onVoice,
  onSpeed,
  onVolume,
  onPlay,
  onPause,
  onStop,
  onPrevChunk,
  onNextChunk,
  teleprompterMode,
  onTeleprompterMode,
  autoplayOnPaste,
  onAutoplayOnPaste,
  autoHideOnPlay,
  onAutoHideOnPlay,
  autoFocusOnPlay,
  onAutoFocusOnPlay,
  focusMiniPlayer,
  onFocusMiniPlayer,
  buffering = false,
  chunkReadyTick = 0,
}: Props) {
  const activeWordIdx = useActiveWordIdx(activeWordStore)
  const isLoading = status === 'loading-model'
  const isPlaying = status === 'playing'
  const canPause = status === 'playing'
  const canStop = status === 'playing' || status === 'paused'
  const isError = status === 'error'
  const canSkip = totalChunks > 0 && !isLoading
  const showProgress =
    (status === 'playing' || status === 'paused' || status === 'finished') && totalWords > 0

  const ratio = progress.ratio ?? 0
  const ratioPct = Math.min(100, Math.max(0, ratio * 100))
  const isMuted = volume === 0
  const lastVolumeRef = useRef(volume > 0 ? volume : 0.85)

  useEffect(() => {
    if (volume > 0) lastVolumeRef.current = volume
  }, [volume])

  const heardOrdinal =
    activeWordIdx >= 0 && totalWords > 0
      ? Math.min(totalWords, activeWordIdx + 1)
      : status === 'finished'
        ? totalWords
        : 0
  const wordPct =
    totalWords > 0 ? Math.min(100, Math.max(0, (heardOrdinal / totalWords) * 100)) : 0

  const chunkNumber = Math.max(0, currentChunkIdx + 1)

  const playLabel = isLoading
    ? 'Loading…'
    : isPlaying
      ? 'Pause'
      : status === 'paused'
        ? 'Resume'
        : status === 'finished'
          ? 'Again'
          : 'Play'

  const toggleMute = () => {
    if (isMuted) onVolume(lastVolumeRef.current)
    else onVolume(0)
  }

  return (
    <div className="studio-controls space-y-4">
      {/* Stage */}
      <section className="studio-stage-block space-y-2" aria-label="Playback stage">
        <AudioVisualizer
          analyserRef={analyserRef}
          playerStatus={status}
          buffering={buffering}
          variant="stage"
        />
        <div className="flex items-center justify-between gap-2 px-0.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-500">
            Console
          </span>
          {device ? (
            <span className="font-mono text-[10px] tabular-nums text-ink-400">{device}</span>
          ) : null}
        </div>
      </section>

      {/* Transport */}
      <section className="studio-transport" aria-label="Transport">
        <button
          type="button"
          onClick={onPrevChunk}
          disabled={!canSkip}
          className="studio-transport-side"
          title="Previous chunk (["
          aria-label="Previous chunk"
        >
          <SkipPrevIcon />
        </button>
        <button
          type="button"
          onClick={isPlaying ? onPause : onPlay}
          disabled={isLoading}
          className={`studio-transport-play ${isPlaying ? 'is-playing' : ''}`}
          title={isPlaying ? 'Pause (space)' : 'Play (space)'}
        >
          {isLoading ? (
            <SpinnerIcon />
          ) : isPlaying ? (
            <PauseIcon className="h-5 w-5" />
          ) : (
            <PlayIcon className="h-5 w-5" />
          )}
          <span>{playLabel}</span>
        </button>
        <button
          type="button"
          onClick={onNextChunk}
          disabled={!canSkip}
          className="studio-transport-side"
          title="Next chunk (])"
          aria-label="Next chunk"
        >
          <SkipNextIcon />
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={!canStop && !canPause}
          className="studio-transport-stop"
          title="Stop (Esc)"
          aria-label="Stop"
        >
          <StopIcon />
        </button>
      </section>

      {isLoading && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-ink-400">
            <span>Downloading Kokoro</span>
            <span className="font-mono tabular-nums">{ratioPct.toFixed(0)}%</span>
          </div>
          <div className="studio-meter-track">
            <div
              className="studio-meter-fill"
              style={{ width: `${ratioPct}%` }}
            />
          </div>
          <p className="truncate text-[10px] font-mono text-ink-500" title={progress.file}>
            {progress.file ?? progress.status ?? 'preparing…'}
          </p>
        </div>
      )}

      {/* Meters */}
      <section className="space-y-3" aria-label="Meters">
        {showProgress && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-ink-400">
              <span>Progress</span>
              <span className="font-mono tabular-nums text-ink-300">
                {heardOrdinal} / {totalWords}
                {totalChunks > 1 && (
                  <span className="text-ink-500">
                    {' '}
                    · {status === 'finished' ? totalChunks : chunkNumber}/{totalChunks}
                  </span>
                )}
              </span>
            </div>
            <div className="studio-meter-track">
              <div
                className="studio-meter-fill"
                style={{ width: `${status === 'finished' ? 100 : wordPct}%` }}
              />
            </div>
          </div>
        )}

        <MixControls
          volume={volume}
          onVolume={onVolume}
          speed={speed}
          onSpeed={onSpeed}
          muted={isMuted}
          onToggleMute={toggleMute}
        />
      </section>

      {/* Instruments — tucked away while listening on small screens */}
      <section className="studio-instruments" aria-label="Instruments">
        <VoiceCarousel
          voices={voices}
          voice={voice}
          onVoice={onVoice}
          buffering={buffering}
          chunkReadyTick={chunkReadyTick}
        />

        <button
          type="button"
          role="switch"
          aria-checked={teleprompterMode}
          onClick={() => onTeleprompterMode(!teleprompterMode)}
          className={`studio-tele-row ${teleprompterMode ? 'is-on' : ''}`}
          title="Teleprompter (T while playing)"
        >
          <span className={`studio-tele-switch ${teleprompterMode ? 'is-on' : ''}`} aria-hidden>
            <span className="studio-tele-knob" />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-xs font-medium text-ink-100">Teleprompter</span>
            <span className="block text-[10px] text-ink-500">Press T while playing</span>
          </span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={autoplayOnPaste}
          onClick={() => onAutoplayOnPaste(!autoplayOnPaste)}
          className={`studio-tele-row ${autoplayOnPaste ? 'is-on' : ''}`}
          title="Autoplay when pasting markdown"
        >
          <span className={`studio-tele-switch ${autoplayOnPaste ? 'is-on' : ''}`} aria-hidden>
            <span className="studio-tele-knob" />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-xs font-medium text-ink-100">Autoplay on paste</span>
            <span className="block text-[10px] text-ink-500">Play after ⌘V / Paste</span>
          </span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={autoHideOnPlay}
          onClick={() => onAutoHideOnPlay(!autoHideOnPlay)}
          className={`studio-tele-row ${autoHideOnPlay ? 'is-on' : ''}`}
          title="Hide menu and library shelf while playing"
        >
          <span className={`studio-tele-switch ${autoHideOnPlay ? 'is-on' : ''}`} aria-hidden>
            <span className="studio-tele-knob" />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-xs font-medium text-ink-100">Auto hide</span>
            <span className="block text-[10px] text-ink-500">Collapse chrome while listening</span>
          </span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={autoFocusOnPlay}
          onClick={() => onAutoFocusOnPlay(!autoFocusOnPlay)}
          className={`studio-tele-row ${autoFocusOnPlay ? 'is-on' : ''}`}
          title="Enter focus mode when playback starts (F)"
        >
          <span className={`studio-tele-switch ${autoFocusOnPlay ? 'is-on' : ''}`} aria-hidden>
            <span className="studio-tele-knob" />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-xs font-medium text-ink-100">Auto focus on play</span>
            <span className="block text-[10px] text-ink-500">Focus mode when play starts</span>
          </span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={focusMiniPlayer}
          onClick={() => onFocusMiniPlayer(!focusMiniPlayer)}
          className={`studio-tele-row ${focusMiniPlayer ? 'is-on' : ''}`}
          title="Keep mini transport bar while in focus mode"
        >
          <span className={`studio-tele-switch ${focusMiniPlayer ? 'is-on' : ''}`} aria-hidden>
            <span className="studio-tele-knob" />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-xs font-medium text-ink-100">Focus mini player</span>
            <span className="block text-[10px] text-ink-500">Keep transport while focused</span>
          </span>
        </button>
      </section>

      <p className="px-0.5 text-[10px] text-ink-500">
        Press <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-ink-300">?</kbd> for
        shortcuts
      </p>

      {isError && error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {status === 'idle' && (
        <p className="px-0.5 text-[10px] leading-relaxed text-ink-500">
          First play downloads ~160 MB Kokoro (once). Cached offline.
        </p>
      )}
    </div>
  )
})

function PlayIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
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
