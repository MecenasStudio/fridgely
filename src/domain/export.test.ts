import { describe, it, expect } from 'vitest'
import { EXPORT_VERSION, buildExport, exportFileName } from './export'
import type { FridgeItem, Recipe } from './types'

const NOW = new Date('2026-10-12T09:30:00.000Z')

const recipe: Recipe = {
  id: 'r1',
  title: 'Żurek z żółcią',
  ingredients: [{ name: 'żółć', quantity: 0.5, unit: 'l' }],
  steps: ['Zagotuj.', 'Podaj.'],
}
const fridge: FridgeItem[] = [
  { id: 'f1', name: 'Mleko 2%', quantity: 2, unit: 'l', expiresOn: '2026-10-20' },
]
const shoppingList = [{ name: 'chleb', quantity: 1, unit: 'szt', checked: false }]
const plan = [{ day: '2026-10-12', recipeId: 'r1' }]

const data = { recipes: [recipe], fridge, shoppingList, plan }

describe('buildExport', () => {
  it('writes the documented shape and version', () => {
    const parsed = JSON.parse(buildExport(data, NOW))

    expect(parsed).toEqual({
      version: EXPORT_VERSION,
      exportedAt: '2026-10-12T09:30:00.000Z',
      recipes: [recipe],
      fridge,
      shoppingList,
      plan,
    })
    expect(parsed.version).toBe(1)
  })

  it('keeps Polish characters intact', () => {
    const text = buildExport(data, NOW)
    expect(text).toContain('Żurek z żółcią')
    expect(text).toContain('żółć')
    expect(JSON.parse(text).recipes[0].title).toBe('Żurek z żółcią')
  })

  it('never contains account fields', () => {
    const text = buildExport(data, NOW)
    for (const forbidden of ['apiKey', 'anthropic', 'last4', 'email', 'user_id', 'userId', 'password', 'token']) {
      expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
  })

  it('stays valid and empty for an empty household', () => {
    const parsed = JSON.parse(buildExport({ recipes: [], fridge: [], shoppingList: [], plan: [] }, NOW))
    expect(parsed.recipes).toEqual([])
    expect(parsed.fridge).toEqual([])
    expect(parsed.shoppingList).toEqual([])
    expect(parsed.plan).toEqual([])
    expect(parsed.version).toBe(1)
  })

  it('does not mutate the input it was given', () => {
    const before = JSON.stringify(data)
    buildExport(data, NOW)
    expect(JSON.stringify(data)).toBe(before)
  })
})

describe('exportFileName', () => {
  it('names the file after the day', () => {
    expect(exportFileName(NOW)).toBe('fridgely-2026-10-12.json')
  })
})
