import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export function useMealPlan(householdId: string, days: string[]) {
  const [plan, setPlan] = useState<Record<string, string | null>>({})
  // True until the first load settles, so the view does not flash empty days.
  const [loading, setLoading] = useState(true)
  const first = days[0]
  const last = days[days.length - 1]

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('meal_plan')
      .select('day, recipe_id')
      .eq('household_id', householdId)
      .gte('day', first)
      .lte('day', last)
    setPlan(Object.fromEntries((data ?? []).map((r) => [r.day as string, r.recipe_id as string | null])))
    setLoading(false)
  }, [householdId, first, last])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`plan:${householdId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'meal_plan', filter: `household_id=eq.${householdId}` },
        () => { load() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [householdId, load])

  const set = async (day: string, recipeId: string | null) => {
    setPlan((p) => ({ ...p, [day]: recipeId }))
    const { error } = recipeId
      ? await supabase.from('meal_plan').upsert({ household_id: householdId, day, recipe_id: recipeId })
      : await supabase.from('meal_plan').delete().eq('household_id', householdId).eq('day', day)
    if (error) throw error
  }

  const setMany = async (entries: Record<string, string | null>) => {
    setPlan((p) => ({ ...p, ...entries }))
    const rows = Object.entries(entries)
      .filter(([, id]) => id !== null)
      .map(([day, recipe_id]) => ({ household_id: householdId, day, recipe_id }))
    const { error } = await supabase.from('meal_plan').upsert(rows)
    if (error) throw error
  }

  return { plan, loading, set, setMany }
}
