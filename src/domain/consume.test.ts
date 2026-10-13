import { consumePlan } from './consume'
import type { FridgeItem, Recipe } from './types'

const fridgeItem = (
  id: string,
  name: string,
  quantity: number,
  expiresOn: string | null,
  unit = 'szt',
): FridgeItem => ({ id, name, quantity, unit, expiresOn })

const recipeWith = (ingredients: Recipe['ingredients']): Recipe => ({
  id: 'r', title: 'r', steps: [], ingredients,
})

describe('consumePlan', () => {
  it('takes from the soonest expiry first (FEFO)', () => {
    const plan = consumePlan(
      recipeWith([{ name: 'mleko', quantity: 1, unit: 'l' }]),
      [
        fridgeItem('later', 'Mleko', 1, '2026-11-30', 'l'),
        fridgeItem('soon', 'mleko', 1, '2026-10-13', 'l'),
      ],
    )
    // The 2026-10-13 row drops to 0 and disappears; the later one is untouched.
    expect(plan.deletes).toEqual(['soon'])
    expect(plan.updates).toEqual([])
  })

  it('puts undated rows last', () => {
    const plan = consumePlan(
      recipeWith([{ name: 'mleko', quantity: 1, unit: 'l' }]),
      [fridgeItem('undated', 'mleko', 1, null, 'l'), fridgeItem('dated', 'mleko', 1, '2026-12-01', 'l')],
    )
    expect(plan.deletes).toEqual(['dated'])
    expect(plan.updates).toEqual([])
  })

  it('subtracts a partial amount and keeps the row', () => {
    const plan = consumePlan(
      recipeWith([{ name: 'mleko', quantity: 0.5, unit: 'l' }]),
      [fridgeItem('a', 'mleko', 2, '2026-10-13', 'l')],
    )
    expect(plan.updates).toEqual([{ id: 'a', newQuantity: 1.5 }])
    expect(plan.deletes).toEqual([])
  })

  it('never goes below zero and reports only what it uses', () => {
    const plan = consumePlan(
      recipeWith([{ name: 'mleko', quantity: 5, unit: 'l' }]),
      [fridgeItem('a', 'mleko', 1, '2026-10-13', 'l'), fridgeItem('b', 'mleko', 2, '2026-10-14', 'l')],
    )
    // 1 + 2 = 3 available for 5 needed: both rows go, and nothing else happens.
    expect(plan.deletes).toEqual(['a', 'b'])
    expect(plan.updates).toEqual([])
  })

  it('spreads over several rows in date order', () => {
    const plan = consumePlan(
      recipeWith([{ name: 'jajka', quantity: 8, unit: 'szt' }]),
      [
        fridgeItem('c', 'Jajka', 10, '2026-11-01'),
        fridgeItem('a', 'jajka', 3, '2026-10-13'),
        fridgeItem('b', 'jajka', 6, '2026-10-20'),
      ],
    )
    // 8 needed: the whole 2026-10-13 row (3), then 5 of the 2026-10-20 row. The last row
    // is not touched at all.
    expect(plan.deletes).toEqual(['a'])
    expect(plan.updates).toEqual([{ id: 'b', newQuantity: 1 }])
  })

  it('ignores another unit and ingredients the fridge does not have', () => {
    const plan = consumePlan(
      recipeWith([
        { name: 'mleko', quantity: 1, unit: 'szt' },
        { name: 'cukier', quantity: 100, unit: 'g' },
      ]),
      [fridgeItem('a', 'mleko', 1, '2026-10-13', 'l')],
    )
    expect(plan).toEqual({ updates: [], deletes: [] })
  })

  it('handles a recipe with no ingredients and an empty fridge', () => {
    expect(consumePlan(recipeWith([]), [fridgeItem('a', 'mleko', 1, null, 'l')])).toEqual({ updates: [], deletes: [] })
    expect(consumePlan(recipeWith([{ name: 'mleko', quantity: 1, unit: 'l' }]), [])).toEqual({ updates: [], deletes: [] })
  })

  it('does not report the same row twice when an ingredient is listed twice', () => {
    const plan = consumePlan(
      recipeWith([
        { name: 'mleko', quantity: 0.5, unit: 'l' },
        { name: 'Mleko ', quantity: 0.5, unit: 'l' },
      ]),
      [fridgeItem('a', 'mleko', 2, '2026-10-13', 'l')],
    )
    expect(plan.updates).toEqual([{ id: 'a', newQuantity: 1 }])
    expect(plan.deletes).toEqual([])
  })

  it('ignores a non-positive amount in the recipe', () => {
    const plan = consumePlan(
      recipeWith([{ name: 'mleko', quantity: 0, unit: 'l' }]),
      [fridgeItem('a', 'mleko', 1, '2026-10-13', 'l')],
    )
    expect(plan).toEqual({ updates: [], deletes: [] })
  })
})
