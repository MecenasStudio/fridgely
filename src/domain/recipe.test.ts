import { parseIngredient } from './recipe'

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
