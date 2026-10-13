import { shiftWeek, weekDays } from './plan'

describe('weekDays', () => {
  it('returns 7 consecutive ISO dates, crossing month ends', () => {
    expect(weekDays('2026-10-29')).toEqual([
      '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04',
    ])
  })
})

describe('shiftWeek', () => {
  it('moves the start by whole weeks', () => {
    expect(shiftWeek('2026-10-12', 7)).toBe('2026-10-19')
    expect(shiftWeek('2026-10-12', -7)).toBe('2026-10-05')
  })

  it('crosses month and year boundaries', () => {
    expect(shiftWeek('2026-10-29', 7)).toBe('2026-11-05')
    expect(shiftWeek('2026-11-02', -7)).toBe('2026-10-26')
    expect(shiftWeek('2026-12-29', 7)).toBe('2027-01-05')
  })

  it('returns the same day for a zero shift', () => {
    expect(shiftWeek('2026-10-12', 0)).toBe('2026-10-12')
  })
})
