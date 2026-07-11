import { describe, expect, it } from 'vitest'
import { parseDocument } from './parseDocument'
import { stampDocumentOutline, uniqueSlug } from './documentOutline'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import type { Root as MdastRoot } from 'mdast'

describe('documentOutline', () => {
  it('uniqueSlug de-dupes collisions', () => {
    const used = new Map<string, number>()
    expect(uniqueSlug('Hello World', used)).toBe('hello-world')
    expect(uniqueSlug('Hello World', used)).toBe('hello-world-1')
  })

  it('stamps heading ids onto mdast and returns outline', () => {
    const tree = unified().use(remarkParse).parse(`# Intro

## Setup

### Details
`) as MdastRoot
    const outline = stampDocumentOutline(tree)
    expect(outline).toEqual([
      { id: 'intro', level: 1, text: 'Intro' },
      { id: 'setup', level: 2, text: 'Setup' },
      { id: 'details', level: 3, text: 'Details' },
    ])
  })

  it('parseDocument exposes outline matching heading ids', () => {
    const { outline, reactNode } = parseDocument(`# Title

Some words here.

## Chapter Two
`)
    expect(outline.map((o) => o.id)).toEqual(['title', 'chapter-two'])
    expect(reactNode).toBeTruthy()
  })

  it('renders heading elements with matching id attributes', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { createElement } = await import('react')
    const { reactNode } = parseDocument(`# Title\n\n## Chapter Two\n`)
    const html = renderToStaticMarkup(createElement('div', null, reactNode))
    expect(html).toContain('id="title"')
    expect(html).toContain('id="chapter-two"')
  })
})
