import type {
  Device,
  GenerateMessage,
  ProgressEvent,
  VoiceInfo,
  WorkerInbound,
  WorkerOutbound,
} from './types'

export type TTSResult = {
  blob: Blob
  durationSec: number
  samplingRate: number
}

export type ProgressCallback = (e: ProgressEvent) => void
export type ReadyCallback = (info: { device: Device; voices: VoiceInfo[] }) => void

type Pending = {
  resolve: (r: TTSResult) => void
  reject: (e: Error) => void
}

export class TTSClient {
  private worker: Worker
  private pending = new Map<number, Pending>()
  private nextReqId = 1
  private readyPromise: Promise<{ device: Device; voices: VoiceInfo[] }>
  private resolveReady!: (info: { device: Device; voices: VoiceInfo[] }) => void
  private rejectReady!: (err: Error) => void
  private onProgressCb: ProgressCallback | null = null

  constructor() {
    this.worker = new Worker(new URL('./tts.worker.ts', import.meta.url), { type: 'module' })
    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    this.worker.addEventListener('message', this.onMessage)
    this.worker.addEventListener('error', (e) => {
      this.rejectReady(new Error(e.message || 'Worker crashed'))
    })
  }

  init(): Promise<{ device: Device; voices: VoiceInfo[] }> {
    const msg: WorkerInbound = { type: 'init' }
    this.worker.postMessage(msg)
    return this.readyPromise
  }

  onProgress(cb: ProgressCallback | null): void {
    this.onProgressCb = cb
  }

  async generate(text: string, voice: string, speed: number): Promise<TTSResult> {
    const reqId = this.nextReqId++
    const msg: GenerateMessage = { type: 'generate', reqId, text, voice, speed }
    return new Promise<TTSResult>((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject })
      this.worker.postMessage(msg)
    })
  }

  cancel(): void {
    const msg: WorkerInbound = { type: 'cancel' }
    this.worker.postMessage(msg)
    this.pending.forEach(({ reject }) => reject(new Error('cancelled')))
    this.pending.clear()
  }

  destroy(): void {
    this.worker.terminate()
    this.pending.clear()
  }

  private onMessage = (e: MessageEvent<WorkerOutbound>) => {
    const msg = e.data
    switch (msg.type) {
      case 'progress':
        this.onProgressCb?.(msg)
        break
      case 'ready':
        this.resolveReady({ device: msg.device, voices: msg.voices })
        break
      case 'generated': {
        const handler = this.pending.get(msg.reqId)
        if (!handler) return
        this.pending.delete(msg.reqId)
        const blob = new Blob([msg.audio], { type: 'audio/wav' })
        handler.resolve({ blob, durationSec: msg.durationSec, samplingRate: msg.samplingRate })
        break
      }
      case 'error': {
        if (msg.reqId != null) {
          const handler = this.pending.get(msg.reqId)
          if (handler) {
            this.pending.delete(msg.reqId)
            handler.reject(new Error(msg.message))
            return
          }
        }
        this.rejectReady(new Error(msg.message))
        break
      }
    }
  }
}
