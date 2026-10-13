// The one place that subscribes to household changes over Supabase Realtime.
//
// The filter string used to be copied into four hooks, and a typo in one copy went
// unnoticed for a whole batch (the fridge stopped reacting to changes). It is built here
// and nowhere else: `household_id=eq.<id>`. Events are debounced, because one user action
// (moving bought items into the fridge) can produce a burst of row changes.

import { supabase } from './supabase'

export type HouseholdTable = 'fridge_items' | 'recipes' | 'meal_plan' | 'shopping_items'

export const DEFAULT_DEBOUNCE_MS = 150

/**
 * Subscribes to every change in one household table and calls `onChange` once per burst.
 *
 * `onChange` is called with a trailing debounce: the first event starts a timer, further
 * events only reset it, and the call happens `debounceMs` after the last event. The returned
 * function removes the channel and cancels a pending timer, so a stale call can never fire
 * after the caller has gone away.
 */
export function subscribeToHousehold(
  table: HouseholdTable,
  householdId: string,
  onChange: () => void,
  debounceMs = DEFAULT_DEBOUNCE_MS,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  // Set by the cleanup function. An event that arrives afterwards (the network can be
  // slower than the unmount) must not schedule another call.
  let closed = false

  const channel = supabase
    .channel(`${table}:${householdId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
      () => {
        if (closed) return
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          if (closed) return
          onChange()
        }, debounceMs)
      },
    )
    .subscribe()

  return () => {
    closed = true
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    supabase.removeChannel(channel)
  }
}
