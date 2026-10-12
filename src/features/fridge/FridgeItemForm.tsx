import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FridgeItem } from '../../domain/types'

export type NewFridgeItem = Omit<FridgeItem, 'id'>

export function FridgeItemForm({ onAdd }: { onAdd: (item: NewFridgeItem) => Promise<void> }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('szt')
  const [expiresOn, setExpiresOn] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    const qty = Number(quantity)
    if (!trimmed || !(qty > 0)) return
    await onAdd({ name: trimmed, quantity: qty, unit: unit.trim() || 'szt', expiresOn: expiresOn || null })
    setName('')
    setQuantity('1')
    setExpiresOn('')
  }

  return (
    <form onSubmit={submit}>
      <input required placeholder={t('fridge.name')} value={name} onChange={(e) => setName(e.target.value)} />
      <input type="number" min="0" step="any" aria-label={t('fridge.quantity')} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      <input aria-label={t('fridge.unit')} value={unit} onChange={(e) => setUnit(e.target.value)} />
      <input type="date" aria-label={t('fridge.expiresOn')} value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
      <button type="submit">{t('fridge.add')}</button>
    </form>
  )
}
