import { describe, expect, it } from 'vitest'
import {
  BRIGHTNESS_DEFAULT,
  adjustPaperInk,
  clampBrightness,
  contrastRatio,
  relativeLuminance,
} from './readingBrightness'

describe('readingBrightness', () => {
  it('clamps brightness to 0–100', () => {
    expect(clampBrightness(-10)).toBe(0)
    expect(clampBrightness(140)).toBe(100)
    expect(clampBrightness(50.4)).toBe(50)
  })

  it('keeps authored colors near the comfort default', () => {
    const night = adjustPaperInk('night', BRIGHTNESS_DEFAULT)
    expect(night.bg.toLowerCase()).toBe('#1a1612')
    expect(night.fg.toLowerCase()).toBe('#d6cdb8')
    expect(night.contrast).toBeGreaterThan(4.5)
  })

  it('dimming a light theme lowers paper luminance', () => {
    const comfort = adjustPaperInk('sepia', 50)
    const dim = adjustPaperInk('sepia', 10)
    expect(relativeLuminance(dim.bg)).toBeLessThan(relativeLuminance(comfort.bg))
    expect(dim.contrast).toBeGreaterThan(4.5)
  })

  it('brightening a dark theme raises paper luminance', () => {
    const comfort = adjustPaperInk('night', 50)
    const bright = adjustPaperInk('night', 90)
    expect(relativeLuminance(bright.bg)).toBeGreaterThan(relativeLuminance(comfort.bg))
    expect(bright.contrast).toBeGreaterThan(4.5)
  })

  it('reports WCAG contrast for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })
})
