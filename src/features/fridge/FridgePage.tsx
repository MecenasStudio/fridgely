import { todayISO } from '../../domain/fridge'
import { FridgeView } from './FridgeView'
import { useFridge } from './useFridge'

export function FridgePage({ householdId }: { householdId: string }) {
  const { items, add, update, remove } = useFridge(householdId)
  return <FridgeView items={items} today={todayISO()} onAdd={add} onUpdate={update} onRemove={remove} />
}
