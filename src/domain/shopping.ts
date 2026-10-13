import { normalizeName } from './fridge'
import type { FridgeItem, Ingredient, Recipe } from './types'

/** A fridge row as produced by shopping: no id yet, no expiry date. */
export type NewFridgeRow = Omit<FridgeItem, 'id'> & { expiresOn: null }

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

export type PurchasedItem = { name: string; quantity: number; unit: string; checked: boolean }

/**
 * Turns the checked-off shopping rows into fridge rows. The order is preserved and the
 * name is normalized, so "Mleko " lands in the fridge as "mleko". Purchases never carry
 * an expiry date: Open Food Facts has none, so the fridge asks the user for it.
 */
export function purchasedToFridge(items: PurchasedItem[]): NewFridgeRow[] {
  return items
    .filter((i) => i.checked)
    .map((i) => ({ name: normalizeName(i.name), quantity: i.quantity, unit: i.unit, expiresOn: null }))
}
