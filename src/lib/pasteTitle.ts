/**
 * Short document title from pasted text: first few words of the first line,
 * with a leading markdown heading marker stripped.
 */
export function titleFromPastedText(text: string, maxWords = 6): string {
  const line = text.trim().split(/\r?\n/, 1)[0] ?? ''
  const cleaned = line
    .replace(/^#{1,6}\s+/, '')
    .replace(/[*_`~[\]()>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = cleaned.split(' ').filter(Boolean).slice(0, maxWords)
  if (words.length === 0) return 'pasted.md'
  const title = words.join(' ')
  return title.length > 80 ? title.slice(0, 80).trimEnd() : title
}
