import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { subscribeToHousehold } from '../../lib/realtime'

export function useMealPlan(householdId: string, days: string[]) {
  const [plan, setPlan] = useState<Record<string, string | null>>({})
  // True until the first load settles, so the view does not flash empty days.
  const [loading, setLoading] = useState(true)
  // True when the last load failed; the view keeps showing whatever it had before.
  const [error, setError] = useState(false)
  const first = days[0]
  const last = days[days.length - 1]

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('meal_plan')
      .select('day, recipe_id')
      .eq('household_id', householdId)
      .gte('day', first)
      .lte('day', last)
    if (loadError) {
      setError(true)
      setLoading(false)
      return
    }
    setError(false)
    setPlan(Object.fromEntries((data ?? []).map((r) => [r.day as string, r.recipe_id as string | null])))
    setLoading(false)
  }, [householdId, first, last])

  useEffect(() => {
    load()
    // Filtering and debouncing live in `subscribeToHousehold`, the single place allowed
    // to build a Realtime filter.
    return subscribeToHousehold('meal_plan', householdId, load)
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

  return { plan, loading, error, reload: load, set, setMany }
}
