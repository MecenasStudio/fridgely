import { useFridge } from '../fridge/useFridge'
import { RecipesView } from './RecipesView'
import { useRecipes } from './useRecipes'

export function RecipesPage({ householdId }: { householdId: string }) {
  const { recipes, add, del, update, loading } = useRecipes(householdId)
  const { items: fridge } = useFridge(householdId)
  return <RecipesView recipes={recipes} fridge={fridge} onAdd={add} onDelete={del} onUpdate={update} loading={loading} />
}
