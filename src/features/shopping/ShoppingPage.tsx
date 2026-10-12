import { buildShoppingList } from '../../domain/shopping'
import { weekDays } from '../../domain/plan'
import { todayISO } from '../../domain/fridge'
import { useFridge } from '../fridge/useFridge'
import { useMealPlan } from '../plan/useMealPlan'
import { useRecipes } from '../recipes/useRecipes'
import { ShoppingView } from './ShoppingView'
import { useShopping } from './useShopping'

export function ShoppingPage({ householdId }: { householdId: string }) {
  const days = weekDays(todayISO())
  const { recipes } = useRecipes(householdId)
  const { items: fridge } = useFridge(householdId)
  const { plan } = useMealPlan(householdId, days)
  const { items, toggle, replaceAll } = useShopping(householdId)

  const generate = async () => {
    const ids = new Set(days.map((d) => plan[d]).filter(Boolean))
    const planned = recipes.filter((r) => ids.has(r.id))
    await replaceAll(buildShoppingList(planned, fridge))
  }

  return <ShoppingView items={items} onToggle={toggle} onGenerate={generate} />
}
