import { pickWeek } from './plan'
import type { FridgeItem, Recipe } from './types'

const recipe = (id: string, names: string[] = []): Recipe => ({
  id, title: id, steps: [],
  ingredients: names.map((name) => ({ name, quantity: 1, unit: 'szt' })),
})
const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

describe('pickWeek', () => {
  it('returns 7 nulls for empty recipes', () => {
    expect(pickWeek([], [], seeded(1))).toEqual(Array(7).fill(null))
  })

  it('is deterministic for a seeded rng', () => {
    const recipes = Array.from({ length: 10 }, (_, i) => recipe(`r${i}`))
    const a = pickWeek(recipes, [], seeded(42)).map((r) => r?.id)
    const b = pickWeek(recipes, [], seeded(42)).map((r) => r?.id)
    expect(a).toEqual(b)
  })

  it('has no repeats when at least 7 recipes exist', () => {
    const recipes = Array.from({ length: 9 }, (_, i) => recipe(`r${i}`))
    const ids = pickWeek(recipes, [], seeded(7)).map((r) => r!.id)
    expect(new Set(ids).size).toBe(7)
  })

  it('puts a recipe using the soonest-expiring item in the week', () => {
    const recipes = Array.from({ length: 12 }, (_, i) => recipe(`r${i}`, [`x${i}`]))
    const fridge: FridgeItem[] = [
      { id: '1', name: 'X11', quantity: 1, unit: 'szt', expiresOn: '2026-10-13' },
      { id: '2', name: 'x3', quantity: 1, unit: 'szt', expiresOn: '2026-11-30' },
    ]
    for (let s = 1; s <= 20; s++) {
      const ids = pickWeek(recipes, fridge, seeded(s)).map((r) => r!.id)
      expect(ids).toContain('r11')
    }
  })
})
