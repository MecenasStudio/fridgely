import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { findMergeTarget } from '../../domain/fridge'
import type { FridgeItem } from '../../domain/types'
import type { NewFridgeItem } from './FridgeItemForm'

type Row = {
  id: string
  name: string
  quantity: number
  unit: string
  expires_on: string | null
}

const fromRow = (r: Row): FridgeItem => ({
  id: r.id, name: r.name, quantity: Number(r.quantity), unit: r.unit, expiresOn: r.expires_on,
})

// Rows written by this session that have no server id yet (an insert never returns one).
let localRowId = 0

export function useFridge(householdId: string) {
  const [items, setItems] = useState<FridgeItem[]>([])
  // True until the first load settles, so the view can show "loading" instead of "empty".
  const [loading, setLoading] = useState(true)
  // True when the last load failed; the view keeps showing whatever it had before.
  const [error, setError] = useState(false)
  // The newest list React may not have committed yet. `add` merges against this one, so
  // a loop of adds (photo import, "move bought to the fridge") sees its own earlier calls.
  const current = useRef<FridgeItem[]>([])

  const commit = useCallback((next: FridgeItem[]) => {
    current.current = next
    setItems(next)
  }, [])

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('fridge_items')
      .select('id, name, quantity, unit, expires_on')
      .eq('household_id', householdId)
    if (loadError) {
      // Keep the rows already on screen; only report the failure.
      setError(true)
      setLoading(false)
      return
    }
    setError(false)
    commit((data ?? []).map(fromRow))
    setLoading(false)
  }, [householdId, commit])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`fridge:${householdId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'fridge_items', filter: `household_id=${householdId}` },
        () => { load() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [householdId, load])

  /**
   * Adding the same product twice (same name, unit and date) tops up the existing row
   * instead of creating a duplicate; the photo import, the barcode add and the shopping
   * list all rely on it.
   *
   * Known limit, accepted for now: two people in one household adding at the very same
   * moment can still overwrite each other, because the quantity is read here and written
   * there. Supabase Realtime brings both devices back in line a moment later.
   */
  const add = async (item: NewFridgeItem) => {
    const target = findMergeTarget(current.current, item)
    if (target) {
      const quantity = Number(target.quantity) + item.quantity
      const { error } = await supabase.from('fridge_items').update({ quantity }).eq('id', target.id)
      if (error) throw error
      commit(current.current.map((row) => (row.id === target.id ? { ...row, quantity } : row)))
      return
    }
    const { error } = await supabase.from('fridge_items').insert({
      household_id: householdId, name: item.name, quantity: item.quantity, unit: item.unit, expires_on: item.expiresOn,
    })
    if (error) throw error
    // No id comes back from an insert, so the row is tracked under a local key until the
    // next `load` (Realtime) replaces it. Merging only compares name, unit and date.
    localRowId += 1
    commit([...current.current, { ...item, id: `local-${localRowId}` }])
  }
  const update = async (id: string, patch: Partial<NewFridgeItem>) => {
    const row: Record<string, unknown> = {}
    if (patch.name !== undefined) row.name = patch.name
    if (patch.quantity !== undefined) row.quantity = patch.quantity
    if (patch.unit !== undefined) row.unit = patch.unit
    if (patch.expiresOn !== undefined) row.expires_on = patch.expiresOn
    const { error } = await supabase.from('fridge_items').update(row).eq('id', id)
    if (error) throw error
  }
  const remove = async (id: string) => {
    const { error } = await supabase.from('fridge_items').delete().eq('id', id)
    if (error) throw error
  }

  return { items, loading, error, reload: load, add, update, remove }
}
