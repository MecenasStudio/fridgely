import { buildShoppingList, purchasedToFridge } from '../../domain/shopping'
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
  const { items: fridge, add: addToFridge } = useFridge(householdId)
  const { plan } = useMealPlan(householdId, days)
  const { items, toggle, replaceAll, addMany, deleteByIds, remove, loading, error, reload } = useShopping(householdId)

  const generate = async () => {
    const ids = new Set(days.map((d) => plan[d]).filter(Boolean))
    const planned = recipes.filter((r) => ids.has(r.id))
    await replaceAll(buildShoppingList(planned, fridge))
  }

  // Fridge first, shopping list second: if any insert fails, nothing is deleted and the
  // user still sees the whole list (at worst with a duplicate in the fridge).
  const moveChecked = async () => {
    const purchased = purchasedToFridge(items)
    if (purchased.length === 0) return
    for (const row of purchased) {
      await addToFridge(row)
    }
    await deleteByIds(items.filter((i) => i.checked).map((i) => i.id))
  }

  return (
    <ShoppingView
      items={items}
      onToggle={toggle}
      onGenerate={generate}
      onAdd={async (item) => addMany([item])}
      onRemove={remove}
      onClearChecked={async () => deleteByIds(items.filter((i) => i.checked).map((i) => i.id))}
      onMoveChecked={moveChecked}
      loading={loading}
      error={error}
      onReload={reload}
    />
  )
}
