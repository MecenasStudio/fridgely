import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { validateItem } from '../../domain/validate'
import type { ItemField } from '../../domain/validate'
import type { FridgeItem } from '../../domain/types'

export type NewFridgeItem = Omit<FridgeItem, 'id'>

const MESSAGE_KEY: Record<ItemField, string> = {
  name: 'fridge.invalidName',
  quantity: 'fridge.invalidQuantity',
  unit: 'fridge.invalidUnit',
}

export function FridgeItemForm({ onAdd }: { onAdd: (item: NewFridgeItem) => Promise<void> }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('szt')
  const [expiresOn, setExpiresOn] = useState('')
  const [invalidField, setInvalidField] = useState<ItemField | null>(null)
  const [addFailed, setAddFailed] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setAddFailed(false)
    const checked = validateItem({ name, quantity: Number(quantity.replace(',', '.')), unit })
    if (!checked.ok) {
      // Nothing is sent: the shared rules are the same ones the server applies.
      setInvalidField(checked.error)
      return
    }
    setInvalidField(null)
    try {
      await onAdd({ ...checked.value, expiresOn: expiresOn || null })
      setName('')
      setQuantity('1')
      setExpiresOn('')
    } catch {
      setAddFailed(true)
    }
  }

  return (
    <form onSubmit={submit}>
      <input required placeholder={t('fridge.name')} value={name} onChange={(e) => setName(e.target.value)} />
      <input type="number" min="0" step="any" aria-label={t('fridge.quantity')} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      <input aria-label={t('fridge.unit')} value={unit} onChange={(e) => setUnit(e.target.value)} />
      <input type="date" aria-label={t('fridge.expiresOn')} value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
      <button type="submit">{t('fridge.add')}</button>
      {invalidField && <p role="alert">{t(MESSAGE_KEY[invalidField])}</p>}
      {addFailed && <p role="alert">{t('fridge.addFailed')}</p>}
    </form>
  )
}
