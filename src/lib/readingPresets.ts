/** Preview reading themes — soft contrast + type tuned for long sessions. */

export const READING_PRESET_IDS = ['night', 'sepia', 'day', 'contrast'] as const

export type ReadingPresetId = (typeof READING_PRESET_IDS)[number]

export type ReadingPresetMeta = {
  id: ReadingPresetId
  label: string
  /** Short hint for the switcher. */
  hint: string
  /** Swatch colors shown in the UI (bg / text). */
  swatch: { bg: string; fg: string }
}

export const READING_PRESETS: readonly ReadingPresetMeta[] = [
  {
    id: 'night',
    label: 'Dusk',
    hint: 'Warm dark — easy for long night reading',
    swatch: { bg: '#17140f', fg: '#e2d8c6' },
  },
  {
    id: 'sepia',
    label: 'Paper',
    hint: 'Soft parchment + serif, book-like',
    swatch: { bg: '#f3ead8', fg: '#3a3228' },
  },
  {
    id: 'day',
    label: 'Page',
    hint: 'Warm off-white, clear for writing',
    swatch: { bg: '#f7f5f0', fg: '#2c2c2a' },
  },
  {
    id: 'contrast',
    label: 'Sharp',
    hint: 'Highest contrast without pure black/white glare',
    swatch: { bg: '#0c0c0c', fg: '#f0f0f0' },
  },
] as const

export const DEFAULT_READING_PRESET: ReadingPresetId = 'night'

/** Line measure in `ch` (approx. characters per line). 100 = fill the panel. */
export const MEASURE_WIDTH_MIN = 42
export const MEASURE_WIDTH_MAX = 100
export const MEASURE_WIDTH_DEFAULT = 66

export const MEASURE_WIDTH_PRESETS = [
  { id: 'narrow', label: 'Narrow', ch: 48 },
  { id: 'comfort', label: 'Comfort', ch: 66 },
  { id: 'wide', label: 'Wide', ch: 82 },
  { id: 'full', label: 'Full', ch: 100 },
] as const

export function isReadingPresetId(v: unknown): v is ReadingPresetId {
  return typeof v === 'string' && (READING_PRESET_IDS as readonly string[]).includes(v)
}

export function clampMeasureWidth(n: number): number {
  return Math.min(MEASURE_WIDTH_MAX, Math.max(MEASURE_WIDTH_MIN, Math.round(n)))
}

/** CSS length for the reading column. Full (100) fills the panel. */
export function measureWidthCss(ch: number): string {
  const v = clampMeasureWidth(ch)
  return v >= MEASURE_WIDTH_MAX ? '100%' : `${v}ch`
}
