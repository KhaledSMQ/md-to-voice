import { useEffect, useRef, type RefObject } from 'react'
import type { Device, VoiceInfo } from '../lib/tts/types'
import type { LoadProgress, PlayerStatus } from '../lib/usePlayer'
import { AudioVisualizer } from './AudioVisualizer'

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
  activeWordIdx: number
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
}

export function Controls({
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
  activeWordIdx,
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
}: Props) {
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
  const volumePct = Math.round(volume * 100)
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

  const selectedVoiceMeta = voices.find((v) => v.id === voice) ?? null

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
    <div className="space-y-4">
      {/* Stage */}
      <section className="space-y-2" aria-label="Playback stage">
        <AudioVisualizer
          analyserRef={analyserRef}
          playerStatus={status}
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

        <div className="grid grid-cols-1 gap-3">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="tts-volume" className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
                Volume
              </label>
              <span className="text-[11px] font-mono tabular-nums text-ink-300">
                {isMuted ? 'Muted' : `${volumePct}%`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMute}
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all active:scale-95 ${
                  isMuted
                    ? 'border-amber-300/40 bg-amber-300/15 text-amber-200'
                    : 'border-white/10 bg-white/[0.04] text-ink-300 hover:border-white/20 hover:bg-white/10'
                }`}
                title={isMuted ? 'Unmute' : 'Mute'}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                aria-pressed={isMuted}
              >
                {isMuted ? <VolumeMutedIcon /> : <VolumeIcon />}
              </button>
              <input
                id="tts-volume"
                name="volume"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => onVolume(Number(e.target.value))}
                className="control-range min-w-0 flex-1"
              />
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="tts-speed" className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
                Speed
              </label>
              <span className="text-[11px] font-mono tabular-nums text-ink-300">{speed.toFixed(2)}×</span>
            </div>
            <input
              id="tts-speed"
              name="speed"
              type="range"
              min={0.5}
              max={1.5}
              step={0.05}
              value={speed}
              onChange={(e) => onSpeed(Number(e.target.value))}
              className="control-range"
            />
          </div>
        </div>
      </section>

      {/* Instruments */}
      <section className="studio-instruments" aria-label="Instruments">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="tts-voice" className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
              Voice
            </label>
            {selectedVoiceMeta && (
              <span className="truncate text-[10px] text-ink-500">
                {selectedVoiceMeta.language === 'en-us'
                  ? 'US'
                  : selectedVoiceMeta.language === 'en-gb'
                    ? 'UK'
                    : selectedVoiceMeta.language}
                {' · '}
                {selectedVoiceMeta.gender === 'Female' ? 'F' : 'M'}
                {selectedVoiceMeta.traits ? ` · ${selectedVoiceMeta.traits}` : ''}
              </span>
            )}
          </div>
          <select
            id="tts-voice"
            name="voice"
            value={voice}
            onChange={(e) => onVoice(e.target.value)}
            className="studio-voice-select w-full rounded-lg border border-white/10 bg-ink-950/80 px-2.5 py-2 text-xs text-ink-100 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-300/60"
          >
            {voices.length === 0 ? (
              <option value={voice}>{voiceLabel(voice)}</option>
            ) : (
              voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.traits ? ` (${v.traits})` : ''}
                </option>
              ))
            )}
          </select>
        </div>

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
}

/** Pretty-print a Kokoro voice id before the catalog loads (`af_heart` → `Heart`). */
function voiceLabel(id: string): string {
  const leaf = id.includes('_') ? id.slice(id.indexOf('_') + 1) : id
  if (!leaf) return id
  return leaf.charAt(0).toUpperCase() + leaf.slice(1)
}

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

function VolumeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
      <path d="M11 5L6 9H3v6h3l5 4V5z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" strokeLinecap="round" />
      <path d="M19.07 4.93a9 9 0 0 1 0 12.73" strokeLinecap="round" />
    </svg>
  )
}

function VolumeMutedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
      <path d="M11 5L6 9H3v6h3l5 4V5z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m16 9 5 5M21 9l-5 5" strokeLinecap="round" />
    </svg>
  )
}
