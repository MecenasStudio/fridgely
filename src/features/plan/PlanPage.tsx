import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { pickWeek, shiftWeek, weekDays } from '../../domain/plan'
import type { ConsumeResult } from '../../domain/consume'
import { todayISO } from '../../domain/fridge'
import { useFridge } from '../fridge/useFridge'
import { useRecipes } from '../recipes/useRecipes'
import { PlanView } from './PlanView'
import { useMealPlan } from './useMealPlan'

export function PlanPage({ householdId }: { householdId: string }) {
  const { i18n } = useTranslation()
  const today = todayISO()
  const [start, setStart] = useState(today)
  const days = weekDays(start)

  const { recipes, loading: recipesLoading } = useRecipes(householdId)
  const { items, update: updateFridge, remove: removeFromFridge, loading: fridgeLoading } = useFridge(householdId)
  const { plan, set, setMany, loading: planLoading } = useMealPlan(householdId, days)

  const randomize = async () => {
    const picked = pickWeek(recipes, items, Math.random)
    await setMany(Object.fromEntries(days.map((d, i) => [d, picked[i]?.id ?? null])))
  }

  // The view only calls this after the user confirmed the preview.
  const consume = async (change: ConsumeResult) => {
    for (const row of change.updates) {
      await updateFridge(row.id, { quantity: row.newQuantity })
    }
    for (const id of change.deletes) {
      await removeFromFridge(id)
    }
  }

  const label = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatRange(new Date(`${days[0]}T00:00:00Z`), new Date(`${days[days.length - 1]}T00:00:00Z`))

  return (
    <PlanView
      days={days}
      recipes={recipes}
      plan={plan}
      fridge={items}
      weekLabel={label}
      isCurrentWeek={start === today}
      onShiftWeek={(weeks) => setStart((current) => shiftWeek(current, weeks * 7))}
      onThisWeek={() => setStart(today)}
      onConsume={consume}
      loading={recipesLoading || fridgeLoading || planLoading}
      onSet={set}
      onRandomize={randomize}
    />
  )
}
