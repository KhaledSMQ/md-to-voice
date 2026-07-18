export type DocumentBookmark = {
  id: string
  wordIdx: number
  /** Word text snapshot for the list UI. */
  label: string
  createdAt: number
}

export const MAX_BOOKMARKS = 25

export function newBookmarkId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `bm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Newest first. */
export function sortBookmarksNewestFirst(bookmarks: DocumentBookmark[]): DocumentBookmark[] {
  return [...bookmarks].sort((a, b) => {
    const c = b.createdAt - a.createdAt
    if (c !== 0) return c
    return a.id.localeCompare(b.id)
  })
}

export function normalizeBookmarks(raw: unknown): DocumentBookmark[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: DocumentBookmark[] = []
  const seenWords = new Set<number>()
  for (const item of raw) {
    if (item == null || typeof item !== 'object') continue
    const b = item as Record<string, unknown>
    const wordIdx = Math.floor(Number(b.wordIdx))
    if (!Number.isFinite(wordIdx) || wordIdx < 0) continue
    if (seenWords.has(wordIdx)) continue
    const id = typeof b.id === 'string' && b.id ? b.id : newBookmarkId()
    const label = typeof b.label === 'string' ? b.label.slice(0, 80) : ''
    const createdAt = Number(b.createdAt)
    out.push({
      id,
      wordIdx,
      label: label || `Word ${wordIdx}`,
      createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    })
    seenWords.add(wordIdx)
    if (out.length >= MAX_BOOKMARKS) break
  }
  if (out.length === 0) return undefined
  return sortBookmarksNewestFirst(out)
}

export function findBookmarkAtWord(
  bookmarks: DocumentBookmark[],
  wordIdx: number,
): DocumentBookmark | undefined {
  return bookmarks.find((b) => b.wordIdx === wordIdx)
}

export function toggleBookmark(
  bookmarks: DocumentBookmark[],
  wordIdx: number,
  label: string,
): { bookmarks: DocumentBookmark[]; added: boolean } {
  const existing = findBookmarkAtWord(bookmarks, wordIdx)
  if (existing) {
    return {
      bookmarks: bookmarks.filter((b) => b.id !== existing.id),
      added: false,
    }
  }
  const next: DocumentBookmark = {
    id: newBookmarkId(),
    wordIdx,
    label: label.slice(0, 80) || `Word ${wordIdx}`,
    createdAt: Date.now(),
  }
  return {
    bookmarks: sortBookmarksNewestFirst([next, ...bookmarks]).slice(0, MAX_BOOKMARKS),
    added: true,
  }
}

export function removeBookmark(
  bookmarks: DocumentBookmark[],
  id: string,
): DocumentBookmark[] {
  return bookmarks.filter((b) => b.id !== id)
}

/**
 * Drop out-of-range bookmarks and refresh labels from current word text.
 * Returns the same array reference when nothing changed.
 */
export function clampBookmarks(
  bookmarks: DocumentBookmark[],
  words: ReadonlyArray<{ idx: number; text: string }>,
): DocumentBookmark[] {
  if (bookmarks.length === 0) return bookmarks
  const byIdx = new Map(words.map((w) => [w.idx, w.text] as const))
  let changed = false
  const next: DocumentBookmark[] = []
  for (const b of bookmarks) {
    const text = byIdx.get(b.wordIdx)
    if (text == null) {
      changed = true
      continue
    }
    const label = text.slice(0, 80) || b.label
    if (label !== b.label) {
      changed = true
      next.push({ ...b, label })
    } else {
      next.push(b)
    }
  }
  if (!changed && next.length === bookmarks.length) return bookmarks
  return sortBookmarksNewestFirst(next)
}

/** Cycle through newest-first list: first call → index 0, then 1, … wrap. */
export function nextCycleIndex(current: number | null, length: number): number {
  if (length <= 0) return -1
  if (current == null || current < 0 || current >= length) return 0
  return (current + 1) % length
}

export function bookmarkWordIdxSet(bookmarks: DocumentBookmark[]): Set<number> {
  return new Set(bookmarks.map((b) => b.wordIdx))
}
