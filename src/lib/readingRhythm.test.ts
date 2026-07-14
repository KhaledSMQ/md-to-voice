import { describe, expect, it } from 'vitest'
import {
  resolveReadingLeading,
  resolveReadingParagraph,
  resolveReadingTracking,
} from './readingRhythm'

describe('readingRhythm', () => {
  it('auto leading/tracking defer to the face defaults', () => {
    expect(resolveReadingLeading('auto', '1.78')).toBe('1.78')
    expect(resolveReadingTracking('auto', '0.004em')).toBe('0.004em')
  })

  it('explicit leading presets use unitless values', () => {
    expect(resolveReadingLeading('comfort', '1.78')).toBe('1.5')
    expect(resolveReadingLeading('airy', '1.78')).toBe('2')
  })

  it('loose tracking matches WCAG 1.4.12 target', () => {
    expect(resolveReadingTracking('loose', '0.004em')).toBe('0.12em')
  })

  it('paragraph airy is ~2× font size', () => {
    expect(resolveReadingParagraph('airy')).toBe('2em')
    expect(resolveReadingParagraph('comfort')).toBe('0.95em')
  })
})
