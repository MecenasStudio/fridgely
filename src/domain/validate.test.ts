import { describe, it, expect } from 'vitest'
import { validateItem } from './validate'

const input = (over: Partial<{ name: string; quantity: number; unit: string }> = {}) => ({
  name: 'Mleko',
  quantity: 1,
  unit: 'szt',
  ...over,
})

describe('validateItem', () => {
  it('accepts a normal product and normalizes the text', () => {
    const result = validateItem(input({ name: '  Mleko   2%  ', unit: ' l ' }))
    expect(result).toEqual({ ok: true, value: { name: 'Mleko 2%', quantity: 1, unit: 'l' } })
  })

  it('enforces the name length boundaries', () => {
    expect(validateItem(input({ name: '' }))).toEqual({ ok: false, error: 'name' })
    expect(validateItem(input({ name: '   ' }))).toEqual({ ok: false, error: 'name' })
    expect(validateItem(input({ name: 'a' })).ok).toBe(true)
    expect(validateItem(input({ name: 'a'.repeat(100) })).ok).toBe(true)
    expect(validateItem(input({ name: 'a'.repeat(101) }))).toEqual({ ok: false, error: 'name' })
  })

  it('enforces the unit length boundaries', () => {
    expect(validateItem(input({ unit: '' }))).toEqual({ ok: false, error: 'unit' })
    expect(validateItem(input({ unit: ' ' }))).toEqual({ ok: false, error: 'unit' })
    expect(validateItem(input({ unit: 'x'.repeat(20) })).ok).toBe(true)
    expect(validateItem(input({ unit: 'x'.repeat(21) }))).toEqual({ ok: false, error: 'unit' })
  })

  it('enforces the quantity boundaries', () => {
    expect(validateItem(input({ quantity: 0 }))).toEqual({ ok: false, error: 'quantity' })
    expect(validateItem(input({ quantity: -1 }))).toEqual({ ok: false, error: 'quantity' })
    expect(validateItem(input({ quantity: 1 })).ok).toBe(true)
    expect(validateItem(input({ quantity: 0.5 })).ok).toBe(true)
    expect(validateItem(input({ quantity: 100_000 })).ok).toBe(true)
    expect(validateItem(input({ quantity: 100_001 }))).toEqual({ ok: false, error: 'quantity' })
  })

  it('rejects values that are not usable numbers', () => {
    expect(validateItem(input({ quantity: Number.NaN }))).toEqual({ ok: false, error: 'quantity' })
    expect(validateItem(input({ quantity: Number.POSITIVE_INFINITY }))).toEqual({ ok: false, error: 'quantity' })
    expect(validateItem(input({ quantity: Number.NEGATIVE_INFINITY }))).toEqual({ ok: false, error: 'quantity' })
    // A string quantity is not a number, even when it looks like one.
    expect(validateItem(input({ quantity: '2' as unknown as number }))).toEqual({ ok: false, error: 'quantity' })
  })

  it('reports the first problem in field order', () => {
    expect(validateItem({ name: '', quantity: 0, unit: '' })).toEqual({ ok: false, error: 'name' })
    expect(validateItem({ name: 'Mleko', quantity: 0, unit: '' })).toEqual({ ok: false, error: 'unit' })
  })
})
