import { useEffect, useRef } from 'react'
import type { Device, VoiceInfo } from '../lib/tts/types'
import type { LoadProgress, PlayerStatus } from '../lib/usePlayer'
import { AudioVisualizer } from './AudioVisualizer'
import type { RefObject } from 'react'

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
}: Props) {
  const isLoading = status === 'loading-model'
  const isPlaying = status === 'playing'
  const canPause = status === 'playing'
  const canStop = status === 'playing' || status === 'paused'
  const isError = status === 'error'
  const canSkip = totalChunks > 0 && !isLoading
  const showChunkProgress =
    (status === 'playing' || status === 'paused' || status === 'finished') && totalChunks > 0

  const ratio = progress.ratio ?? 0
  const ratioPct = Math.min(100, Math.max(0, ratio * 100))
  const volumePct = Math.round(volume * 100)
  const isMuted = volume === 0
  const lastVolumeRef = useRef(volume > 0 ? volume : 0.85)

  useEffect(() => {
    if (volume > 0) lastVolumeRef.current = volume
  }, [volume])

  const chunkNumber = Math.max(0, currentChunkIdx + 1)
  const chunkPct =
    totalChunks > 0
      ? Math.min(100, Math.max(0, (chunkNumber / totalChunks) * 100))
      : 0

  const heardOrdinal =
    activeWordIdx >= 0 && totalWords > 0
      ? Math.min(totalWords, activeWordIdx + 1)
      : status === 'finished'
        ? totalWords
        : 0
  const wordPct =
    totalWords > 0 ? Math.min(100, Math.max(0, (heardOrdinal / totalWords) * 100)) : 0

  const toggleMute = () => {
    if (isMuted) onVolume(lastVolumeRef.current)
    else onVolume(0)
  }

  return (
    <div className="panel-card p-4 space-y-4">
      <AudioVisualizer analyserRef={analyserRef} playerStatus={status} />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrevChunk}
          disabled={!canSkip}
          className="inline-flex h-[42px] w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-ink-200 transition-all hover:border-white/20 hover:bg-white/10 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          title="Previous chunk (["
          aria-label="Previous chunk"
        >
          <SkipPrevIcon />
        </button>
        <button
          type="button"
          onClick={isPlaying ? onPause : onPlay}
          disabled={isLoading}
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${
            isPlaying
              ? 'bg-amber-300 text-ink-950 shadow-lg shadow-amber-300/25 hover:bg-amber-200'
              : 'bg-emerald-400 text-ink-950 shadow-lg shadow-emerald-400/20 hover:bg-emerald-300'
          }`}
          title={isPlaying ? 'Pause (space)' : 'Play (space)'}
        >
          {isLoading ? (
            <SpinnerIcon />
          ) : isPlaying ? (
            <PauseIcon />
          ) : (
            <PlayIcon />
          )}
          {isLoading
            ? 'Loading model…'
            : isPlaying
              ? 'Pause'
              : status === 'paused'
                ? 'Resume'
                : status === 'finished'
                  ? 'Play again'
                  : 'Play'}
        </button>
        <button
          type="button"
          onClick={onNextChunk}
          disabled={!canSkip}
          className="inline-flex h-[42px] w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-ink-200 transition-all hover:border-white/20 hover:bg-white/10 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          title="Next chunk (])"
          aria-label="Next chunk"
        >
          <SkipNextIcon />
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={!canStop && !canPause}
          className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-ink-200 transition-all hover:border-white/20 hover:bg-white/10 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
          title="Stop (Esc)"
        >
          <StopIcon />
        </button>
      </div>

      {isLoading && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-ink-400">
            <span>Downloading Kokoro</span>
            <span className="font-mono tabular-nums">{ratioPct.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-300 via-pink-400 to-sky-400 transition-[width] duration-300 ease-out"
              style={{ width: `${ratioPct}%` }}
            />
          </div>
          <p className="truncate text-[10px] font-mono text-ink-500" title={progress.file}>
            {progress.file ?? progress.status ?? 'preparing…'}
          </p>
        </div>
      )}

      {showChunkProgress && (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-ink-400">
              <span>Words</span>
              <span className="font-mono tabular-nums text-ink-300">
                {heardOrdinal} / {totalWords}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-300/90 to-pink-400/90 transition-[width] duration-300 ease-out"
                style={{ width: `${status === 'finished' ? 100 : wordPct}%` }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-ink-400">
              <span>Chunks</span>
              <span className="font-mono tabular-nums text-ink-300">
                {status === 'finished' ? totalChunks : chunkNumber} / {totalChunks}
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-white/25 transition-[width] duration-500 ease-out"
                style={{
                  width: `${status === 'finished' ? 100 : chunkPct}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3 border-t border-white/[0.06] pt-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="tts-volume" className="text-xs text-ink-400">Volume</label>
            <span className="text-xs font-mono tabular-nums text-ink-300">
              {isMuted ? 'Muted' : `${volumePct}%`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-all active:scale-95 ${
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
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="tts-speed" className="text-xs text-ink-400">Speed</label>
            <span className="text-xs font-mono tabular-nums text-ink-300">{speed.toFixed(2)}×</span>
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
          <div className="mt-1 flex justify-between text-[9px] font-mono text-ink-600">
            <span>0.5×</span>
            <span>1.0×</span>
            <span>1.5×</span>
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t border-white/[0.06] pt-3">
        <label htmlFor="tts-voice" className="block text-xs text-ink-400">
          Voice
        </label>
        <select
          id="tts-voice"
          name="voice"
          value={voice}
          onChange={(e) => onVoice(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-ink-950/80 px-3 py-2.5 text-sm text-ink-100 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-300/60"
        >
          {voices.length === 0 ? (
            <option value={voice}>{voice}</option>
          ) : (
            voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.language === 'en-us' ? 'US' : v.language === 'en-gb' ? 'UK' : v.language} · {v.gender === 'Female' ? 'F' : 'M'}
                {v.traits ? ` · ${v.traits}` : ''}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
        <span className="text-ink-400">Backend</span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${
            device === 'webgpu'
              ? 'border-emerald-400/30 text-emerald-300 bg-emerald-400/10'
              : 'border-sky-400/30 text-sky-300 bg-sky-400/10'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full bg-current ${device ? 'status-pulse' : ''}`}
          />
          {device ?? 'detecting…'}
        </span>
      </div>

      {isError && error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {status === 'idle' && (
        <div className="rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2.5 text-[11px] leading-relaxed text-ink-300 space-y-1.5">
          <p className="font-medium text-amber-100">First play downloads the model</p>
          <ul className="list-disc space-y-1 pl-4 text-ink-400">
            <li>~160 MB Kokoro ONNX from Hugging Face (once)</li>
            <li>WebGPU when available; otherwise WASM (slower)</li>
            <li>Cached locally — later visits work offline</li>
            <li>English voices only</li>
          </ul>
        </div>
      )}
    </div>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
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
      className="h-4 w-4 animate-spin"
    >
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  )
}

function VolumeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M11 5L6 9H3v6h3l5 4V5z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" strokeLinecap="round" />
      <path d="M19.07 4.93a9 9 0 0 1 0 12.73" strokeLinecap="round" />
    </svg>
  )
}

function VolumeMutedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M11 5L6 9H3v6h3l5 4V5z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m16 9 5 5M21 9l-5 5" strokeLinecap="round" />
    </svg>
  )
}
