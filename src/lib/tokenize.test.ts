import { describe, expect, it } from 'vitest'
import { extractWords, splitWordsPlugin } from './tokenize'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import type { Root as MdastRoot } from 'mdast'

function tokenizeMarkdown(md: string) {
  const processor = unified().use(remarkParse).use(splitWordsPlugin)
  const tree = processor.parse(md) as MdastRoot
  processor.runSync(tree)
  return extractWords(tree)
}

describe('splitWordsPlugin / extractWords', () => {
  it('assigns monotonically increasing word indices', () => {
    const words = tokenizeMarkdown('Hello brave world.')
    expect(words.length).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < words.length; i++) {
      expect(words[i]!.idx).toBe(words[i - 1]!.idx + 1)
    }
  })

  it('marks sentence terminators', () => {
    const words = tokenizeMarkdown('One two three. Four five six!')
    const terminators = words.filter((w) => w.endsSentence)
    expect(terminators.length).toBeGreaterThanOrEqual(2)
    expect(terminators.some((w) => w.text.includes('.'))).toBe(true)
  })

  it('skips fenced code blocks for TTS words', () => {
    const words = tokenizeMarkdown('Before\n\n```\nsecret code\n```\n\nAfter words here.')
    const texts = words.map((w) => w.text.toLowerCase())
    expect(texts.some((t) => t.includes('secret'))).toBe(false)
    expect(texts.some((t) => t.includes('before'))).toBe(true)
    expect(texts.some((t) => t.includes('after'))).toBe(true)
  })

  it('treats block ends as sentence boundaries', () => {
    const words = tokenizeMarkdown('# Title\n\nBody text here.')
    // Heading last word should end a sentence even without punctuation
    const titleWords = words.filter((w) => w.sentenceIdx === 0)
    expect(titleWords.length).toBeGreaterThan(0)
    expect(titleWords[titleWords.length - 1]!.endsSentence).toBe(true)
  })
})
