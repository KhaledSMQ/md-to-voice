/// <reference lib="webworker" />
// Must evaluate before kokoro-js/phonemizer — Safari/iOS lack stream async iteration.
import './polyfillReadableStreamAsyncIterator'
import type { KokoroTTS } from 'kokoro-js'
import type {
  GenerateMessage,
  GeneratedEvent,
  ProgressEvent,
  ReadyEvent,
  VoiceInfo,
  WorkerInbound,
  WorkerOutbound,
} from './types'

const ctx = self as unknown as DedicatedWorkerGlobalScope

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'

let ttsPromise: Promise<KokoroTTS> | null = null
/** Explicitly cancelled request ids (seek / stop / voice change). */
const cancelled = new Set<number>()
/**
 * Serial queue — Kokoro is not safe to run concurrently. The previous
 * `activeReqId` gate silently dropped results when a newer generate started
 * (prefetch), which stalled playback at sentence boundaries: chunk N finished
 * speaking, chunk N+1's promise never resolved.
 */
const queue: GenerateMessage[] = []
let draining = false
let inFlightId: number | null = null

function post(msg: WorkerOutbound, transfer: Transferable[] = []): void {
  ctx.postMessage(msg, transfer)
}

/**
 * Phones/tablets (and iPadOS-as-desktop) cannot hold Kokoro fp32 (~310 MB) plus
 * ORT; WebGPU on iOS/WebKit also hard-crashes tabs. Force the small WASM path.
 */
function isConstrainedDevice(): boolean {
  const nav = ctx.navigator as Navigator | undefined
  if (!nav) return false
  const ua = (nav.userAgent ?? '').toLowerCase()
  if (/iphone|ipod|ipad|android|mobile/.test(ua)) return true
  // iPadOS 13+ often reports as MacIntel with touch points.
  const platform = (nav as Navigator & { platform?: string }).platform ?? ''
  if (platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1) return true
  return false
}

async function detectWebGPU(): Promise<boolean> {
  try {
    const navAny = (ctx as unknown as { navigator?: { gpu?: unknown } }).navigator
    if (!navAny?.gpu) return false
    const gpu = navAny.gpu as { requestAdapter?: () => Promise<unknown> }
    const adapter = await gpu.requestAdapter?.()
    return !!adapter
  } catch {
    return false
  }
}

async function ensureModel(): Promise<KokoroTTS> {
  if (ttsPromise) return ttsPromise
  ttsPromise = (async () => {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error(
        'This browser lacks DecompressionStream (needed for TTS). Update iOS/Safari to 16.4+ or use a newer Chrome.',
      )
    }

    // Dynamic import so phonemizer's gzip init runs only after the polyfill above.
    post({ type: 'progress', status: 'loading', file: 'phonemizer' })
    const { KokoroTTS: KokoroTTSClass } = await import('kokoro-js')

    const constrained = isConstrainedDevice()
    const useWebGPU = !constrained && (await detectWebGPU())
    // Mobile: always q8 (~88 MB). Desktop WebGPU: fp32. Desktop WASM: q8.
    const device: 'wasm' | 'webgpu' = useWebGPU ? 'webgpu' : 'wasm'
    const dtype: 'fp32' | 'q8' = useWebGPU ? 'fp32' : 'q8'

    post({
      type: 'progress',
      status: 'loading',
      file: constrained ? `kokoro (${dtype}/wasm)` : `kokoro (${dtype}/${device})`,
    })

    const tts = await KokoroTTSClass.from_pretrained(MODEL_ID, {
      dtype,
      device,
      progress_callback: (data: unknown) => {
        const d = data as Record<string, unknown>
        const ev: ProgressEvent = {
          type: 'progress',
          status: String(d.status ?? 'loading'),
          file: typeof d.file === 'string' ? d.file : undefined,
          progress: typeof d.progress === 'number' ? d.progress : undefined,
          loaded: typeof d.loaded === 'number' ? d.loaded : undefined,
          total: typeof d.total === 'number' ? d.total : undefined,
        }
        post(ev)
      },
    })

    const voices: VoiceInfo[] = Object.entries(tts.voices).map(([id, info]) => {
      const v = info as { name: string; language: string; gender: string; traits?: string }
      return {
        id,
        name: v.name,
        language: v.language,
        gender: v.gender,
        traits: v.traits,
      }
    })

    const ready: ReadyEvent = { type: 'ready', device, voices }
    post(ready)
    return tts
  })().catch((err: unknown) => {
    // Allow retry after a failed init (OOM / network / unsupported browser).
    ttsPromise = null
    throw err
  })
  return ttsPromise
}

async function runGenerate(msg: GenerateMessage): Promise<void> {
  try {
    const tts = await ensureModel()
    if (cancelled.has(msg.reqId)) {
      cancelled.delete(msg.reqId)
      return
    }
    const audio = await tts.generate(msg.text, {
      voice: msg.voice as Parameters<KokoroTTS['generate']>[1] extends infer T
        ? T extends { voice?: infer V }
          ? V
          : never
        : never,
      speed: msg.speed,
    })
    if (cancelled.has(msg.reqId)) {
      cancelled.delete(msg.reqId)
      return
    }
    // transformers v4 RawAudio exposes toBlob() (WAV), not toWav().
    const wav = await audio.toBlob().arrayBuffer()
    const durationSec = audio.data.length / audio.sampling_rate
    const ev: GeneratedEvent = {
      type: 'generated',
      reqId: msg.reqId,
      audio: wav,
      samplingRate: audio.sampling_rate,
      durationSec,
    }
    post(ev, [wav])
  } catch (err) {
    if (cancelled.has(msg.reqId)) {
      cancelled.delete(msg.reqId)
      return
    }
    post({
      type: 'error',
      reqId: msg.reqId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

async function drainQueue(): Promise<void> {
  if (draining) return
  draining = true
  try {
    while (queue.length > 0) {
      const msg = queue.shift()!
      if (cancelled.has(msg.reqId)) {
        cancelled.delete(msg.reqId)
        continue
      }
      inFlightId = msg.reqId
      await runGenerate(msg)
      inFlightId = null
    }
  } finally {
    draining = false
    inFlightId = null
    if (queue.length > 0) void drainQueue()
  }
}

function cancelPending(): void {
  // Drop queued work; client already rejects those promises.
  // Mark every queued id cancelled so a late drain can't resurrect them.
  for (const msg of queue) cancelled.add(msg.reqId)
  queue.length = 0
  // In-flight generate must not post a result after cancel.
  if (inFlightId != null) cancelled.add(inFlightId)
  // Bound the cancelled set — ids are monotonic and only matter while in-flight.
  if (cancelled.size > 64) {
    const keep = inFlightId
    cancelled.clear()
    if (keep != null) cancelled.add(keep)
  }
}

ctx.addEventListener('message', (e: MessageEvent<WorkerInbound>) => {
  const msg = e.data
  switch (msg.type) {
    case 'init':
      ensureModel().catch((err: unknown) =>
        post({ type: 'error', message: err instanceof Error ? err.message : String(err) }),
      )
      break
    case 'generate':
      cancelled.delete(msg.reqId)
      queue.push(msg)
      void drainQueue()
      break
    case 'cancel':
      cancelPending()
      break
  }
})

// phonemizer's gzip IIFE can reject outside our await chain on some browsers.
ctx.addEventListener('unhandledrejection', (ev) => {
  const reason = (ev as PromiseRejectionEvent).reason
  post({
    type: 'error',
    message: reason instanceof Error ? reason.message : String(reason ?? 'Unhandled worker rejection'),
  })
})

export {}
