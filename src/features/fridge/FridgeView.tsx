import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { expiryStatus, sortByExpiry } from '../../domain/fridge'
import { matchesQuery } from '../../domain/search'
import type { FridgeItem } from '../../domain/types'
import { FridgeItemForm, type NewFridgeItem } from './FridgeItemForm'
import { BarcodeAdd } from './BarcodeAdd'
import { PhotoImport, ReadDateButton } from './PhotoImport'
import type { ReadDate, Recognize } from './PhotoImport'

type Props = {
  items: FridgeItem[]
  today: string
  onAdd: (item: NewFridgeItem) => Promise<void>
  onUpdate: (id: string, patch: Partial<NewFridgeItem>) => Promise<void>
  onRemove: (id: string) => Promise<void>
  /** Photo tasks from the AI screen; the page injects the real client. */
  locale?: 'pl' | 'en'
  recognize?: Recognize
  readDate?: ReadDate
}

type Update = (id: string, patch: Partial<NewFridgeItem>) => Promise<void>

/**
 * Quantity editor. The value is written on blur or Enter, and only when it is a positive
 * number that actually changed; anything else snaps back to the stored value.
 */
function QuantityInput({ item, onUpdate }: { item: FridgeItem; onUpdate: Update }) {
  const { t } = useTranslation()
  const [value, setValue] = useState(String(item.quantity))

  useEffect(() => setValue(String(item.quantity)), [item.quantity])

  async function commit() {
    const parsed = Number(value.replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed === item.quantity) {
      setValue(String(item.quantity))
      return
    }
    await onUpdate(item.id, { quantity: parsed })
  }

  return (
    <input
      type="number"
      min="0"
      step="any"
      aria-label={t('fridge.quantityOf', { name: item.name })}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          void commit()
        }
      }}
    />
  )
}

/** Expiry editor, also for products that already have a date; clearing it stores null. */
function ExpiryInput({ item, onUpdate }: { item: FridgeItem; onUpdate: Update }) {
  const { t } = useTranslation()

  return (
    <input
      type="date"
      aria-label={t('fridge.expiresOnOf', { name: item.name })}
      value={item.expiresOn ?? ''}
      onChange={(e) => void onUpdate(item.id, { expiresOn: e.target.value || null })}
    />
  )
}

export function FridgeView({ items, today, onAdd, onUpdate, onRemove, locale = 'en', recognize, readDate }: Props) {
  const { t } = useTranslation()
  const sorted = sortByExpiry(items)
  const [failedId, setFailedId] = useState<string | null>(null)
  const [dateTarget, setDateTarget] = useState<{ id: string; name: string } | null>(null)
  const [query, setQuery] = useState('')
  const visible = sorted.filter((item) => matchesQuery(item.name, query))

  // Every write goes through here, so a failed update always shows up on that row.
  async function update(id: string, patch: Partial<NewFridgeItem>) {
    setFailedId(null)
    try {
      await onUpdate(id, patch)
    } catch {
      setFailedId(id)
    }
  }

  return (
    <section>
      <h2>{t('nav.fridge')}</h2>
      <FridgeItemForm onAdd={onAdd} />
      <BarcodeAdd onAdd={onAdd} />
      {recognize && readDate && (
        <PhotoImport
          locale={locale}
          onAdd={onAdd}
          recognize={recognize}
          readDate={readDate}
          onUpdateDate={(id, expiresOn) => update(id, { expiresOn })}
          dateTarget={dateTarget}
          onDateDone={() => setDateTarget(null)}
        />
      )}
      {sorted.length === 0 ? (
        <p>{t('fridge.empty')}</p>
      ) : (
        <>
          <label>
            {t('fridge.search')}{' '}
            <input
              type="search"
              aria-label={t('fridge.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>{' '}
          <span role="status">{t('fridge.found', { count: visible.length })}</span>
          {visible.length === 0 ? (
            <p>{t('fridge.noMatches')}</p>
          ) : (
            <ul>
              {visible.map((item) => {
            const status = expiryStatus(item, today)
            return (
              <li key={item.id} data-status={status}>
                <span data-testid="name">{item.name}</span>{' '}
                <span>{item.quantity} {item.unit}</span>{' '}
                <QuantityInput item={item} onUpdate={update} />{' '}
                {status === 'unknown' && <>{t('fridge.addExpiry')} </>}
                <ExpiryInput item={item} onUpdate={update} />{' '}
                {readDate && (
                  <ReadDateButton name={item.name} onClick={() => setDateTarget({ id: item.id, name: item.name })} />
                )}{' '}
                {status === 'expired' && <strong>{t('fridge.expired')} </strong>}
                {status === 'soon' && <strong>{t('fridge.soon')} </strong>}
                <button type="button" onClick={() => onRemove(item.id)} aria-label={`${t('fridge.remove')} ${item.name}`}>×</button>
                {failedId === item.id && <p role="alert">{t('fridge.updateFailed')}</p>}
              </li>
            )
          })}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
