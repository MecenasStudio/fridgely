import { formatIngredient, parseIngredient } from './recipe'
import type { Ingredient } from './types'

describe('parseIngredient', () => {
  it('parses "qty unit name"', () => {
    expect(parseIngredient('2 szt Jajka')).toEqual({ name: 'Jajka', quantity: 2, unit: 'szt' })
    expect(parseIngredient('0.5 l mleko 2%')).toEqual({ name: 'mleko 2%', quantity: 0.5, unit: 'l' })
  })
  it('accepts decimal comma', () => {
    expect(parseIngredient('1,5 kg mąka')).toEqual({ name: 'mąka', quantity: 1.5, unit: 'kg' })
  })
  it('defaults to 1 szt when only a name is given', () => {
    expect(parseIngredient('  masło ')).toEqual({ name: 'masło', quantity: 1, unit: 'szt' })
  })
  it('returns null for blank lines', () => {
    expect(parseIngredient('   ')).toBeNull()
  })
})

describe('formatIngredient', () => {
  it('writes whole and fractional amounts', () => {
    expect(formatIngredient({ name: 'Jajka', quantity: 2, unit: 'szt' })).toBe('2 Jajka')
    expect(formatIngredient({ name: 'mleko 2%', quantity: 0.5, unit: 'l' })).toBe('0.5 l mleko 2%')
    expect(formatIngredient({ name: 'mąka', quantity: 1.5, unit: 'kg' })).toBe('1.5 kg mąka')
  })

  it('round-trips through parseIngredient', () => {
    const ingredients: Ingredient[] = [
      { name: 'Jajka', quantity: 2, unit: 'szt' },
      { name: 'mleko 2%', quantity: 0.5, unit: 'l' },
      { name: 'mąka', quantity: 1.5, unit: 'kg' },
      { name: 'masło', quantity: 1, unit: 'szt' },
      { name: 'cukier', quantity: 250, unit: 'g' },
    ]
    for (const ingredient of ingredients) {
      expect(parseIngredient(formatIngredient(ingredient))).toEqual(ingredient)
    }
  })
})
