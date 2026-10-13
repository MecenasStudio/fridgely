// Exporting everything the household has, as one JSON file.
//
// This is the user's own data, so it is deliberately a plain dump of the four shared tables
// and nothing else. It must never contain anything that belongs to the account rather than to
// the household: no Anthropic key, no key tail, no e-mail, no user ids. The test checks the
// serialized text for exactly those words.

import type { FridgeItem, Ingredient, Recipe } from './types'

export const EXPORT_VERSION = 1

export type ShoppingRow = { name: string; quantity: number; unit: string; checked: boolean }
export type ExportData = {
  version: number
  exportedAt: string
  recipes: Recipe[]
  fridge: FridgeItem[]
  shoppingList: ShoppingRow[]
  plan: { day: string; recipeId: string | null }[]
}

/** A plan entry is a day plus the id of the planned recipe; `null` means an empty day. */
export type PlanRow = { day: string; recipeId: string | null }

/**
 * Builds the export document. Pure and deterministic apart from the timestamp, which makes
 * it easy to test and impossible to leak something by accident.
 */
export function buildExport(
  data: { recipes: Recipe[]; fridge: FridgeItem[]; shoppingList: ShoppingRow[]; plan: PlanRow[] },
  now: Date = new Date(),
): string {
  const document: ExportData = {
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    recipes: data.recipes,
    fridge: data.fridge,
    shoppingList: data.shoppingList,
    plan: data.plan,
  }
  return JSON.stringify(document, null, 2)
}

/** Suggested file name: `fridgely-YYYY-MM-DD.json`. */
export function exportFileName(now: Date = new Date()): string {
  return `fridgely-${now.toISOString().slice(0, 10)}.json`
}

/** Convenience for callers that hold ingredients from other shapes. */
export type ExportIngredient = Ingredient
