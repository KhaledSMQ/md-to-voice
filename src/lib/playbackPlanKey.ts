import type { Chunk } from './chunker'

/** Fingerprint for when the TTS plan must reset (doc switch or chunk rebuild). */
export function playbackPlanKey(documentId: string, chunks: Chunk[]): string {
  return `${documentId}:${chunks.length}:${chunks[0]?.text ?? ''}:${chunks[chunks.length - 1]?.text ?? ''}:${chunks[0]?.startWordIdx ?? -1}:${chunks[chunks.length - 1]?.endWordIdx ?? -1}`
}
