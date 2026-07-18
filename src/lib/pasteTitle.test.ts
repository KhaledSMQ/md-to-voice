import { describe, expect, it } from 'vitest'
import { titleFromPastedText } from './pasteTitle'

describe('titleFromPastedText', () => {
  it('uses the first few words', () => {
    expect(titleFromPastedText('Hello world from the clipboard today please')).toBe(
      'Hello world from the clipboard today',
    )
  })

  it('strips a leading heading marker', () => {
    expect(titleFromPastedText('## Sprint notes\n\nBody here')).toBe('Sprint notes')
  })

  it('falls back when empty', () => {
    expect(titleFromPastedText('   \n  ')).toBe('pasted.md')
  })

  it('ignores later lines', () => {
    expect(titleFromPastedText('One two three\nFour five six')).toBe('One two three')
  })
})
