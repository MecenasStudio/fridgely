import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
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

export function useFridge(householdId: string) {
  const [items, setItems] = useState<FridgeItem[]>([])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('fridge_items')
      .select('id, name, quantity, unit, expires_on')
      .eq('household_id', householdId)
    setItems((data ?? []).map(fromRow))
  }, [householdId])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`fridge:${householdId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'fridge_items', filter: `household_id=eq.${householdId}` },
        () => { load() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [householdId, load])

  const add = async (item: NewFridgeItem) => {
    const { error } = await supabase.from('fridge_items').insert({
      household_id: householdId, name: item.name, quantity: item.quantity, unit: item.unit, expires_on: item.expiresOn,
    })
    if (error) throw error
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

  return { items, add, update, remove }
}
