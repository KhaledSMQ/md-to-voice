import { toString } from 'mdast-util-to-string'
import { visit } from 'unist-util-visit'
import type { Heading, Root as MdastRoot } from 'mdast'

export type OutlineItem = {
  id: string
  level: 1 | 2 | 3 | 4
  text: string
}

type HeadingData = {
  hProperties?: Record<string, unknown>
}

/**
 * Walk headings, assign stable unique ids (via `data.hProperties`), and return
 * a flat outline for the preview TOC. Ids survive remark-rehype → React.
 */
export function stampDocumentOutline(tree: MdastRoot): OutlineItem[] {
  const items: OutlineItem[] = []
  const used = new Map<string, number>()

  visit(tree, 'heading', (node: Heading) => {
    if (node.depth < 1 || node.depth > 4) return
    const text = toString(node).replace(/\s+/g, ' ').trim()
    if (!text) return

    const id = uniqueSlug(text, used)
    const data = (node.data ??= {}) as HeadingData
    data.hProperties = { ...data.hProperties, id }
    items.push({ id, level: node.depth as 1 | 2 | 3 | 4, text })
  })

  return items
}

export function uniqueSlug(text: string, used: Map<string, number>): string {
  const base =
    text
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/[\s-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'

  const n = used.get(base) ?? 0
  used.set(base, n + 1)
  return n === 0 ? base : `${base}-${n}`
}

/** Scroll a heading into the preview scrollport with a small top inset. */
export function scrollHeadingIntoContainer(
  container: HTMLElement,
  heading: HTMLElement,
  opts?: { behavior?: ScrollBehavior; inset?: number },
): void {
  const inset = opts?.inset ?? 12
  const behavior = opts?.behavior ?? 'smooth'
  const cRect = container.getBoundingClientRect()
  const hRect = heading.getBoundingClientRect()
  const top = hRect.top - cRect.top + container.scrollTop - inset
  const max = Math.max(0, container.scrollHeight - container.clientHeight)
  const target = Math.max(0, Math.min(max, top))
  if (typeof container.scrollTo === 'function') {
    container.scrollTo({ top: target, behavior })
  } else {
    container.scrollTop = target
  }
}
