/**
 * Science-informed reading rhythm: line height, letter spacing, paragraph gap.
 *
 * Grounding (practical, not dogma):
 * - WCAG 1.4.8 / 1.4.12: body line-height ≥ 1.5; users must be able to set
 *   letter-spacing ≥ 0.12em and paragraph spacing ≥ 2× font size.
 * - Digital long-form often sits ~1.6–1.8 (screen glare + scrolling).
 * - Mild positive tracking can aid letter distinction; large tracking hurts
 *   word-shape recognition for skilled readers (Tinker / typographic practice).
 * - Paragraph gap should exceed line gap so blocks read as units (Bringhurst).
 *
 * "Auto" keeps the face-specific leading/tracking from readingTypography.ts.
 */

export const READING_LEADING_IDS = ['auto', 'compact', 'comfort', 'relaxed', 'airy'] as const
export type ReadingLeadingId = (typeof READING_LEADING_IDS)[number]

export const READING_TRACKING_IDS = ['auto', 'tight', 'open', 'loose'] as const
export type ReadingTrackingId = (typeof READING_TRACKING_IDS)[number]

export const READING_PARAGRAPH_IDS = ['compact', 'comfort', 'open', 'airy'] as const
export type ReadingParagraphId = (typeof READING_PARAGRAPH_IDS)[number]

export type ReadingLeadingMeta = {
  id: ReadingLeadingId
  label: string
  hint: string
  /** Unitless line-height, or null to use the face default. */
  value: number | null
}

export type ReadingTrackingMeta = {
  id: ReadingTrackingId
  label: string
  hint: string
  /** CSS letter-spacing, or null to use the face default. */
  value: string | null
}

export type ReadingParagraphMeta = {
  id: ReadingParagraphId
  label: string
  hint: string
  /** Paragraph margin in em (of body size). */
  value: string
}

export const READING_LEADINGS: readonly ReadingLeadingMeta[] = [
  {
    id: 'auto',
    label: 'Auto',
    hint: 'Face default — tuned per typeface',
    value: null,
  },
  {
    id: 'compact',
    label: '1.45',
    hint: 'Compact — denser page, still readable on screen',
    value: 1.45,
  },
  {
    id: 'comfort',
    label: '1.5',
    hint: 'WCAG body minimum — balanced line height',
    value: 1.5,
  },
  {
    id: 'relaxed',
    label: '1.75',
    hint: 'Relaxed — common for long digital reading',
    value: 1.75,
  },
  {
    id: 'airy',
    label: '2.0',
    hint: 'Airy — extra separation for low vision / fatigue',
    value: 2,
  },
] as const

export const READING_TRACKINGS: readonly ReadingTrackingMeta[] = [
  {
    id: 'auto',
    label: 'Auto',
    hint: 'Face default tracking',
    value: null,
  },
  {
    id: 'tight',
    label: 'Tight',
    hint: 'Natural letter fit — max word shape',
    value: '0em',
  },
  {
    id: 'open',
    label: 'Open',
    hint: 'Slightly open — clearer letter distinction',
    value: '0.04em',
  },
  {
    id: 'loose',
    label: 'Loose',
    hint: 'WCAG spacing target (0.12em) — max separation',
    value: '0.12em',
  },
] as const

export const READING_PARAGRAPHS: readonly ReadingParagraphMeta[] = [
  {
    id: 'compact',
    label: 'Tight',
    hint: 'Closer blocks — more text in view',
    value: '0.65em',
  },
  {
    id: 'comfort',
    label: 'Comfort',
    hint: 'Clear paragraph breaks without large gaps',
    value: '0.95em',
  },
  {
    id: 'open',
    label: 'Open',
    hint: 'Breathing room between paragraphs',
    value: '1.35em',
  },
  {
    id: 'airy',
    label: 'Airy',
    hint: 'Near WCAG paragraph spacing (~2× font size)',
    value: '2em',
  },
] as const

export const DEFAULT_READING_LEADING: ReadingLeadingId = 'auto'
export const DEFAULT_READING_TRACKING: ReadingTrackingId = 'auto'
export const DEFAULT_READING_PARAGRAPH: ReadingParagraphId = 'comfort'

export function isReadingLeadingId(v: unknown): v is ReadingLeadingId {
  return typeof v === 'string' && (READING_LEADING_IDS as readonly string[]).includes(v)
}

export function isReadingTrackingId(v: unknown): v is ReadingTrackingId {
  return typeof v === 'string' && (READING_TRACKING_IDS as readonly string[]).includes(v)
}

export function isReadingParagraphId(v: unknown): v is ReadingParagraphId {
  return typeof v === 'string' && (READING_PARAGRAPH_IDS as readonly string[]).includes(v)
}

export function resolveReadingLeading(
  id: ReadingLeadingId,
  faceLeading: string,
): string {
  const meta = READING_LEADINGS.find((m) => m.id === id) ?? READING_LEADINGS[0]
  return meta.value == null ? faceLeading : String(meta.value)
}

export function resolveReadingTracking(
  id: ReadingTrackingId,
  faceTracking: string,
): string {
  const meta = READING_TRACKINGS.find((m) => m.id === id) ?? READING_TRACKINGS[0]
  return meta.value ?? faceTracking
}

export function resolveReadingParagraph(id: ReadingParagraphId): string {
  const meta = READING_PARAGRAPHS.find((m) => m.id === id) ?? READING_PARAGRAPHS[1]
  return meta.value
}
