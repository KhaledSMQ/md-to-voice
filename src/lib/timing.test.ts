import { describe, expect, it } from 'vitest'
import {
  HIGHLIGHT_LOOKAHEAD_SEC,
  LEADING_SILENCE_SEC,
  activeWordInChunk,
  chunkWordEndTimes,
} from './timing'
import type { Chunk } from './chunker'
import type { WordToken } from './tokenize'

function makeChunk(texts: string[]): Chunk {
  const words: WordToken[] = texts.map((text, i) => ({
    idx: i,
    text,
    sentenceIdx: 0,
    endsSentence: i === texts.length - 1,
  }))
  return {
    idx: 0,
    text: texts.join(' '),
    startWordIdx: 0,
    endWordIdx: texts.length,
    words,
  }
}

describe('chunkWordEndTimes', () => {
  it('returns empty for empty chunk', () => {
    expect(chunkWordEndTimes(makeChunk([]), 1)).toEqual([])
  })

  it('maps words into the speech window after leading silence', () => {
    const ends = chunkWordEndTimes(makeChunk(['Hello', 'world.']), 2)
    expect(ends).toHaveLength(2)
    expect(ends[0]!).toBeGreaterThan(LEADING_SILENCE_SEC * 0.5)
    expect(ends[1]!).toBeGreaterThan(ends[0]!)
    expect(ends[1]!).toBeLessThanOrEqual(2)
  })

  it('gives short words a non-tiny slice via min weight', () => {
    const ends = chunkWordEndTimes(makeChunk(['I', 'am', 'extraordinary.']), 3)
    const spans = [ends[0]!, ends[1]! - ends[0]!, ends[2]! - ends[1]!]
    // "I" should not be vanishingly small vs "am"
    expect(spans[0]!).toBeGreaterThan(0.05)
  })

  it('adds extra weight for sentence-ending punctuation', () => {
    const plain = chunkWordEndTimes(makeChunk(['hello', 'world']), 2)
    const punct = chunkWordEndTimes(makeChunk(['hello', 'world.']), 2)
    // Second word with period should claim a larger share of the span
    const plainSecond = plain[1]! - plain[0]!
    const punctSecond = punct[1]! - punct[0]!
    expect(punctSecond).toBeGreaterThan(plainSecond)
  })
})

describe('activeWordInChunk', () => {
  it('returns 0 before the first end (with lookahead)', () => {
    const ends = [0.5, 1.0, 1.5]
    expect(activeWordInChunk(ends, 0)).toBe(0)
  })

  it('advances with lookahead so highlights lead audio slightly', () => {
    const ends = [0.5, 1.0, 1.5]
    // Without lookahead, t=0.45 is still word 0; with +0.08 lookahead it crosses 0.5
    const t = 0.5 - HIGHLIGHT_LOOKAHEAD_SEC + 0.001
    expect(activeWordInChunk(ends, t)).toBe(1)
  })

  it('returns length when past the last end', () => {
    const ends = [0.5, 1.0]
    expect(activeWordInChunk(ends, 2)).toBe(2)
  })
})
