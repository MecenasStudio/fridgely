// Subtracting a cooked recipe from the fridge.
//
// The rules come from the brief: match by normalized name and unit, use the rows closest
// to their expiry date first (undated last), never go below zero, and leave ingredients
// the fridge cannot cover alone.

import { normalizeName } from './fridge'
import type { FridgeItem, Recipe } from './types'

export type ConsumeResult = {
  /** Rows whose quantity changes; the value is the new (possibly unchanged) amount. */
  updates: { id: string; newQuantity: number }[]
  /** Rows that end up empty and should be deleted. */
  deletes: string[]
}

const round = (n: number) => Math.round(n * 1000) / 1000

function expiresFirst(a: FridgeItem, b: FridgeItem): number {
  if (a.expiresOn === b.expiresOn) return 0
  if (a.expiresOn === null) return 1
  if (b.expiresOn === null) return -1
  return a.expiresOn < b.expiresOn ? -1 : 1
}

/**
 * Works out what a cooked recipe takes out of the fridge, without changing anything.
 *
 * The same row is never reported twice: a recipe that names an ingredient in two lines
 * consumes from one running total, so the second line continues where the first stopped.
 */
export function consumePlan(recipe: Recipe, fridge: FridgeItem[]): ConsumeResult {
  const remaining = new Map(fridge.map((item) => [item.id, Number(item.quantity)]))
  const order = [...fridge].sort(expiresFirst)

  for (const ingredient of recipe.ingredients) {
    let left = Number(ingredient.quantity)
    if (!Number.isFinite(left) || left <= 0) continue

    const candidates = order.filter(
      (item) =>
        normalizeName(item.name) === normalizeName(ingredient.name) &&
        item.unit === ingredient.unit &&
        (remaining.get(item.id) ?? 0) > 0,
    )

    for (const item of candidates) {
      if (left <= 0) break
      const available = remaining.get(item.id) ?? 0
      const taken = Math.min(available, left)
      remaining.set(item.id, round(available - taken))
      left = round(left - taken)
    }
  }

  const updates: ConsumeResult['updates'] = []
  const deletes: string[] = []
  for (const item of fridge) {
    const after = remaining.get(item.id) ?? Number(item.quantity)
    if (after === Number(item.quantity)) continue
    if (after <= 0) deletes.push(item.id)
    else updates.push({ id: item.id, newQuantity: after })
  }

  return { updates, deletes }
}
