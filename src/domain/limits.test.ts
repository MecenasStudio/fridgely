import { describe, it, expect } from 'vitest'
import { MAX_NAME_LENGTH, MAX_PHOTO_ITEMS, MAX_QUANTITY, MAX_UNIT_LENGTH, SOON_DAYS } from './limits'
import { expiryStatus } from './fridge'
import { validateItem } from './validate'
import type { FridgeItem } from './types'

// Changing a value has to be a conscious decision, so the numbers are pinned here.
describe('limits', () => {
  it('keeps the documented values', () => {
    expect(MAX_NAME_LENGTH).toBe(100)
    expect(MAX_UNIT_LENGTH).toBe(20)
    expect(MAX_QUANTITY).toBe(100000)
    expect(MAX_PHOTO_ITEMS).toBe(50)
    expect(SOON_DAYS).toBe(3)
  })
})

describe('limits are the ones the rest of the app uses', () => {
  const item = (expiresOn: string | null): FridgeItem => ({
    id: 'a', name: 'mleko', quantity: 1, unit: 'szt', expiresOn,
  })

  it('expiryStatus still calls three days soon and four days ok', () => {
    const today = '2026-10-12'
    expect(expiryStatus(item('2026-10-15'), today)).toBe('soon')
    expect(expiryStatus(item('2026-10-16'), today)).toBe('ok')
    // … and the boundary is the exported constant, not a literal.
    const inThree = new Date(Date.parse(`${today}T00:00:00Z`) + SOON_DAYS * 86_400_000).toISOString().slice(0, 10)
    expect(expiryStatus(item(inThree), today)).toBe('soon')
  })

  it('validateItem enforces the same numbers', () => {
    const base = { quantity: 1, unit: 'szt' }
    expect(validateItem({ ...base, name: 'a'.repeat(MAX_NAME_LENGTH) }).ok).toBe(true)
    expect(validateItem({ ...base, name: 'a'.repeat(MAX_NAME_LENGTH + 1) }).ok).toBe(false)

    expect(validateItem({ name: 'mleko', quantity: 1, unit: 'x'.repeat(MAX_UNIT_LENGTH) }).ok).toBe(true)
    expect(validateItem({ name: 'mleko', quantity: 1, unit: 'x'.repeat(MAX_UNIT_LENGTH + 1) }).ok).toBe(false)

    expect(validateItem({ ...base, name: 'mleko', quantity: MAX_QUANTITY }).ok).toBe(true)
    expect(validateItem({ ...base, name: 'mleko', quantity: MAX_QUANTITY + 1 }).ok).toBe(false)
  })
})
