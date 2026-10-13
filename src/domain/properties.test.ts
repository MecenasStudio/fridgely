// Property tests for the pure domain logic: instead of hand-picked examples, 500 random
// cases are generated per property and the invariants must hold for every one of them.
//
// There is no property-testing library here on purpose (no new dependencies), so the tests
// are plain loops over a seeded generator. The seed is fixed, which keeps failures
// reproducible: a counterexample is always the same one.

import { buildShoppingList, purchasedToFridge } from './shopping'
import { consumePlan } from './consume'
import { findMergeTarget, normalizeName } from './fridge'
import { pickWeek, shiftWeek, weekDays } from './plan'
import { validateItem } from './validate'
import type { FridgeItem, Ingredient, Recipe } from './types'

const RUNS = 500

/** The seeded generator used by `plan.test.ts`, so failures are reproducible. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

const NAMES = ['mleko', 'Mleko ', ' mleko', 'jajka', 'Jajka', 'masło', 'chleb', 'żółć', 'zolc']
const UNITS = ['szt', 'l', 'kg', 'g', 'opak']
const DATES = [null, '2026-10-01', '2026-10-15', '2026-11-30', '2027-01-01']

function makeGenerator(seed: number) {
  const rng = seeded(seed)
  const pick = <T,>(list: T[]): T => list[Math.floor(rng() * list.length)]
  const quantity = () => Math.round((rng() * 9 + 0.1) * 1000) / 1000

  const ingredient = (): Ingredient => ({ name: pick(NAMES), quantity: quantity(), unit: pick(UNITS) })

  const recipe = (id: string): Recipe => ({
    id,
    title: `recipe ${id}`,
    steps: [],
    ingredients: Array.from({ length: Math.floor(rng() * 4) }, ingredient),
  })

  const fridgeItem = (id: string): FridgeItem => ({
    id,
    name: pick(NAMES),
    quantity: quantity(),
    unit: pick(UNITS),
    expiresOn: pick(DATES),
  })

  return {
    rng,
    pick,
    quantity,
    ingredient,
    recipe,
    fridgeItem,
    recipes: () => Array.from({ length: Math.floor(rng() * 5) }, (_, i) => recipe(`r${i}`)),
    fridge: () => Array.from({ length: Math.floor(rng() * 5) }, (_, i) => fridgeItem(`f${i}`)),
  }
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function describeCase(seed: number, index: number, extra: unknown): string {
  return `seed ${seed}, run ${index}: ${JSON.stringify(extra)}`
}

describe('buildShoppingList properties', () => {
  it('never returns a quantity at or below zero', () => {
    for (let run = 0; run < RUNS; run += 1) {
      const g = makeGenerator(run + 1)
      const list = buildShoppingList(g.recipes(), g.fridge())
      for (const item of list) {
        if (!(item.quantity > 0)) throw new Error(describeCase(run + 1, run, { list, item }))
      }
    }
  })

  it('does not depend on the order of the recipes or the fridge', () => {
    for (let run = 0; run < RUNS; run += 1) {
      const g = makeGenerator(run + 1000)
      const recipes = g.recipes()
      const fridge = g.fridge()
      const base = buildShoppingList(recipes, fridge)
      const shuffled = buildShoppingList(shuffle(recipes, g.rng), shuffle(fridge, g.rng))

      const sort = (list: Ingredient[]) =>
        [...list].sort((a, b) =>
          `${normalizeName(a.name)}|${a.unit}|${a.quantity}`.localeCompare(`${normalizeName(b.name)}|${b.unit}|${b.quantity}`),
        )
      const a = JSON.stringify(sort(base))
      const b = JSON.stringify(sort(shuffled))
      if (a !== b) throw new Error(describeCase(run + 1000, run, { base, shuffled }))
    }
  })

  it('never grows when a product is added to the fridge', () => {
    for (let run = 0; run < RUNS; run += 1) {
      const g = makeGenerator(run + 2000)
      const recipes = g.recipes()
      const fridge = g.fridge()
      const before = buildShoppingList(recipes, fridge)
      const after = buildShoppingList(recipes, [...fridge, g.fridgeItem('extra')])

      // Same ingredient, more stock at home: the list can only shrink or stay the same.
      const total = (list: Ingredient[]) => list.reduce((sum, i) => sum + i.quantity, 0)
      if (total(after) > total(before) + 1e-9) {
        throw new Error(describeCase(run + 2000, run, { before, after }))
      }
    }
  })
})

describe('consumePlan properties', () => {
  it('never goes below zero, never takes more than asked and never touches other rows', () => {
    for (let run = 0; run < RUNS; run += 1) {
      const g = makeGenerator(run + 3000)
      const recipe = g.recipe('r')
      const fridge = g.fridge()
      const plan = consumePlan(recipe, fridge)

      // A row is reported at most once.
      const ids = [...plan.updates.map((u) => u.id), ...plan.deletes]
      if (new Set(ids).size !== ids.length) throw new Error(describeCase(run + 3000, run, plan))

      for (const update of plan.updates) {
        if (!(update.newQuantity > 0)) throw new Error(describeCase(run + 3000, run, update))
        const original = fridge.find((f) => f.id === update.id)
        if (!original) throw new Error(describeCase(run + 3000, run, { update, fridge }))
        // Only rows that match an ingredient by name and unit can be touched.
        const touched = recipe.ingredients.some(
          (i) => normalizeName(i.name) === normalizeName(original.name) && i.unit === original.unit,
        )
        if (!touched) throw new Error(describeCase(run + 3000, run, { update, original }))
      }
      for (const id of plan.deletes) {
        const original = fridge.find((f) => f.id === id)
        if (!original) throw new Error(describeCase(run + 3000, run, { id, fridge }))
        const touched = recipe.ingredients.some(
          (i) => normalizeName(i.name) === normalizeName(original.name) && i.unit === original.unit,
        )
        if (!touched) throw new Error(describeCase(run + 3000, run, { id, original }))
      }
    }
  })

  it('never subtracts more than the recipe asks for', () => {
    for (let run = 0; run < RUNS; run += 1) {
      const g = makeGenerator(run + 4000)
      const recipe = g.recipe('r')
      const fridge = g.fridge()
      const plan = consumePlan(recipe, fridge)

      const taken = new Map<string, number>()
      for (const update of plan.updates) {
        const original = fridge.find((f) => f.id === update.id)!
        taken.set(`${normalizeName(original.name)}|${original.unit}`, (taken.get(`${normalizeName(original.name)}|${original.unit}`) ?? 0) + (original.quantity - update.newQuantity))
      }
      for (const id of plan.deletes) {
        const original = fridge.find((f) => f.id === id)!
        const key = `${normalizeName(original.name)}|${original.unit}`
        taken.set(key, (taken.get(key) ?? 0) + original.quantity)
      }

      for (const [key, amount] of taken) {
        const required = recipe.ingredients
          .filter((i) => `${normalizeName(i.name)}|${i.unit}` === key)
          .reduce((sum, i) => sum + i.quantity, 0)
        if (amount > required + 1e-6) throw new Error(describeCase(run + 4000, run, { key, amount, required, plan }))
      }
    }
  })
})

describe('findMergeTarget properties', () => {
  it('is symmetric with respect to case and extra spaces', () => {
    for (let run = 0; run < RUNS; run += 1) {
      const g = makeGenerator(run + 5000)
      const item = g.fridgeItem('a')
      const candidate = {
        name: `  ${item.name.toUpperCase()}  `,
        unit: item.unit,
        expiresOn: item.expiresOn,
      }
      const found = findMergeTarget([item], candidate)
      if (found?.id !== item.id) throw new Error(describeCase(run + 5000, run, { item, candidate, found }))

      // … and a different unit or date must not match.
      if (findMergeTarget([item], { ...candidate, unit: `${item.unit}x` }) !== null) {
        throw new Error(describeCase(run + 5000, run, { item, candidate }))
      }
      const otherDate = item.expiresOn === null ? '2026-10-01' : null
      if (findMergeTarget([item], { ...candidate, expiresOn: otherDate }) !== null) {
        throw new Error(describeCase(run + 5000, run, { item, candidate }))
      }
    }
  })
})

describe('pickWeek properties', () => {
  it('always returns seven slots, each from the input or null', () => {
    for (let run = 0; run < RUNS; run += 1) {
      const g = makeGenerator(run + 6000)
      const recipes = g.recipes()
      const week = pickWeek(recipes, g.fridge(), g.rng)

      if (week.length !== 7) throw new Error(describeCase(run + 6000, run, { length: week.length }))
      for (const slot of week) {
        if (slot === null) continue
        if (!recipes.some((r) => r.id === slot.id)) throw new Error(describeCase(run + 6000, run, { slot, recipes }))
      }
      // An empty recipe list can only produce empty days.
      if (recipes.length === 0 && week.some((slot) => slot !== null)) {
        throw new Error(describeCase(run + 6000, run, week))
      }
    }
  })
})

describe('weekDays and shiftWeek properties', () => {
  it('keeps the days consecutive and consistent with the shift', () => {
    for (let run = 0; run < RUNS; run += 1) {
      const g = makeGenerator(run + 7000)
      const start = `2026-${String(1 + Math.floor(g.rng() * 12)).padStart(2, '0')}-${String(1 + Math.floor(g.rng() * 28)).padStart(2, '0')}`

      const days = weekDays(start)
      if (days[0] !== start || days.length !== 7) throw new Error(describeCase(run + 7000, run, days))
      for (let i = 1; i < days.length; i += 1) {
        const previous = Date.parse(`${days[i - 1]}T00:00:00Z`)
        const current = Date.parse(`${days[i]}T00:00:00Z`)
        if (current - previous !== 86_400_000) throw new Error(describeCase(run + 7000, run, days))
      }

      // Shifting by a week and back returns to the same day.
      const there = shiftWeek(start, 7)
      if (shiftWeek(there, -7) !== start) throw new Error(describeCase(run + 7000, run, { start, there }))
    }
  })
})

describe('purchasedToFridge and validateItem properties', () => {
  it('keeps exactly the checked rows, with no expiry date', () => {
    for (let run = 0; run < RUNS; run += 1) {
      const g = makeGenerator(run + 8000)
      const rows = Array.from({ length: Math.floor(g.rng() * 5) }, (_, i) => ({
        name: g.pick(NAMES),
        quantity: g.quantity(),
        unit: g.pick(UNITS),
        checked: g.rng() < 0.5,
      }))
      const rows2 = rows.map((r, i) => ({ ...r, id: `s${i}` }))

      const result = purchasedToFridge(rows2)
      if (result.length !== rows2.filter((r) => r.checked).length) {
        throw new Error(describeCase(run + 8000, run, { rows2, result }))
      }
      for (const row of result) {
        if (row.expiresOn !== null) throw new Error(describeCase(run + 8000, run, row))
        if (normalizeName(row.name) !== row.name) throw new Error(describeCase(run + 8000, run, row))
      }
    }
  })

  it('accepts exactly what its own normalized output contains', () => {
    for (let run = 0; run < RUNS; run += 1) {
      const g = makeGenerator(run + 9000)
      const raw = { name: g.pick(NAMES), quantity: g.quantity(), unit: g.pick(UNITS) }
      const first = validateItem(raw)
      if (!first.ok) throw new Error(describeCase(run + 9000, run, { raw, first }))

      // Feeding the normalized value back is always valid, and it does not change.
      const second = validateItem(first.value)
      if (!second.ok || second.value.name !== first.value.name || second.value.unit !== first.value.unit) {
        throw new Error(describeCase(run + 9000, run, { first, second }))
      }
    }
  })
})
