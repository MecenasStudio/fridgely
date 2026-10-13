import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { subscribeToHousehold } from '../../lib/realtime'
import type { Ingredient, Recipe } from '../../domain/types'

type Row = { id: string; title: string; ingredients: Ingredient[]; steps: string[] }

export function useRecipes(householdId: string) {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  // True until the first load settles, so the view does not flash its empty state.
  const [loading, setLoading] = useState(true)
  // True when the last load failed; the view keeps showing whatever it had before.
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('recipes')
      .select('id, title, ingredients, steps')
      .eq('household_id', householdId)
      .order('created_at')
    if (loadError) {
      setError(true)
      setLoading(false)
      return
    }
    setError(false)
    setRecipes((data as Row[] | null) ?? [])
    setLoading(false)
  }, [householdId])

  useEffect(() => {
    load()
    // Filtering and debouncing live in `subscribeToHousehold`, the single place allowed
    // to build a Realtime filter.
    return subscribeToHousehold('recipes', householdId, load)
  }, [householdId, load])

  const add = async (r: Omit<Recipe, 'id'>) => {
    const { error } = await supabase.from('recipes').insert({
      household_id: householdId, title: r.title, ingredients: r.ingredients, steps: r.steps,
    })
    if (error) throw error
  }
  const del = async (id: string) => {
    const { error } = await supabase.from('recipes').delete().eq('id', id)
    if (error) throw error
  }
  const update = async (id: string, patch: { title: string; ingredients: Ingredient[]; steps: string[] }) => {
    const { error } = await supabase
      .from('recipes')
      .update({ title: patch.title, ingredients: patch.ingredients, steps: patch.steps })
      .eq('id', id)
    if (error) throw error
    setRecipes((current) =>
      current.map((recipe) => (recipe.id === id ? { ...recipe, ...patch } : recipe)),
    )
  }

  return { recipes, loading, error, reload: load, add, del, update }
}
