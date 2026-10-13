import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Ingredient } from '../../domain/types'
import type { ShoppingItem } from './ShoppingView'

export function useShopping(householdId: string) {
  const [items, setItems] = useState<ShoppingItem[]>([])
  // True until the first load settles, so the view does not flash "nothing to buy".
  const [loading, setLoading] = useState(true)
  // True when the last load failed; the view keeps showing whatever it had before.
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('shopping_items')
      .select('id, name, quantity, unit, checked')
      .eq('household_id', householdId)
      .order('created_at')
    if (loadError) {
      setError(true)
      setLoading(false)
      return
    }
    setError(false)
    setItems(((data ?? []) as ShoppingItem[]).map((i) => ({ ...i, quantity: Number(i.quantity) })))
    setLoading(false)
  }, [householdId])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`shopping:${householdId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_items', filter: `household_id=eq.${householdId}` },
        () => { load() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [householdId, load])

  const toggle = async (id: string, checked: boolean) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, checked } : i)))
    const { error } = await supabase.from('shopping_items').update({ checked }).eq('id', id)
    if (error) throw error
  }

  // Replaces the shared list with a freshly computed one.
  const replaceAll = async (list: Ingredient[]) => {
    const del = await supabase.from('shopping_items').delete().eq('household_id', householdId)
    if (del.error) throw del.error
    if (list.length === 0) return
    const ins = await supabase.from('shopping_items').insert(
      list.map((i) => ({ household_id: householdId, name: i.name, quantity: i.quantity, unit: i.unit })),
    )
    if (ins.error) throw ins.error
  }

  // Adds rows without touching what is already on the list.
  const addMany = async (list: Ingredient[]) => {
    if (list.length === 0) return
    const ins = await supabase.from('shopping_items').insert(
      list.map((i) => ({ household_id: householdId, name: i.name, quantity: i.quantity, unit: i.unit })),
    )
    if (ins.error) throw ins.error
  }

  const deleteByIds = async (ids: string[]) => {
    if (ids.length === 0) return
    const del = await supabase.from('shopping_items').delete().in('id', ids)
    if (del.error) throw del.error
    setItems((current) => current.filter((item) => !ids.includes(item.id)))
  }

  /** One row: the "remove" button on a hand-written list must not need a reload to show. */
  const remove = async (id: string) => {
    const del = await supabase.from('shopping_items').delete().eq('id', id)
    if (del.error) throw del.error
    setItems((current) => current.filter((item) => item.id !== id))
  }

  return { items, loading, error, reload: load, toggle, replaceAll, addMany, deleteByIds, remove }
}
