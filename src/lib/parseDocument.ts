import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import type { ReactNode } from 'react'
import type { Root as MdastRoot } from 'mdast'
import type { Element as HastElement, Root as HastRoot } from 'hast'
import { extractWords, splitWordsPlugin, wordifyHandlers, type WordToken } from './tokenize'
import { chunkWords, type Chunk } from './chunker'
import { stampDocumentOutline, type OutlineItem } from './documentOutline'
import {
  plainTextToMdast,
  prepareSource,
  type ContentFormatMode,
  type ResolvedContentFormat,
} from './contentFormat'

export type ParsedDocument = {
  reactNode: ReactNode
  words: WordToken[]
  chunks: Chunk[]
  outline: OutlineItem[]
  resolvedFormat: ResolvedContentFormat
}

export type ParseDocumentOptions = {
  contentFormat?: ContentFormatMode
  wrapNewlines?: boolean
}

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(splitWordsPlugin)
  .use(remarkRehype, {
    handlers: wordifyHandlers,
    allowDangerousHtml: false,
  })

const plainTextProcessor = unified()
  .use(splitWordsPlugin)
  .use(remarkRehype, {
    handlers: wordifyHandlers,
    allowDangerousHtml: false,
  })

export function parseDocument(
  source: string,
  options: ParseDocumentOptions = {},
): ParsedDocument {
  // Default markdown preserves existing callers until format UI is wired.
  const contentFormat = options.contentFormat ?? 'markdown'
  const wrapNewlines = options.wrapNewlines ?? false
  const { markdown, resolvedFormat } = prepareSource(source, {
    contentFormat,
    wrapNewlines,
  })

  if (resolvedFormat === 'text') {
    return finishDocument(plainTextToMdast(source), resolvedFormat, 'text')
  }
  return finishDocument(markdownProcessor.parse(markdown) as MdastRoot, resolvedFormat, 'markdown')
}

function finishDocument(
  mdast: MdastRoot,
  resolvedFormat: ResolvedContentFormat,
  path: ResolvedContentFormat,
): ParsedDocument {
  // Stamp ids before runSync so remark-rehype copies them onto <h*> elements.
  const outline = stampDocumentOutline(mdast)
  const processor = path === 'text' ? plainTextProcessor : markdownProcessor
  const transformed = processor.runSync(mdast) as HastRoot
  if (path === 'text') wrapPlainTextAsPre(transformed)

  const words = extractWords(mdast)
  const chunks = chunkWords(words)
  const reactNode = toJsxRuntime(transformed, {
    Fragment,
    jsx,
    jsxs,
    passKeys: true,
  }) as ReactNode

  return { reactNode, words, chunks, outline, resolvedFormat }
}

/** Monospace block so ASCII tables / line breaks keep their grid. */
function wrapPlainTextAsPre(tree: HastRoot): void {
  for (const child of tree.children) {
    if (child.type !== 'element') continue
    const el = child as HastElement
    if (el.tagName !== 'p') continue
    el.tagName = 'pre'
    const prev = el.properties?.className
    const classes = Array.isArray(prev)
      ? prev.map(String)
      : prev != null
        ? [String(prev)]
        : []
    el.properties = {
      ...el.properties,
      className: [...classes, 'plain-text-doc'],
    }
  }
}
