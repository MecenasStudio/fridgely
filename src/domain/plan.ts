import { normalizeName, sortByExpiry } from './fridge'
import type { FridgeItem, Ingredient, Recipe } from './types'

const DAYS = 7
const round = (n: number) => Math.round(n * 1000) / 1000
const key = (name: string, unit: string) => `${normalizeName(name)}|${unit}`

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function weekDays(start: string): string[] {
  const [y, m, d] = start.split('-').map(Number)
  return Array.from({ length: DAYS }, (_, i) =>
    new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10),
  )
}

/** Moves an ISO date by `days` (normally ±7), crossing month and year ends. */
export function shiftWeek(start: string, days: number): string {
  const [y, m, d] = start.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

// Recipes using the soonest-expiring fridge items come first, the rest is shuffled.
export function pickWeek(
  recipes: Recipe[],
  fridge: FridgeItem[],
  rng: () => number,
): (Recipe | null)[] {
  if (recipes.length === 0) return Array(DAYS).fill(null)

  const urgent = sortByExpiry(fridge)
    .filter((f) => f.expiresOn !== null)
    .map((f) => normalizeName(f.name))
  const rank = (r: Recipe) => {
    const names = new Set(r.ingredients.map((i) => normalizeName(i.name)))
    const idx = urgent.findIndex((n) => names.has(n))
    return idx === -1 ? Infinity : idx
  }

  const shuffled = shuffle(recipes, rng)
  const pool = [...shuffled].sort((a, b) => rank(a) - rank(b))
  const week: Recipe[] = pool.slice(0, DAYS)
  while (week.length < DAYS) week.push(shuffled[week.length % shuffled.length])
  return shuffle(week, rng)
}

/**
 * Ingredients of `recipe` that the fridge cannot fully cover, with the missing amount.
 *
 * Matching is the same as in `buildShoppingList`: normalized name plus unit. A fridge row
 * with another unit does not count at all, and duplicate rows of the same product add up.
 */
export function missingFor(recipe: Recipe, fridge: FridgeItem[]): Ingredient[] {
  const available = new Map<string, number>()
  for (const item of fridge) {
    const k = key(item.name, item.unit)
    available.set(k, (available.get(k) ?? 0) + Number(item.quantity))
  }

  return recipe.ingredients
    .map((ingredient) => ({
      ...ingredient,
      quantity: round(ingredient.quantity - (available.get(key(ingredient.name, ingredient.unit)) ?? 0)),
    }))
    .filter((ingredient) => ingredient.quantity > 0)
}
