import { useDeferredValue, useMemo } from 'react'
import { parseDocument, type ParsedDocument } from './parseDocument'

const EMPTY: ParsedDocument = {
  reactNode: null,
  words: [],
  chunks: [],
}

/**
 * Parse markdown once for the active document. Uses `useDeferredValue` so
 * typing stays responsive while the karaoke tree catches up.
 */
export function useParsedDocument(markdown: string): ParsedDocument {
  const deferred = useDeferredValue(markdown)
  return useMemo(() => {
    if (!deferred.trim()) return EMPTY
    try {
      return parseDocument(deferred)
    } catch {
      return EMPTY
    }
  }, [deferred])
}

export function wordMetaFromParsed(parsed: ParsedDocument): {
  wordCount: number
  lastWordGlobalIdx: number
} {
  const w = parsed.words
  if (w.length === 0) return { wordCount: 0, lastWordGlobalIdx: 0 }
  return {
    wordCount: w.length,
    lastWordGlobalIdx: w[w.length - 1]!.idx,
  }
}
