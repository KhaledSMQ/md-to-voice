import type { Chunk } from './chunker'

/**
 * Visual lookahead: highlight the next word slightly before its audio onset
 * so the eye perceives the highlight as "on time" rather than late. Tuned
 * empirically — typical perception lag is ~50-100ms.
 */
export const HIGHLIGHT_LOOKAHEAD_SEC = 0.08

/**
 * Kokoro TTS pads each generated chunk with a small amount of silence at the
 * start. Subtract this offset before mapping audio time to word position so
 * the first word doesn't get marked active during the silent intro.
 */
export const LEADING_SILENCE_SEC = 0.06

/**
 * Trailing silence at the end of a chunk. Reserve this much time at the tail
 * so we don't run our cumulative-end past the actual final-word offset.
 */
export const TRAILING_SILENCE_SEC = 0.08

/**
 * Minimum per-word "weight". Without a floor, single-character words ("a",
 * "I") get an unrealistically tiny slice of duration since Kokoro speaks them
 * in roughly the same time as a 3-char word.
 */
const MIN_WORD_WEIGHT = 3

/**
 * Extra weight added per trailing punctuation character to model the pause
 * Kokoro inserts at clause/sentence boundaries.
 *   ,  ;  :        ~150 ms pause  → +3
 *   .  !  ?  …    ~300 ms pause  → +6
 */
function punctuationWeight(text: string): number {
  let extra = 0
  // Look at the last 1-2 chars (handle "voice." and "voice.)" or "voice.\"")
  for (let i = text.length - 1; i >= Math.max(0, text.length - 3); i--) {
    const ch = text[i]
    if (ch === '.' || ch === '!' || ch === '?' || ch === '…' || ch === '。' || ch === '！' || ch === '？') {
      extra += 6
      break
    }
    if (ch === ',' || ch === ';' || ch === ':' || ch === '、') {
      extra += 3
      break
    }
    // Skip closing punctuation like ) ] " ' ’ when looking for the terminator.
    if (!(ch === ')' || ch === ']' || ch === '"' || ch === "'" || ch === '”' || ch === '’')) {
      break
    }
  }
  return extra
}

/**
 * Compute cumulative end times (in seconds) for each word in a chunk.
 *
 * Weights every word by `max(MIN_WORD_WEIGHT, length) + punctuationBonus`,
 * then maps the cumulative weight onto the speech window of the chunk —
 * `[LEADING_SILENCE_SEC, durationSec - TRAILING_SILENCE_SEC]` — clamped so
 * silence padding never gets a word assigned to it.
 *
 * Returns an array `ends` such that the i-th word is "active" while
 * `t` (audio.currentTime) is in `[ends[i-1], ends[i])`. Use 0 for ends[-1].
 */
export function chunkWordEndTimes(chunk: Chunk, durationSec: number): number[] {
  const n = chunk.words.length
  if (n === 0) return []

  const speechStart = Math.min(LEADING_SILENCE_SEC, durationSec * 0.05)
  const speechEnd = Math.max(speechStart, durationSec - Math.min(TRAILING_SILENCE_SEC, durationSec * 0.05))
  const speechSpan = Math.max(0.001, speechEnd - speechStart)

  const weights = new Array<number>(n)
  let total = 0
  for (let i = 0; i < n; i++) {
    const text = chunk.words[i].text
    const w = Math.max(MIN_WORD_WEIGHT, text.length) + punctuationWeight(text)
    weights[i] = w
    total += w
  }

  if (total <= 0) {
    const ends = new Array<number>(n)
    for (let i = 0; i < n; i++) ends[i] = speechStart + ((i + 1) / n) * speechSpan
    return ends
  }

  const ends = new Array<number>(n)
  let acc = 0
  for (let i = 0; i < n; i++) {
    acc += weights[i]
    ends[i] = speechStart + (acc / total) * speechSpan
  }
  return ends
}

/**
 * Given an array of cumulative end times for a chunk's words and an elapsed
 * time `t`, return the index (within the chunk) of the currently active word,
 * or `chunk.words.length` if past the last word. Uses binary search.
 */
export function activeWordInChunk(ends: number[], t: number): number {
  // Apply visual lookahead so highlights appear slightly before the audio
  // onset (compensates for browser paint + visual perception lag).
  const tLook = t + HIGHLIGHT_LOOKAHEAD_SEC
  let lo = 0
  let hi = ends.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (tLook < ends[mid]) hi = mid
    else lo = mid + 1
  }
  return lo
}
