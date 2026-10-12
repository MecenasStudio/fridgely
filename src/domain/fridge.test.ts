import { sortByExpiry, expiryStatus, normalizeName } from './fridge'
import type { FridgeItem } from './types'

const item = (id: string, expiresOn: string | null, name = id): FridgeItem => ({
  id, name, quantity: 1, unit: 'szt', expiresOn,
})

describe('normalizeName', () => {
  it('trims, lowercases and collapses spaces', () => {
    expect(normalizeName('  Mleko   2% ')).toBe('mleko 2%')
  })
})

describe('sortByExpiry', () => {
  it('puts earliest first and null last without mutating', () => {
    const input = [item('c', null), item('b', '2026-10-20'), item('a', '2026-10-01')]
    const out = sortByExpiry(input)
    expect(out.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(input.map((i) => i.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('expiryStatus', () => {
  const today = '2026-10-12'
  it('classifies items', () => {
    expect(expiryStatus(item('a', '2026-10-11'), today)).toBe('expired')
    expect(expiryStatus(item('a', '2026-10-12'), today)).toBe('soon')
    expect(expiryStatus(item('a', '2026-10-15'), today)).toBe('soon')
    expect(expiryStatus(item('a', '2026-10-16'), today)).toBe('ok')
    expect(expiryStatus(item('a', null), today)).toBe('unknown')
  })
})
