import { normalizeName } from './fridge'
import type { FridgeItem, Ingredient, Recipe } from './types'

const key = (name: string, unit: string) => `${normalizeName(name)}|${unit}`
const round = (n: number) => Math.round(n * 1000) / 1000

export function buildShoppingList(recipes: Recipe[], fridge: FridgeItem[]): Ingredient[] {
  const needed = new Map<string, Ingredient>()
  for (const ing of recipes.flatMap((r) => r.ingredients)) {
    const k = key(ing.name, ing.unit)
    const cur = needed.get(k)
    if (cur) cur.quantity += ing.quantity
    else needed.set(k, { name: normalizeName(ing.name), quantity: ing.quantity, unit: ing.unit })
  }
  for (const f of fridge) {
    const cur = needed.get(key(f.name, f.unit))
    if (cur) cur.quantity -= f.quantity
  }
  return [...needed.values()]
    .map((i) => ({ ...i, quantity: round(i.quantity) }))
    .filter((i) => i.quantity > 0)
}
