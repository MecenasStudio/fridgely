import { useTranslation } from 'react-i18next'
import { expiryStatus, sortByExpiry } from '../../domain/fridge'
import type { FridgeItem } from '../../domain/types'
import { FridgeItemForm, type NewFridgeItem } from './FridgeItemForm'

type Props = {
  items: FridgeItem[]
  today: string
  onAdd: (item: NewFridgeItem) => Promise<void>
  onUpdate: (id: string, patch: Partial<NewFridgeItem>) => Promise<void>
  onRemove: (id: string) => Promise<void>
}

export function FridgeView({ items, today, onAdd, onUpdate, onRemove }: Props) {
  const { t } = useTranslation()
  const sorted = sortByExpiry(items)

  return (
    <section>
      <h2>{t('nav.fridge')}</h2>
      <FridgeItemForm onAdd={onAdd} />
      {sorted.length === 0 ? (
        <p>{t('fridge.empty')}</p>
      ) : (
        <ul>
          {sorted.map((item) => {
            const status = expiryStatus(item, today)
            return (
              <li key={item.id} data-status={status}>
                <span data-testid="name">{item.name}</span>{' '}
                <span>{item.quantity} {item.unit}</span>{' '}
                {status === 'unknown' ? (
                  <label>
                    {t('fridge.addExpiry')}{' '}
                    <input type="date" onChange={(e) => e.target.value && onUpdate(item.id, { expiresOn: e.target.value })} />
                  </label>
                ) : (
                  <span>
                    {item.expiresOn}
                    {status === 'expired' && <strong> {t('fridge.expired')}</strong>}
                    {status === 'soon' && <strong> {t('fridge.soon')}</strong>}
                  </span>
                )}{' '}
                <button type="button" onClick={() => onRemove(item.id)} aria-label={`${t('fridge.remove')} ${item.name}`}>×</button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
