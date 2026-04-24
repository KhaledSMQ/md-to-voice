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

const MIN_WORDS_PER_CHUNK = 3
const MAX_WORDS_PER_CHUNK = 28
/**
 * If a sentence runs past MAX, fall back to clause-level splitting at
 * `, ; :` so we don't slice mid-phrase. We only do this when forced — see
 * the loop below.
 */
const SOFT_BREAK_MIN_WORDS = 12

/**
 * Group words into TTS-sized chunks. Each chunk is a separate TTS request
 * and a separate `<audio>` clip, and there is always a small audible gap
 * between two clips (Kokoro's silent padding + browser audio swap latency).
 * So we want as FEW chunk boundaries as possible — ideally one per sentence.
 *
 * Break priority:
 *   1. Sentence terminator (. ! ? …) once we have >= MIN words → natural pause
 *   2. Hard cap at MAX_WORDS_PER_CHUNK → only forces a split for very long
 *      sentences. When that fires we prefer to retroactively cut at the last
 *      soft-break (`,;:`) inside the buffer so we don't slice mid-phrase.
 */
export function chunkWords(words: WordToken[]): Chunk[] {
  if (words.length === 0) return []

  const chunks: Chunk[] = []
  let buf: WordToken[] = []

  const flushUpTo = (count: number) => {
    if (count <= 0 || count > buf.length) return
    const slice = buf.slice(0, count)
    chunks.push({
      idx: chunks.length,
      text: renderChunkText(slice),
      startWordIdx: slice[0].idx,
      endWordIdx: slice[slice.length - 1].idx + 1,
      words: slice,
    })
    buf = buf.slice(count)
  }

  const flush = () => flushUpTo(buf.length)

  for (const w of words) {
    buf.push(w)
    if (w.endsSentence && buf.length >= MIN_WORDS_PER_CHUNK) {
      flush()
      continue
    }
    if (buf.length >= MAX_WORDS_PER_CHUNK) {
      const cut = findLastSoftBreak(buf, SOFT_BREAK_MIN_WORDS)
      flushUpTo(cut > 0 ? cut : buf.length)
    }
  }
  flush()

  return chunks
}

/**
 * Returns the count of words to flush — the index just after the last word
 * in `buf` that ends with a soft-break punctuation, provided that index is
 * >= `minCount`. Returns 0 if no suitable break is found (caller falls back
 * to a hard cut).
 */
function findLastSoftBreak(buf: WordToken[], minCount: number): number {
  for (let i = buf.length - 1; i >= minCount - 1; i--) {
    if (endsWithSoftBreak(buf[i].text)) return i + 1
  }
  return 0
}

function endsWithSoftBreak(text: string): boolean {
  for (let i = text.length - 1; i >= Math.max(0, text.length - 3); i--) {
    const ch = text[i]
    if (ch === ',' || ch === ';' || ch === ':' || ch === '、') return true
    if (!(ch === ')' || ch === ']' || ch === '"' || ch === "'" || ch === '”' || ch === '’')) return false
  }
  return false
}

function renderChunkText(words: WordToken[]): string {
  let out = ''
  for (let i = 0; i < words.length; i++) {
    const t = words[i].text
    if (i === 0) {
      out = t
      continue
    }
    // Pretext splits hyphenated compounds like "one-by-one" or "char-weighted"
    // into multiple word tokens (the trailing "-" marks a valid line-break
    // point). We must NOT insert a space between them or Kokoro will read
    // them as three separate words with little pauses.
    if (words[i - 1].text.endsWith('-')) out += t
    else out += ' ' + t
  }
  return out.replace(/\s+([.,!?;:…])/g, '$1').trim()
}
