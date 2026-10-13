import { describe, it, expect } from 'vitest'
import { formatDate } from './format'

describe('formatDate', () => {
  it('formats in Polish', () => {
    // The exact spacing depends on the ICU version, so the parts are checked.
    const polish = formatDate('2026-10-03', 'pl')
    expect(polish).toContain('2026')
    expect(polish).toContain('paź')
    expect(polish.startsWith('3')).toBe(true)
  })

  it('formats in English', () => {
    expect(formatDate('2026-10-03', 'en')).toBe('Oct 3, 2026')
    expect(formatDate('2026-01-31', 'en')).toBe('Jan 31, 2026')
  })

  it('keeps the day stable across year boundaries and UTC', () => {
    expect(formatDate('2026-12-31', 'en')).toBe('Dec 31, 2026')
    expect(formatDate('2027-01-01', 'en')).toBe('Jan 1, 2027')
    // A date at the very start of the day must not fall back to the previous one.
    expect(formatDate('2026-03-01', 'en')).toBe('Mar 1, 2026')
  })

  it('returns broken input unchanged instead of "Invalid Date"', () => {
    expect(formatDate('', 'en')).toBe('')
    expect(formatDate('2026-1-1', 'en')).toBe('2026-1-1')
    expect(formatDate('2026-02-31', 'en')).toBe('2026-02-31')
    expect(formatDate('not a date', 'en')).toBe('not a date')
    expect(formatDate('2026-13-01', 'en')).toBe('2026-13-01')
  })
})
