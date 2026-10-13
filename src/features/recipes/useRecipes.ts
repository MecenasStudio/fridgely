import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Ingredient, Recipe } from '../../domain/types'

type Row = { id: string; title: string; ingredients: Ingredient[]; steps: string[] }

export function useRecipes(householdId: string) {
  const [recipes, setRecipes] = useState<Recipe[]>([])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('recipes')
      .select('id, title, ingredients, steps')
      .eq('household_id', householdId)
      .order('created_at')
    setRecipes((data as Row[] | null) ?? [])
  }, [householdId])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`recipes:${householdId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'recipes', filter: `household_id=eq.${householdId}` },
        () => { load() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
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

  return { recipes, add, del, update }
}
