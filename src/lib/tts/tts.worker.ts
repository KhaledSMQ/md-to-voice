/// <reference lib="webworker" />
import { KokoroTTS } from 'kokoro-js'
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
let activeReqId: number | null = null

function post(msg: WorkerOutbound, transfer: Transferable[] = []): void {
  ctx.postMessage(msg, transfer)
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
    const useWebGPU = await detectWebGPU()
    const device: 'wasm' | 'webgpu' = useWebGPU ? 'webgpu' : 'wasm'
    const dtype: 'fp32' | 'q8' = useWebGPU ? 'fp32' : 'q8'

    const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
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
  })()
  return ttsPromise
}

async function handleGenerate(msg: GenerateMessage): Promise<void> {
  activeReqId = msg.reqId
  try {
    const tts = await ensureModel()
    if (activeReqId !== msg.reqId) return
    const audio = await tts.generate(msg.text, {
      voice: msg.voice as Parameters<KokoroTTS['generate']>[1] extends infer T
        ? T extends { voice?: infer V }
          ? V
          : never
        : never,
      speed: msg.speed,
    })
    if (activeReqId !== msg.reqId) return
    const wav = audio.toWav()
    const durationSec = audio.audio.length / audio.sampling_rate
    const ev: GeneratedEvent = {
      type: 'generated',
      reqId: msg.reqId,
      audio: wav,
      samplingRate: audio.sampling_rate,
      durationSec,
    }
    post(ev, [wav])
  } catch (err) {
    post({
      type: 'error',
      reqId: msg.reqId,
      message: err instanceof Error ? err.message : String(err),
    })
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
      void handleGenerate(msg)
      break
    case 'cancel':
      activeReqId = null
      break
  }
})

export {}
