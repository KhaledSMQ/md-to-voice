/**
 * Page-light (brightness) for the reading surface.
 *
 * Science notes:
 * - Adjust relative luminance of paper + ink together (not a flat CSS filter),
 *   so hue stays while glare / OLED bloom change.
 * - Keep Weber-style contrast in a comfortable band (~5–12:1) instead of
 *   crushing ink when the page goes bright or dim.
 * - Light themes: dimming lowers paper L (less glare). Dark themes: dimming
 *   deepens the well; brightening raises charcoal to ease pupil strain.
 */

import type { ReadingPresetId } from './readingPresets'

export const BRIGHTNESS_MIN = 0
export const BRIGHTNESS_MAX = 100
export const BRIGHTNESS_DEFAULT = 50
export const BRIGHTNESS_STEP = 5

/** Named anchors on the control. */
export const BRIGHTNESS_ANCHORS = [
  { id: 'dim', label: 'Dim', value: 18, hint: 'Lower glare / deeper dark' },
  { id: 'comfort', label: 'Comfort', value: 50, hint: 'Preset balance' },
  { id: 'bright', label: 'Bright', value: 82, hint: 'Higher ambient / elevated dark' },
] as const

export type SurfacePolarity = 'light' | 'dark'

export const PRESET_POLARITY: Record<ReadingPresetId, SurfacePolarity> = {
  night: 'dark',
  sepia: 'light',
  day: 'light',
  contrast: 'dark',
}

/** Authored paper/ink pairs (match CSS presets). */
export const PRESET_PAPER_INK: Record<ReadingPresetId, { bg: string; fg: string }> = {
  night: { bg: '#1a1612', fg: '#d6cdb8' },
  sepia: { bg: '#f5edd9', fg: '#4a3f35' },
  day: { bg: '#f2f1ec', fg: '#353532' },
  contrast: { bg: '#121212', fg: '#ececec' },
}

export function clampBrightness(n: number): number {
  return Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, Math.round(n)))
}

export function isBrightnessValue(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

type Rgb = { r: number; g: number; b: number }

function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = Number.parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgbToHex({ r, g, b }: Rgb): string {
  const c = (n: number) => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

function srgbToLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

/** WCAG contrast ratio (≥1). */
export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a)
  const l2 = relativeLuminance(b)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const u = Math.min(1, Math.max(0, t))
  return {
    r: a.r + (b.r - a.r) * u,
    g: a.g + (b.g - a.g) * u,
    b: a.b + (b.b - a.b) * u,
  }
}

function mixHex(a: string, b: string, t: number): string {
  return rgbToHex(mixRgb(hexToRgb(a), hexToRgb(b), t))
}

export type AdjustedPaperInk = {
  bg: string
  fg: string
  /** Live contrast after adjustment. */
  contrast: number
  polarity: SurfacePolarity
}

/**
 * Map slider 0–100 → paper/ink, preserving hue via mixes toward
 * science-motivated targets (glare cut vs elevated dark).
 */
export function adjustPaperInk(
  preset: ReadingPresetId,
  brightness: number,
): AdjustedPaperInk {
  const polarity = PRESET_POLARITY[preset]
  const base = PRESET_PAPER_INK[preset]
  const b = clampBrightness(brightness)
  const t = (b - BRIGHTNESS_DEFAULT) / 50 // −1 … +1

  let bg: string
  let fg: string

  if (polarity === 'light') {
    // Dim → warmer charcoal paper (cut glare). Bright → nearer white.
    if (t >= 0) {
      bg = mixHex(base.bg, '#ffffff', t * 0.62)
      fg = mixHex(base.fg, '#1c1b18', t * 0.4)
    } else {
      const u = -t
      bg = mixHex(base.bg, '#2c261e', u * 0.5)
      fg = mixHex(base.fg, '#6a5f52', u * 0.28)
    }
  } else {
    // Dim → deeper well. Bright → elevated charcoal (less OLED bloom strain).
    if (t >= 0) {
      bg = mixHex(base.bg, '#3a342c', t * 0.55)
      fg = mixHex(base.fg, '#f2ebe0', t * 0.22)
    } else {
      const u = -t
      bg = mixHex(base.bg, '#050504', u * 0.7)
      fg = mixHex(base.fg, '#a89f90', u * 0.35)
    }
  }

  // Soft floor: if contrast collapses, nudge ink away from paper.
  let contrast = contrastRatio(bg, fg)
  if (contrast < 4.5) {
    fg = polarity === 'light' ? mixHex(fg, '#111110', 0.45) : mixHex(fg, '#f5f5f0', 0.45)
    contrast = contrastRatio(bg, fg)
  }

  return { bg, fg, contrast, polarity }
}

/** CSS custom properties for the live surface (empty at comfort = CSS presets win). */
export function readingBrightnessCssVars(
  preset: ReadingPresetId,
  brightness: number,
): Record<string, string> {
  if (clampBrightness(brightness) === BRIGHTNESS_DEFAULT) {
    return {}
  }
  const { bg, fg } = adjustPaperInk(preset, brightness)
  const heading = mixHex(fg, bg, 0.12)
  const muted = mixHex(fg, bg, 0.38)
  return {
    '--reader-bg': bg,
    '--reader-fg': fg,
    '--reader-heading': heading,
    '--reader-muted': muted,
    '--reader-quote-fg': muted,
  }
}

export function brightnessLabel(brightness: number): string {
  const b = clampBrightness(brightness)
  if (b <= 30) return 'Dim'
  if (b >= 70) return 'Bright'
  return 'Comfort'
}
