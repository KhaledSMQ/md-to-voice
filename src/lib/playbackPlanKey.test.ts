import { describe, expect, it } from 'vitest'
import { playbackPlanKey } from './playbackPlanKey'
import type { Chunk } from './chunker'

function chunk(text: string, startWordIdx: number, endWordIdx: number): Chunk {
  return {
    idx: 0,
    text,
    startWordIdx,
    endWordIdx,
    words: [],
  }
}

describe('playbackPlanKey', () => {
  const a = [chunk('Hello world.', 0, 2)]
  const b = [chunk('Hello world.', 0, 2)]

  it('changes when documentId changes even if chunks match', () => {
    expect(playbackPlanKey('doc-a', a)).not.toBe(playbackPlanKey('doc-b', b))
  })

  it('stays stable for the same document and chunk plan', () => {
    expect(playbackPlanKey('doc-a', a)).toBe(playbackPlanKey('doc-a', b))
  })

  it('changes when chunk text changes', () => {
    const other = [chunk('Different text.', 0, 2)]
    expect(playbackPlanKey('doc-a', a)).not.toBe(playbackPlanKey('doc-a', other))
  })
})
