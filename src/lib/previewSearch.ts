/** Highlight registry names used with the CSS Custom Highlight API. */
export const PREVIEW_SEARCH_HIGHLIGHT = 'preview-search'
export const PREVIEW_SEARCH_CURRENT = 'preview-search-current'

const supportsCssHighlight =
  typeof CSS !== 'undefined' &&
  'highlights' in CSS &&
  typeof Highlight !== 'undefined'

/**
 * Collect case-insensitive match Ranges for `query` inside `root`.
 * Ranges may span multiple text nodes (e.g. across word spans).
 */
export function findTextRanges(root: HTMLElement, query: string): Range[] {
  const q = query.trim()
  if (!q || !root) return []

  const needle = q.toLowerCase()
  const nodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const text = node as Text
    // Skip empty / whitespace-only nodes — they still participate in joined
    // text via neighboring nodes, but alone they never start a match.
    if (text.data.length > 0) nodes.push(text)
    node = walker.nextNode()
  }
  if (nodes.length === 0) return []

  // Build a flat haystack with an index map back to (node, offset).
  let haystack = ''
  const map: Array<{ node: Text; start: number; end: number }> = []
  for (const n of nodes) {
    const start = haystack.length
    haystack += n.data
    map.push({ node: n, start, end: haystack.length })
  }

  const lower = haystack.toLowerCase()
  const ranges: Range[] = []
  let from = 0
  while (from <= lower.length - needle.length) {
    const idx = lower.indexOf(needle, from)
    if (idx < 0) break
    const end = idx + needle.length
    const range = rangeFromFlatOffsets(map, idx, end)
    if (range) ranges.push(range)
    // Advance by 1 so overlapping matches (e.g. "aa" in "aaa") are found.
    from = idx + 1
  }
  return ranges
}

function rangeFromFlatOffsets(
  map: Array<{ node: Text; start: number; end: number }>,
  flatStart: number,
  flatEnd: number,
): Range | null {
  let startNode: Text | null = null
  let startOffset = 0
  let endNode: Text | null = null
  let endOffset = 0

  for (const entry of map) {
    if (startNode == null && flatStart >= entry.start && flatStart < entry.end) {
      startNode = entry.node
      startOffset = flatStart - entry.start
    }
    // End is exclusive in flat space; a match ending at entry.end lands at
    // offset entry.node.length.
    if (flatEnd > entry.start && flatEnd <= entry.end) {
      endNode = entry.node
      endOffset = flatEnd - entry.start
      break
    }
  }

  if (!startNode || !endNode) return null
  try {
    const range = document.createRange()
    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
    return range
  } catch {
    return null
  }
}

/** Clear both preview-search highlight registries. */
export function clearPreviewSearchHighlights(): void {
  if (!supportsCssHighlight) return
  CSS.highlights.delete(PREVIEW_SEARCH_HIGHLIGHT)
  CSS.highlights.delete(PREVIEW_SEARCH_CURRENT)
}

/**
 * Paint all matches (and the current one) via CSS Custom Highlight API.
 * No-ops when the API is unavailable — caller can use overlay fallback.
 */
export function applyPreviewSearchHighlights(ranges: Range[], currentIndex: number): boolean {
  if (!supportsCssHighlight) return false
  clearPreviewSearchHighlights()
  if (ranges.length === 0) return true

  const others = ranges.filter((_, i) => i !== currentIndex)
  if (others.length > 0) {
    CSS.highlights.set(PREVIEW_SEARCH_HIGHLIGHT, new Highlight(...others))
  }
  if (currentIndex >= 0 && currentIndex < ranges.length) {
    const cur = ranges[currentIndex]
    if (cur) CSS.highlights.set(PREVIEW_SEARCH_CURRENT, new Highlight(cur))
  }
  return true
}

export function cssHighlightSupported(): boolean {
  return supportsCssHighlight
}

/**
 * Scroll `container` so `range` sits near the eye-line (same ratio as the
 * karaoke auto-scroll), without smooth-scroll fighting the user.
 */
export function scrollRangeIntoContainer(
  container: HTMLElement,
  range: Range,
  eyeLineRatio = 0.42,
): void {
  const rangeRect = range.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  if (rangeRect.height === 0 && rangeRect.width === 0) return

  const rangeCenter =
    rangeRect.top - containerRect.top + container.scrollTop + rangeRect.height / 2
  const eyeLine = container.clientHeight * eyeLineRatio
  const desired = rangeCenter - eyeLine
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight)
  const target = Math.max(0, Math.min(maxScroll, desired))

  const alreadyVisible =
    rangeRect.top >= containerRect.top + 8 && rangeRect.bottom <= containerRect.bottom - 8
  if (alreadyVisible && Math.abs(container.scrollTop - target) < 48) return

  container.scrollTop = target
}

/** Client rects for painting an overlay on the current match (Highlight API fallback). */
export function rangeOverlayBoxes(
  range: Range,
  /** Positioning root — typically the non-scrolling frame around the preview. */
  frame: HTMLElement,
): Array<{ top: number; left: number; width: number; height: number }> {
  const frameRect = frame.getBoundingClientRect()
  const boxes: Array<{ top: number; left: number; width: number; height: number }> = []
  const rects = range.getClientRects()
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]!
    if (r.width < 1 && r.height < 1) continue
    boxes.push({
      top: r.top - frameRect.top,
      left: r.left - frameRect.left,
      width: r.width,
      height: Math.max(r.height, 2),
    })
  }
  return boxes
}
