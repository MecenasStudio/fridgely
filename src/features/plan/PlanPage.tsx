import { pickWeek, weekDays } from '../../domain/plan'
import { todayISO } from '../../domain/fridge'
import { useFridge } from '../fridge/useFridge'
import { useRecipes } from '../recipes/useRecipes'
import { PlanView } from './PlanView'
import { useMealPlan } from './useMealPlan'

export function PlanPage({ householdId }: { householdId: string }) {
  const days = weekDays(todayISO())
  const { recipes } = useRecipes(householdId)
  const { items } = useFridge(householdId)
  const { plan, set, setMany } = useMealPlan(householdId, days)

  const randomize = async () => {
    const picked = pickWeek(recipes, items, Math.random)
    await setMany(Object.fromEntries(days.map((d, i) => [d, picked[i]?.id ?? null])))
  }

  return <PlanView days={days} recipes={recipes} plan={plan} onSet={set} onRandomize={randomize} />
}
