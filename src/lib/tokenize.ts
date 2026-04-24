import { prepareWithSegments } from '@chenglou/pretext'
import { SKIP, visit } from 'unist-util-visit'
import type { Handler } from 'mdast-util-to-hast'
import type { Element as HastElement, ElementContent, Text as HastText } from 'hast'
import type { Nodes as MdastNodes, Parent as MdastParent, Root as MdastRoot, RootContent } from 'mdast'

export type WordToken = {
  idx: number
  text: string
  sentenceIdx: number
  endsSentence: boolean
}

export type WordlessText = { type: 'whitespace'; value: string }
export type WordNode = { type: 'word'; value: string; wIdx: number; sentenceIdx: number; endsSentence: boolean }

declare module 'mdast' {
  interface RootContentMap {
    word: WordNode
    whitespace: WordlessText
  }
  interface PhrasingContentMap {
    word: WordNode
    whitespace: WordlessText
  }
}

const SENTENCE_TERMINATOR = /[.!?…。！？]["”’)\]]?$/

const TTSABLE_PARENTS = new Set([
  'paragraph',
  'heading',
  'listItem',
  'tableCell',
  'blockquote',
  'emphasis',
  'strong',
  'delete',
  'link',
  'linkReference',
  'footnoteReference',
])

/**
 * Block-level mdast nodes whose end is a natural pause for the reader (and
 * for TTS playback). Treating them as sentence boundaries means we never
 * stitch a heading and the next paragraph into the same TTS chunk — which
 * would force a mid-paragraph cut later.
 */
const BLOCK_PARENTS = new Set([
  'paragraph',
  'heading',
  'listItem',
  'tableCell',
  'blockquote',
])

const FONT = '16px Inter, system-ui, sans-serif'

function isWordKind(kind: string): boolean {
  return kind === 'text' || kind === 'soft-hyphen'
}

function segmentText(text: string): Array<{ kind: 'word' | 'space'; text: string }> {
  if (!text) return []
  try {
    const prepared = prepareWithSegments(text, FONT, { whiteSpace: 'pre-wrap' })
    const out: Array<{ kind: 'word' | 'space'; text: string }> = []
    for (let i = 0; i < prepared.segments.length; i++) {
      const seg = prepared.segments[i]
      const kind = prepared.kinds[i]
      if (!seg) continue
      out.push({ kind: isWordKind(kind) ? 'word' : 'space', text: seg })
    }
    return out
  } catch {
    return fallbackSegment(text)
  }
}

function fallbackSegment(text: string): Array<{ kind: 'word' | 'space'; text: string }> {
  const out: Array<{ kind: 'word' | 'space'; text: string }> = []
  const re = /(\s+)/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) out.push({ kind: 'word', text: text.slice(last, match.index) })
    out.push({ kind: 'space', text: match[0] })
    last = match.index + match[0].length
  }
  if (last < text.length) out.push({ kind: 'word', text: text.slice(last) })
  return out
}

type WordifyState = { wIdx: number; sentenceIdx: number }

export function splitWordsPlugin() {
  return (tree: MdastRoot) => {
    const state: WordifyState = { wIdx: 0, sentenceIdx: 0 }
    wordifyTree(tree, state)
    markBlockEnds(tree)
  }
}

function markBlockEnds(tree: MdastRoot): void {
  visit(tree, (node) => {
    if (!BLOCK_PARENTS.has((node as MdastNodes).type)) return
    const last = findLastWordDescendant(node as MdastParent)
    if (!last || last.endsSentence) return
    last.endsSentence = true
  })
  let sentenceIdx = 0
  visit(tree, 'word' as MdastNodes['type'], (node) => {
    const w = node as unknown as WordNode
    w.sentenceIdx = sentenceIdx
    if (w.endsSentence) sentenceIdx++
  })
}

function findLastWordDescendant(node: MdastParent): WordNode | null {
  const children = node.children as RootContent[]
  for (let i = children.length - 1; i >= 0; i--) {
    const c = children[i]
    if ((c as { type: string }).type === 'word') return c as unknown as WordNode
    const inner = (c as unknown as MdastParent).children
    if (Array.isArray(inner)) {
      const found = findLastWordDescendant(c as unknown as MdastParent)
      if (found) return found
    }
  }
  return null
}

function wordifyTree(tree: MdastRoot, state: WordifyState): void {
  visit(tree, 'text', (node, index, parent) => {
    if (parent == null || index == null) return
    const parentType = (parent as MdastParent).type
    if (!TTSABLE_PARENTS.has(parentType)) return
    const replacements = textToWordNodes(node.value, state)
    if (replacements.length === 0) return
    ;(parent as MdastParent).children.splice(
      index,
      1,
      ...(replacements as RootContent[]),
    )
    return [SKIP, index + replacements.length]
  })
}

function textToWordNodes(value: string, state: WordifyState): Array<WordNode | WordlessText> {
  const segments = segmentText(value)
  const out: Array<WordNode | WordlessText> = []
  for (const seg of segments) {
    if (seg.kind === 'space') {
      out.push({ type: 'whitespace', value: seg.text })
    } else {
      const endsSentence = SENTENCE_TERMINATOR.test(seg.text)
      out.push({
        type: 'word',
        value: seg.text,
        wIdx: state.wIdx++,
        sentenceIdx: state.sentenceIdx,
        endsSentence,
      })
      if (endsSentence) state.sentenceIdx++
    }
  }
  return out
}

export function extractWords(tree: MdastRoot): WordToken[] {
  const out: WordToken[] = []
  visit(tree, 'word' as MdastNodes['type'], (node) => {
    const w = node as unknown as WordNode
    out.push({ idx: w.wIdx, text: w.value, sentenceIdx: w.sentenceIdx, endsSentence: w.endsSentence })
  })
  return out
}

export const wordifyHandlers: Record<string, Handler> = {
  word(_state, node): HastElement {
    const w = node as unknown as WordNode
    return {
      type: 'element',
      tagName: 'span',
      properties: {
        className: ['word'],
        'data-w-idx': String(w.wIdx),
        'data-sentence': String(w.sentenceIdx),
      },
      children: [{ type: 'text', value: w.value } as HastText],
    }
  },
  whitespace(_state, node): ElementContent {
    const w = node as unknown as WordlessText
    return { type: 'text', value: w.value } as HastText
  },
}
