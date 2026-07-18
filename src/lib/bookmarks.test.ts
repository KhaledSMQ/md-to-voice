import { describe, expect, it } from 'vitest'
import {
  clampBookmarks,
  nextCycleIndex,
  normalizeBookmarks,
  toggleBookmark,
  type DocumentBookmark,
} from './bookmarks'

function bm(partial: Partial<DocumentBookmark> & { wordIdx: number }): DocumentBookmark {
  return {
    id: partial.id ?? `id-${partial.wordIdx}`,
    wordIdx: partial.wordIdx,
    label: partial.label ?? `w${partial.wordIdx}`,
    createdAt: partial.createdAt ?? 1,
  }
}

describe('toggleBookmark', () => {
  it('adds then removes at the same word', () => {
    const added = toggleBookmark([], 3, 'hello')
    expect(added.added).toBe(true)
    expect(added.bookmarks).toHaveLength(1)
    expect(added.bookmarks[0]!.wordIdx).toBe(3)
    expect(added.bookmarks[0]!.label).toBe('hello')

    const removed = toggleBookmark(added.bookmarks, 3, 'hello')
    expect(removed.added).toBe(false)
    expect(removed.bookmarks).toHaveLength(0)
  })
})

describe('clampBookmarks', () => {
  it('drops out-of-range and refreshes labels', () => {
    const input = [bm({ wordIdx: 0, label: 'old' }), bm({ wordIdx: 99, label: 'gone' })]
    const next = clampBookmarks(input, [
      { idx: 0, text: 'new' },
      { idx: 1, text: 'x' },
    ])
    expect(next).toHaveLength(1)
    expect(next[0]!.label).toBe('new')
  })

  it('returns the same reference when unchanged', () => {
    const input = [bm({ wordIdx: 0, label: 'a' })]
    const next = clampBookmarks(input, [{ idx: 0, text: 'a' }])
    expect(next).toBe(input)
  })
})

describe('nextCycleIndex', () => {
  it('starts at 0 then advances with wrap', () => {
    expect(nextCycleIndex(null, 3)).toBe(0)
    expect(nextCycleIndex(0, 3)).toBe(1)
    expect(nextCycleIndex(2, 3)).toBe(0)
  })
})

describe('normalizeBookmarks', () => {
  it('dedupes by wordIdx and sorts newest first', () => {
    const out = normalizeBookmarks([
      { id: 'a', wordIdx: 1, label: 'one', createdAt: 10 },
      { id: 'b', wordIdx: 1, label: 'dup', createdAt: 20 },
      { id: 'c', wordIdx: 2, label: 'two', createdAt: 30 },
    ])
    expect(out?.map((b) => b.id)).toEqual(['c', 'a'])
  })
})
