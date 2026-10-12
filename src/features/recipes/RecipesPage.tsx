import { RecipesView } from './RecipesView'
import { useRecipes } from './useRecipes'

export function RecipesPage({ householdId }: { householdId: string }) {
  const { recipes, add, del } = useRecipes(householdId)
  return <RecipesView recipes={recipes} onAdd={add} onDelete={del} />
}
