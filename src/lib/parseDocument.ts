import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import type { ReactNode } from 'react'
import type { Root as MdastRoot } from 'mdast'
import type { Root as HastRoot } from 'hast'
import { extractWords, splitWordsPlugin, wordifyHandlers, type WordToken } from './tokenize'
import { chunkWords, type Chunk } from './chunker'
import { stampDocumentOutline, type OutlineItem } from './documentOutline'

export type ParsedDocument = {
  reactNode: ReactNode
  words: WordToken[]
  chunks: Chunk[]
  outline: OutlineItem[]
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(splitWordsPlugin)
  .use(remarkRehype, {
    handlers: wordifyHandlers,
    allowDangerousHtml: false,
  })

export function parseDocument(markdown: string): ParsedDocument {
  const mdast = processor.parse(markdown) as MdastRoot
  // Stamp ids before runSync so remark-rehype copies them onto <h*> elements.
  const outline = stampDocumentOutline(mdast)
  const transformed = processor.runSync(mdast) as HastRoot
  const words = collectWordsFromMdast(mdast)
  const chunks = chunkWords(words)

  const reactNode = toJsxRuntime(transformed, {
    Fragment,
    jsx,
    jsxs,
    passKeys: true,
  }) as ReactNode

  return { reactNode, words, chunks, outline }
}

function collectWordsFromMdast(tree: MdastRoot): WordToken[] {
  return extractWords(tree)
}
