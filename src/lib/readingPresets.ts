/**
 * Preview reading themes tuned for sustained reading comfort:
 * soft contrast (≈7–12:1 body, higher for Sharp), warm spectra at night
 * (lower blue / circadian load), cream paper to cut glare, and soft
 * near-black/near-white for accessibility without OLED bloom.
 */

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
    hint: 'Warm low-blue dark — easier on evening eyes',
    swatch: { bg: '#1a1612', fg: '#d6cdb8' },
  },
  {
    id: 'sepia',
    label: 'Paper',
    hint: 'Cream page + soft ink — book contrast, less glare',
    swatch: { bg: '#f5edd9', fg: '#4a3f35' },
  },
  {
    id: 'day',
    label: 'Page',
    hint: 'Soft daylight + charcoal — clear without harsh glare',
    swatch: { bg: '#f2f1ec', fg: '#353532' },
  },
  {
    id: 'contrast',
    label: 'Sharp',
    hint: 'High contrast for low vision — soft black/white limits bloom',
    swatch: { bg: '#121212', fg: '#ececec' },
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
