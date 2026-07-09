import { chunkText } from '@responsivevoice/text'
import type { WordToken } from './tokenize'

export type Chunk = {
  /** Order in the document, 0-based. */
  idx: number
  /** Text passed to the TTS engine. */
  text: string
  /** Inclusive start word index in the global flat word list. */
  startWordIdx: number
  /** Exclusive end word index. */
  endWordIdx: number
  /** The actual words in this chunk, in order. */
  words: WordToken[]
}

/**
 * Soft ceiling for a single TTS clip. `@responsivevoice/text` clamps public
 * limits to 50–300; we stay near the high end so we get fewer audio seams
 * while still splitting very long sentences at natural clause boundaries.
 */
const CHARACTER_LIMIT = 220

/**
 * Group words into TTS-sized chunks.
 *
 * 1. Keep sentence / block boundaries from tokenization (`endsSentence`) —
 *    those are natural pauses (and keep headings from merging into body text).
 * 2. When a single sentence/block exceeds {@link CHARACTER_LIMIT}, split it
 *    with `@responsivevoice/text` (sentence → clause → comma → word, digit-aware).
 */
export function chunkWords(words: WordToken[]): Chunk[] {
  if (words.length === 0) return []

  const chunks: Chunk[] = []
  for (const group of groupBySentence(words)) {
    const text = renderChunkText(group)
    if (normalizeSpeakable(text).length <= CHARACTER_LIMIT) {
      chunks.push(toChunk(chunks.length, group))
      continue
    }

    const parts = chunkText(text, { characterLimit: CHARACTER_LIMIT })
    let offset = 0
    for (const part of parts) {
      const mapped = takeWordsForText(group, offset, part.text)
      if (mapped.words.length === 0) continue
      chunks.push(toChunk(chunks.length, mapped.words))
      offset = mapped.nextOffset
    }

    // Safety: any leftover words (mapping drift) become their own clip.
    if (offset < group.length) {
      chunks.push(toChunk(chunks.length, group.slice(offset)))
    }
  }

  return chunks
}

function groupBySentence(words: WordToken[]): WordToken[][] {
  const groups: WordToken[][] = []
  let buf: WordToken[] = []
  for (const w of words) {
    buf.push(w)
    if (w.endsSentence) {
      groups.push(buf)
      buf = []
    }
  }
  if (buf.length > 0) groups.push(buf)
  return groups
}

function toChunk(idx: number, words: WordToken[]): Chunk {
  return {
    idx,
    text: renderChunkText(words),
    startWordIdx: words[0]!.idx,
    endWordIdx: words[words.length - 1]!.idx + 1,
    words,
  }
}

/**
 * Consume the smallest prefix of `group.slice(offset)` whose rendered text
 * matches the library chunk (after the same whitespace normalization
 * `chunkText` applies).
 */
function takeWordsForText(
  group: WordToken[],
  offset: number,
  chunkTextValue: string,
): { words: WordToken[]; nextOffset: number } {
  const want = normalizeSpeakable(chunkTextValue)
  if (!want || offset >= group.length) return { words: [], nextOffset: offset }

  let built = ''
  for (let i = offset; i < group.length; i++) {
    built = appendWord(built, group[i]!)
    if (normalizeSpeakable(built) === want) {
      return { words: group.slice(offset, i + 1), nextOffset: i + 1 }
    }
  }

  // Fallback: if normalization drifted, take remaining words in this group.
  return { words: group.slice(offset), nextOffset: group.length }
}

function normalizeSpeakable(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

function appendWord(out: string, word: WordToken): string {
  if (!out) return word.text
  // Pretext splits hyphenated compounds like "one-by-one" into multiple tokens
  // (trailing "-" is a line-break opportunity). Don't insert a space or Kokoro
  // will pause between pieces.
  if (out.endsWith('-')) return out + word.text
  return `${out} ${word.text}`
}

function renderChunkText(words: WordToken[]): string {
  let out = ''
  for (const w of words) out = appendWord(out, w)
  return out.replace(/\s+([.,!?;:…])/g, '$1').trim()
}
