import { describe, expect, it } from 'vitest'
import { adjacentSentenceStart, sentenceStartIndices } from './sentenceNav'
import type { WordToken } from './tokenize'

function w(idx: number, endsSentence = false): WordToken {
  return { idx, text: `w${idx}`, sentenceIdx: 0, endsSentence }
}

describe('sentenceNav', () => {
  const words = [w(0), w(1, true), w(2), w(3), w(4, true), w(5)]

  it('lists sentence starts', () => {
    expect(sentenceStartIndices(words)).toEqual([0, 2, 5])
  })

  it('moves to the next and previous sentence', () => {
    expect(adjacentSentenceStart(words, 1, 1)).toBe(2)
    expect(adjacentSentenceStart(words, 3, -1)).toBe(0)
    expect(adjacentSentenceStart(words, 0, -1)).toBeNull()
    expect(adjacentSentenceStart(words, 5, 1)).toBeNull()
  })

  it('accepts precomputed sentence starts', () => {
    const starts = sentenceStartIndices(words)
    expect(adjacentSentenceStart(words, 1, 1, starts)).toBe(2)
    expect(adjacentSentenceStart(words, 3, -1, starts)).toBe(0)
  })
})
