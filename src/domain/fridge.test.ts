import { sortByExpiry, expiryStatus, normalizeName, findMergeTarget } from './fridge'
import type { FridgeItem } from './types'

const item = (id: string, expiresOn: string | null, name = id, unit = 'szt'): FridgeItem => ({
  id, name, quantity: 1, unit, expiresOn,
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

describe('findMergeTarget', () => {
  it('matches the same name regardless of case and extra spaces', () => {
    const items = [item('a', '2026-10-20', 'Mleko  2%', 'l')]
    expect(findMergeTarget(items, { name: '  mleko 2% ', unit: 'l', expiresOn: '2026-10-20' })?.id).toBe('a')
  })

  it('treats null as its own date and never merges it with a real one', () => {
    const items = [item('a', null, 'Mleko', 'l')]
    expect(findMergeTarget(items, { name: 'Mleko', unit: 'l', expiresOn: null })?.id).toBe('a')
    expect(findMergeTarget(items, { name: 'Mleko', unit: 'l', expiresOn: '2026-10-20' })).toBeNull()

    const dated = [item('b', '2026-10-20', 'Mleko', 'l')]
    expect(findMergeTarget(dated, { name: 'Mleko', unit: 'l', expiresOn: null })).toBeNull()
  })

  it('does not merge a different unit or a different date', () => {
    const items = [item('a', '2026-10-20', 'Mleko', 'l'), item('b', '2026-10-20', 'Mleko', 'szt')]
    expect(findMergeTarget(items, { name: 'Mleko', unit: 'ml', expiresOn: '2026-10-20' })).toBeNull()
    expect(findMergeTarget(items, { name: 'Mleko', unit: 'l', expiresOn: '2026-10-21' })).toBeNull()
    expect(findMergeTarget(items, { name: 'Mleko', unit: 'szt', expiresOn: '2026-10-20' })?.id).toBe('b')
  })

  it('returns null for an empty fridge', () => {
    expect(findMergeTarget([], { name: 'Mleko', unit: 'l', expiresOn: null })).toBeNull()
  })
})
