import { normalizeName, sortByExpiry } from './fridge'
import type { FridgeItem, Recipe } from './types'

const DAYS = 7

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
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
