import { describe, expect, it } from 'vitest'
import { chunkWords, type Chunk } from './chunker'
import type { WordToken } from './tokenize'

function words(...items: Array<string | { text: string; endsSentence?: boolean }>): WordToken[] {
  return items.map((item, i) => {
    const text = typeof item === 'string' ? item : item.text
    const endsSentence = typeof item === 'string' ? false : Boolean(item.endsSentence)
    return { idx: i, text, sentenceIdx: 0, endsSentence }
  })
}

function texts(chunks: Chunk[]): string[] {
  return chunks.map((c) => c.text)
}

describe('chunkWords', () => {
  it('returns empty for no words', () => {
    expect(chunkWords([])).toEqual([])
  })

  it('flushes at sentence terminators', () => {
    const w = words(
      'One',
      'two',
      { text: 'three.', endsSentence: true },
      'Next',
      'sentence',
      { text: 'here.', endsSentence: true },
    )
    const chunks = chunkWords(w)
    expect(chunks).toHaveLength(2)
    expect(texts(chunks)).toEqual(['One two three.', 'Next sentence here.'])
    expect(chunks[0]!.startWordIdx).toBe(0)
    expect(chunks[0]!.endWordIdx).toBe(3)
    expect(chunks[1]!.startWordIdx).toBe(3)
  })

  it('still emits remaining words on final flush under the min size', () => {
    const w = words('Hi', { text: 'there.', endsSentence: true })
    const chunks = chunkWords(w)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.text).toBe('Hi there.')
  })

  it('joins hyphenated compounds without spaces', () => {
    const w = words('one-', 'by-', 'one', { text: 'works.', endsSentence: true })
    const chunks = chunkWords(w)
    expect(chunks[0]!.text).toBe('one-by-one works.')
  })

  it('splits long sentences with @responsivevoice/text at clause boundaries', () => {
    const parts: Array<string | { text: string; endsSentence?: boolean }> = []
    for (let i = 0; i < 20; i++) parts.push(`word${i}`)
    parts.push('clause,')
    for (let i = 0; i < 30; i++) parts.push(`extra${i}`)
    parts.push({ text: 'end.', endsSentence: true })
    const chunks = chunkWords(words(...parts))
    expect(chunks.length).toBeGreaterThan(1)
    const joined = chunks.map((c) => c.text).join(' | ')
    expect(joined).toContain('clause,')
    // Word ranges stay contiguous and cover the whole sentence.
    expect(chunks[0]!.startWordIdx).toBe(0)
    expect(chunks[chunks.length - 1]!.endWordIdx).toBe(parts.length)
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.startWordIdx).toBe(chunks[i - 1]!.endWordIdx)
    }
  })
})
