import type { Root as MdastRoot } from 'mdast'

export type ContentFormatMode = 'auto' | 'markdown' | 'text'
export type ResolvedContentFormat = 'markdown' | 'text'

export const CONTENT_FORMAT_MODES: ContentFormatMode[] = ['auto', 'markdown', 'text']

export function isContentFormatMode(v: unknown): v is ContentFormatMode {
  return v === 'auto' || v === 'markdown' || v === 'text'
}

export function nextContentFormatMode(mode: ContentFormatMode): ContentFormatMode {
  const i = CONTENT_FORMAT_MODES.indexOf(mode)
  return CONTENT_FORMAT_MODES[(i + 1) % CONTENT_FORMAT_MODES.length]!
}

export function contentFormatLabel(mode: ContentFormatMode): string {
  switch (mode) {
    case 'auto':
      return 'Auto'
    case 'markdown':
      return 'Markdown'
    case 'text':
      return 'Plain text'
  }
}

/** True GFM table delimiter: `| --- | :---: | ---: |` (not ASCII `____+____` art). */
const GFM_TABLE_DELIMITER =
  /^\s*\|?[\t ]*:?-{3,}:?[\t ]*(\|[\t ]*:?-{3,}:?[\t ]*)+\|?[\t ]*$/m

/**
 * Heuristic: treat content as Markdown when it shows common MD structure.
 * Biased toward Markdown when unsure so existing docs keep rendering as before.
 * Pipe-only ASCII tables do NOT count — they need a GFM `---` delimiter row.
 */
export function looksLikeMarkdown(source: string): boolean {
  const text = source.trim()
  if (!text) return true

  let score = 0

  if (/^#{1,6}\s+\S/m.test(text)) score += 2
  if (/^```[\w-]*$/m.test(text) || /```[\s\S]*?```/.test(text)) score += 2
  if (/\[[^\]]+\]\([^)\s]+\)/.test(text)) score += 2
  if (/^>\s+\S/m.test(text)) score += 2
  if (GFM_TABLE_DELIMITER.test(text)) score += 2
  if (/^(\s{0,3})([-*+])\s+\S/m.test(text)) score += 1
  if (/^(\s{0,3})\d{1,3}\.\s+\S/m.test(text)) score += 1
  if (/(\*\*|__).+?\1/.test(text)) score += 1
  if (/`[^`\n]+`/.test(text)) score += 1
  if (/^---+$/m.test(text) || /^\*\*\*+$/m.test(text)) score += 1
  if (/!\[[^\]]*\]\([^)\s]+\)/.test(text)) score += 2

  return score >= 2
}

/** ASCII `___+___` rule row (not a GFM `---` delimiter). */
function isAsciiSeparatorLine(line: string): boolean {
  const t = line.trim()
  if (!t.includes('|') || !t.includes('_')) return false
  return /^[|+_.\-=\s]+$/.test(t)
}

/**
 * Terminal-style pipe table with `____+____` separators (not GFM).
 * These need a monospace cell grid — Markdown prose will never align them.
 */
export function looksLikeAsciiArtTable(source: string): boolean {
  const text = source.trim()
  if (!text || GFM_TABLE_DELIMITER.test(text)) return false
  return text.split('\n').some(isAsciiSeparatorLine)
}

export function resolveContentFormat(
  mode: ContentFormatMode,
  source: string,
): ResolvedContentFormat {
  if (mode === 'text') return 'text'
  // ASCII art tables always use the monospace <pre> path — even if the user
  // picked Markdown — because proportional faces cannot keep columns aligned.
  if (looksLikeAsciiArtTable(source) && !looksLikeMarkdown(source)) return 'text'
  if (mode === 'markdown') return 'markdown'
  return looksLikeMarkdown(source) ? 'markdown' : 'text'
}

/** Escape CommonMark punctuation so the source renders as literal plain text. */
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-.!|>])/g, '\\$1')
}

/**
 * Turn soft single newlines into Markdown hard breaks (`  \\n`), leaving
 * blank lines (paragraph breaks), fenced code, and GFM table rows alone.
 */
export function applyWrapNewlines(source: string): string {
  if (!source.includes('\n')) return source

  const parts = source.split(/(```[\s\S]*?```)/)
  return parts
    .map((part, i) => {
      // Odd segments are fenced code blocks from the capturing split.
      if (i % 2 === 1) return part
      return part
        .split('\n')
        .map((line, lineIdx, lines) => {
          if (lineIdx >= lines.length - 1) return line
          const next = lines[lineIdx + 1] ?? ''
          // Keep blank lines as paragraph breaks.
          if (line === '' || next === '') return line
          // Don't inject hard breaks into GFM / ASCII table rows.
          if (isTableLikeLine(line) || isTableLikeLine(next)) return line
          return `${line}  `
        })
        .join('\n')
    })
    .join('')
}

function isTableLikeLine(line: string): boolean {
  const t = line.trim()
  if (!t.includes('|')) return false
  // GFM delimiter or any pipe-row / ASCII `___+___` separator.
  return (
    GFM_TABLE_DELIMITER.test(t) ||
    /^\|.*\|$/.test(t) ||
    /^[|+_.\-=\s]+$/.test(t)
  )
}

/**
 * Markdown treats `_` / `__` as emphasis, which shreds ASCII `____+____`
 * separators into nested em/strong around the `+` marks.
 * Escape underscores on those structural rows only.
 */
export function escapeAsciiTableUnderscores(source: string): string {
  if (!source.includes('_')) return source
  return source
    .split('\n')
    .map((line) => (isAsciiSeparatorLine(line) ? line.replace(/_/g, '\\_') : line))
    .join('\n')
}

/**
 * Build an mdast tree for plain text without Markdown parsing, so spaces,
 * pipes, and ASCII tables stay literal. One paragraph holds the full source
 * (newlines included); wordify emits whitespace nodes for `\n`, and the
 * parse path wraps the result in a monospace `<pre>`.
 */
export function plainTextToMdast(source: string): MdastRoot {
  const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [{ type: 'text', value: normalized }],
      },
    ],
  }
}

export type PrepareSourceOptions = {
  contentFormat: ContentFormatMode
  wrapNewlines: boolean
}

export type PreparedSource = {
  markdown: string
  resolvedFormat: ResolvedContentFormat
}

/**
 * Normalize editor source into Markdown the parser understands for markdown
 * mode. Plain text uses {@link plainTextToMdast} instead (see parseDocument).
 */
export function prepareSource(source: string, options: PrepareSourceOptions): PreparedSource {
  const resolvedFormat = resolveContentFormat(options.contentFormat, source)
  if (resolvedFormat === 'text') {
    // Markdown string is unused for the text parse path; keep raw for debugging.
    return { markdown: source, resolvedFormat }
  }
  let markdown = escapeAsciiTableUnderscores(source)
  if (options.wrapNewlines) {
    markdown = applyWrapNewlines(markdown)
  }
  return { markdown, resolvedFormat }
}
