import { weekDays } from './plan'

describe('weekDays', () => {
  it('returns 7 consecutive ISO dates, crossing month ends', () => {
    expect(weekDays('2026-10-29')).toEqual([
      '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04',
    ])
  })
})
