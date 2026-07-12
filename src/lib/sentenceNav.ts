import type { WordToken } from './tokenize'

/** Global word indices that start a sentence. */
export function sentenceStartIndices(words: WordToken[]): number[] {
  const starts: number[] = []
  let atStart = true
  for (const w of words) {
    if (atStart) {
      starts.push(w.idx)
      atStart = false
    }
    if (w.endsSentence) atStart = true
  }
  return starts
}

/** Next/previous sentence start relative to `fromWordIdx`, or null at ends. */
export function adjacentSentenceStart(
  words: WordToken[],
  fromWordIdx: number,
  delta: 1 | -1,
): number | null {
  const starts = sentenceStartIndices(words)
  if (starts.length === 0) return null

  let cur = 0
  for (let i = 0; i < starts.length; i++) {
    if (starts[i]! <= fromWordIdx) cur = i
    else break
  }

  const next = cur + delta
  if (next < 0 || next >= starts.length) return null
  return starts[next]!
}
