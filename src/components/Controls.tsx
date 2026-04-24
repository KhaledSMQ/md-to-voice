import type { Device, VoiceInfo } from '../lib/tts/types'
import type { LoadProgress, PlayerStatus } from '../lib/usePlayer'

type Props = {
  status: PlayerStatus
  device: Device | null
  voices: VoiceInfo[]
  voice: string
  speed: number
  progress: LoadProgress
  error: string | null
  totalChunks: number
  currentChunkIdx: number
  onVoice: (voice: string) => void
  onSpeed: (speed: number) => void
  onPlay: () => void
  onPause: () => void
  onStop: () => void
}

export function Controls({
  status,
  device,
  voices,
  voice,
  speed,
  progress,
  error,
  totalChunks,
  currentChunkIdx,
  onVoice,
  onSpeed,
  onPlay,
  onPause,
  onStop,
}: Props) {
  const isLoading = status === 'loading-model'
  const isPlaying = status === 'playing'
  const canPause = status === 'playing'
  const canStop = status === 'playing' || status === 'paused'
  const isError = status === 'error'

  const ratio = progress.ratio ?? 0
  const ratioPct = Math.min(100, Math.max(0, ratio * 100))

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4 space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={isPlaying ? onPause : onPlay}
          disabled={isLoading}
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            isPlaying
              ? 'bg-amber-300 text-ink-950 hover:bg-amber-200'
              : 'bg-emerald-400 text-ink-950 hover:bg-emerald-300'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
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
          onClick={onStop}
          disabled={!canStop && !canPause}
          className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-ink-200 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Stop"
        >
          <StopIcon />
        </button>
      </div>

      {isLoading && (
        <div className="space-y-1">
          <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-300 to-pink-400 transition-[width]"
              style={{ width: `${ratioPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-ink-400 font-mono">
            <span className="truncate" title={progress.file}>
              {progress.file ?? progress.status ?? 'preparing…'}
            </span>
            <span>{ratioPct.toFixed(0)}%</span>
          </div>
        </div>
      )}

      {totalChunks > 0 && (
        <div className="text-xs text-ink-400">
          Chunk{' '}
          <span className="font-mono text-ink-200">
            {Math.max(0, currentChunkIdx + 1)}
          </span>{' '}
          / <span className="font-mono">{totalChunks}</span>
        </div>
      )}

      <div>
        <label htmlFor="tts-voice" className="block text-xs text-ink-400 mb-1">
          Voice
        </label>
        <select
          id="tts-voice"
          name="voice"
          value={voice}
          onChange={(e) => onVoice(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-ink-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
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

      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="tts-speed" className="block text-xs text-ink-400 mb-1">
            Speed
          </label>
          <span className="text-xs font-mono text-ink-300">{speed.toFixed(2)}x</span>
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
          className="w-full accent-amber-300"
        />
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-400">Backend</span>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono ${
            device === 'webgpu'
              ? 'border-emerald-400/30 text-emerald-300 bg-emerald-400/10'
              : 'border-sky-400/30 text-sky-300 bg-sky-400/10'
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {device ?? 'detecting…'}
        </span>
      </div>

      {isError && error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {status === 'idle' && (
        <p className="text-[11px] text-ink-500 leading-relaxed">
          First play downloads the ~160 MB Kokoro model and caches it. Future loads are instant.
        </p>
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
