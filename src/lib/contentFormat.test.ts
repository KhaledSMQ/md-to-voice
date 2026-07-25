import { describe, expect, it } from 'vitest'
import {
  applyWrapNewlines,
  escapeMarkdown,
  looksLikeMarkdown,
  nextContentFormatMode,
  plainTextToMdast,
  prepareSource,
  resolveContentFormat,
} from './contentFormat'
import { parseDocument } from './parseDocument'

describe('looksLikeMarkdown', () => {
  it('detects headings and lists as markdown', () => {
    expect(looksLikeMarkdown('# Title\n\n- one\n- two')).toBe(true)
  })

  it('detects plain prose as text', () => {
    expect(
      looksLikeMarkdown(
        'Hello there.\nThis is just a note about the meeting tomorrow at noon.',
      ),
    ).toBe(false)
  })

  it('detects links and emphasis as markdown', () => {
    expect(looksLikeMarkdown('See **bold** and [docs](https://example.com).')).toBe(true)
  })

  it('does not treat ASCII pipe tables as markdown without a GFM delimiter', () => {
    const ascii = `| the generic model | what we have | status |
|_________________________+________________________+_________________________|
| read the tools (affordances) | the affordance socket | ✅ have it |`
    expect(looksLikeMarkdown(ascii)).toBe(false)
  })

  it('detects real GFM tables', () => {
    const gfm = `| a | b | status |
| --- | --- | --- |
| one | two | ✅ |`
    expect(looksLikeMarkdown(gfm)).toBe(true)
  })
})

describe('resolveContentFormat', () => {
  it('respects explicit modes', () => {
    expect(resolveContentFormat('markdown', 'plain note')).toBe('markdown')
    expect(resolveContentFormat('text', '# Heading')).toBe('text')
  })

  it('auto-detects from content', () => {
    expect(resolveContentFormat('auto', '# Hello')).toBe('markdown')
    expect(resolveContentFormat('auto', 'Just a sentence.')).toBe('text')
  })
})

describe('escapeMarkdown / wrap', () => {
  it('escapes markdown punctuation', () => {
    expect(escapeMarkdown('# Hello *world*')).toBe('\\# Hello \\*world\\*')
  })

  it('wraps soft newlines into hard breaks', () => {
    expect(applyWrapNewlines('line one\nline two\n\npara')).toBe('line one  \nline two\n\npara')
  })

  it('does not wrap inside fenced code', () => {
    const src = 'before\n```\na\nb\n```\nafter\nend'
    expect(applyWrapNewlines(src)).toBe('before\n```\na\nb\n```\nafter  \nend')
  })

  it('does not wrap GFM or ASCII table rows', () => {
    const src = `| a | b |
| --- | --- |
| c | d |
after`
    expect(applyWrapNewlines(src)).toBe(`| a | b |
| --- | --- |
| c | d |
after`)
  })
})

describe('plainTextToMdast', () => {
  it('keeps pipes and spaces as literal text with hard breaks', () => {
    const tree = plainTextToMdast('| a | b |\n| x | y |')
    expect(tree.children).toHaveLength(1)
    const para = tree.children[0]!
    expect(para.type).toBe('paragraph')
    if (para.type !== 'paragraph') return
    expect(para.children).toEqual([
      { type: 'text', value: '| a | b |' },
      { type: 'break' },
      { type: 'text', value: '| x | y |' },
    ])
  })
})

describe('prepareSource', () => {
  it('leaves plain text source untouched for the text parse path', () => {
    const prepared = prepareSource('Hello\n*world*', {
      contentFormat: 'text',
      wrapNewlines: true,
    })
    expect(prepared.resolvedFormat).toBe('text')
    expect(prepared.markdown).toBe('Hello\n*world*')
  })

  it('leaves markdown intact when format is markdown', () => {
    const prepared = prepareSource('# Title\n\nHello', {
      contentFormat: 'markdown',
      wrapNewlines: false,
    })
    expect(prepared.resolvedFormat).toBe('markdown')
    expect(prepared.markdown).toBe('# Title\n\nHello')
  })

  it('cycles format modes', () => {
    expect(nextContentFormatMode('auto')).toBe('markdown')
    expect(nextContentFormatMode('markdown')).toBe('text')
    expect(nextContentFormatMode('text')).toBe('auto')
  })
})

describe('parseDocument plain text', () => {
  it('preserves ASCII table pipes as readable words', () => {
    const src = `| col | status |
|_____+________|
| hi  | ✅     |`
    const { words, resolvedFormat } = parseDocument(src, { contentFormat: 'text' })
    expect(resolvedFormat).toBe('text')
    const joined = words.map((w) => w.text).join(' ')
    expect(joined).toContain('col')
    expect(joined).toContain('status')
    expect(joined).toContain('hi')
  })

  it('renders GFM tables in markdown mode without literal pipe words dominating', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { createElement } = await import('react')
    const src = `| a | b |
| --- | --- |
| c | d |`
    const { reactNode, resolvedFormat } = parseDocument(src, { contentFormat: 'markdown' })
    expect(resolvedFormat).toBe('markdown')
    const html = renderToStaticMarkup(createElement('div', null, reactNode))
    expect(html).toContain('<table>')
    expect(html).toContain('<td>')
  })
})
