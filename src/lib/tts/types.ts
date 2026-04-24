export type Device = 'webgpu' | 'wasm'

export type ProgressEvent = {
  type: 'progress'
  status: string
  file?: string
  progress?: number
  loaded?: number
  total?: number
}

export type ReadyEvent = {
  type: 'ready'
  device: Device
  voices: VoiceInfo[]
}

export type GeneratedEvent = {
  type: 'generated'
  reqId: number
  audio: ArrayBuffer
  samplingRate: number
  durationSec: number
}

export type ErrorEvent = {
  type: 'error'
  reqId?: number
  message: string
}

export type WorkerOutbound = ProgressEvent | ReadyEvent | GeneratedEvent | ErrorEvent

export type InitMessage = {
  type: 'init'
}

export type GenerateMessage = {
  type: 'generate'
  reqId: number
  text: string
  voice: string
  speed: number
}

export type CancelMessage = {
  type: 'cancel'
}

export type WorkerInbound = InitMessage | GenerateMessage | CancelMessage

export type VoiceInfo = {
  id: string
  name: string
  language: string
  gender: string
  traits?: string
}
