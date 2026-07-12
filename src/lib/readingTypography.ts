/**
 * Curated reading faces — few options, each with a clear job:
 * optical book serif, editorial serif, humanist sans, and low-vision hyperlegible.
 */

export const READING_TYPOGRAPHY_IDS = ['literata', 'serif', 'sans', 'hyperlegible'] as const

export type ReadingTypographyId = (typeof READING_TYPOGRAPHY_IDS)[number]

export type ReadingTypographyMeta = {
  id: ReadingTypographyId
  label: string
  hint: string
  /** Short face name shown in the picker sample. */
  sample: string
  /** CSS font-family stack applied to the preview. */
  stack: string
  /** Default tracking suited to the face at body size. */
  tracking: string
  /** Default line-height suited to the face. */
  leading: string
}

export const READING_TYPOGRAPHIES: readonly ReadingTypographyMeta[] = [
  {
    id: 'literata',
    label: 'Literata',
    hint: 'Optical book face — tuned for long digital reading',
    sample: 'Aa',
    stack: "'Literata', ui-serif, 'Iowan Old Style', Palatino, Georgia, serif",
    tracking: '0.006em',
    leading: '1.75',
  },
  {
    id: 'serif',
    label: 'Source Serif',
    hint: 'Editorial serif — calm print rhythm on screen',
    sample: 'Aa',
    stack: "'Source Serif 4', 'Source Serif Pro', 'Iowan Old Style', Georgia, serif",
    tracking: '0.004em',
    leading: '1.78',
  },
  {
    id: 'sans',
    label: 'Source Sans',
    hint: 'Humanist sans — clear counters, easy at body size',
    sample: 'Aa',
    stack: "'Source Sans 3', ui-sans-serif, 'Segoe UI', system-ui, sans-serif",
    tracking: '0.008em',
    leading: '1.7',
  },
  {
    id: 'hyperlegible',
    label: 'Hyperlegible',
    hint: 'Braille Institute — max letter distinction',
    sample: 'Aa',
    stack: "'Atkinson Hyperlegible', 'Segoe UI', system-ui, sans-serif",
    tracking: '0.012em',
    leading: '1.72',
  },
] as const

export const DEFAULT_READING_TYPOGRAPHY: ReadingTypographyId = 'literata'

export function isReadingTypographyId(v: unknown): v is ReadingTypographyId {
  return typeof v === 'string' && (READING_TYPOGRAPHY_IDS as readonly string[]).includes(v)
}

export function readingTypographyMeta(id: ReadingTypographyId): ReadingTypographyMeta {
  return READING_TYPOGRAPHIES.find((t) => t.id === id) ?? READING_TYPOGRAPHIES[0]
}
