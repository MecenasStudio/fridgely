import { buildShoppingList, purchasedToFridge } from './shopping'
import type { FridgeItem, Recipe } from './types'

const recipe = (id: string, ingredients: Recipe['ingredients']): Recipe => ({
  id, title: id, ingredients, steps: [],
})
const fridge = (name: string, quantity: number, unit: string): FridgeItem => ({
  id: name, name, quantity, unit, expiresOn: null,
})

describe('buildShoppingList', () => {
  it('sums same ingredient across recipes', () => {
    const list = buildShoppingList(
      [
        recipe('a', [{ name: 'Mleko', quantity: 1, unit: 'l' }]),
        recipe('b', [{ name: 'mleko ', quantity: 0.5, unit: 'l' }]),
      ],
      [],
    )
    expect(list).toEqual([{ name: 'mleko', quantity: 1.5, unit: 'l' }])
  })

  it('subtracts fridge by normalized name and unit', () => {
    const list = buildShoppingList(
      [recipe('a', [{ name: 'Mleko', quantity: 1, unit: 'l' }, { name: 'Jajka', quantity: 6, unit: 'szt' }])],
      [fridge(' mleko', 0.4, 'l'), fridge('jajka', 6, 'szt')],
    )
    expect(list).toEqual([{ name: 'mleko', quantity: 0.6, unit: 'l' }])
  })

  it('does not merge different units', () => {
    const list = buildShoppingList(
      [recipe('a', [{ name: 'mąka', quantity: 200, unit: 'g' }, { name: 'mąka', quantity: 1, unit: 'szklanka' }])],
      [],
    )
    expect(list).toHaveLength(2)
  })

  it('returns empty list for no recipes', () => {
    expect(buildShoppingList([], [])).toEqual([])
  })
})

describe('purchasedToFridge', () => {
  it('takes only the checked rows, in order, with no expiry date', () => {
    const rows = purchasedToFridge([
      { name: 'Mleko ', quantity: 2, unit: 'l', checked: true },
      { name: 'Chleb', quantity: 1, unit: 'szt', checked: false },
      { name: 'Jajka', quantity: 6, unit: 'szt', checked: true },
    ])
    expect(rows).toEqual([
      { name: 'mleko', quantity: 2, unit: 'l', expiresOn: null },
      { name: 'jajka', quantity: 6, unit: 'szt', expiresOn: null },
    ])
  })

  it('returns an empty list when nothing is checked', () => {
    expect(purchasedToFridge([{ name: 'Chleb', quantity: 1, unit: 'szt', checked: false }])).toEqual([])
    expect(purchasedToFridge([])).toEqual([])
  })
})
