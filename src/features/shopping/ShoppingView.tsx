import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Ingredient } from '../../domain/types'

export type ShoppingItem = { id: string; name: string; quantity: number; unit: string; checked: boolean }

type Props = {
  items: ShoppingItem[]
  onToggle: (id: string, checked: boolean) => Promise<void>
  onGenerate: () => Promise<void>
  onAdd(item: Ingredient): Promise<void>
  onRemove(id: string): Promise<void>
  onClearChecked: () => Promise<void>
  /** Moves the checked rows into the fridge; only shown when something is checked. */
  onMoveChecked(): Promise<void>
  /** True until the first load settles: shows "Loading…" instead of the empty state. */
  loading?: boolean
}

/** Checked rows sink to the bottom; within each group the original order is kept. */
function uncheckedFirst(items: ShoppingItem[]): ShoppingItem[] {
  return [...items.filter((i) => !i.checked), ...items.filter((i) => i.checked)]
}

export function ShoppingView({
  items,
  onToggle,
  onGenerate,
  onAdd,
  onRemove,
  onClearChecked,
  onMoveChecked,
  loading = false,
}: Props) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('szt')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [moved, setMoved] = useState(false)

  const checkedCount = items.filter((i) => i.checked).length
  const sorted = uncheckedFirst(items)

  /** Every list operation goes through here, so a failure always shows up in `role="alert"`. */
  async function run(action: () => Promise<void>, options: { moved?: boolean; message?: string } = {}) {
    if (busy) return
    setBusy(true)
    setFailed(null)
    setMoved(false)
    try {
      await action()
      if (options.moved) setMoved(true)
    } catch {
      setFailed(options.message ?? t('shopping.operationFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    const amount = Number(quantity.replace(',', '.'))
    if (!trimmed || !Number.isFinite(amount) || amount <= 0) return
    await run(async () => {
      await onAdd({ name: trimmed, quantity: amount, unit: unit.trim() || 'szt' })
      setName('')
      setQuantity('1')
    })
  }

  if (loading) {
    return (
      <section>
        <h2>{t('nav.shopping')}</h2>
        <p role="status">{t('common.loading')}</p>
      </section>
    )
  }

  return (
    <section>
      <h2>{t('nav.shopping')}</h2>

      <form onSubmit={submit}>
        <label>
          {t('shopping.name')}{' '}
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>{' '}
        <label>
          {t('shopping.quantity')}{' '}
          <input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </label>{' '}
        <label>
          {t('shopping.unit')}{' '}
          <input value={unit} onChange={(e) => setUnit(e.target.value)} />
        </label>{' '}
        <button type="submit" disabled={busy || name.trim().length === 0}>
          {t('shopping.add')}
        </button>
      </form>

      <button type="button" disabled={busy} onClick={() => void run(onGenerate)}>
        {t('shopping.generate')}
      </button>{' '}
      {checkedCount > 0 && (
        <>
          <button type="button" disabled={busy} onClick={() => void run(onClearChecked)}>
            {t('shopping.clearChecked')}
          </button>{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(onMoveChecked, { moved: true, message: t('shopping.moveFailed') })}
          >
            {t('shopping.moveChecked')}
          </button>
        </>
      )}

      {moved && <p role="status">{t('shopping.moved')}</p>}
      {failed && <p role="alert">{failed}</p>}

      {items.length === 0 ? (
        <p>{t('shopping.empty')}</p>
      ) : (
        <ul>
          {sorted.map((i) => (
            <li key={i.id}>
              <label style={{ textDecoration: i.checked ? 'line-through' : undefined }}>
                <input
                  type="checkbox"
                  checked={i.checked}
                  onChange={(e) => void run(() => onToggle(i.id, e.target.checked))}
                />{' '}
                {i.quantity} {i.unit} {i.name}
              </label>{' '}
              <button
                type="button"
                aria-label={`${t('shopping.remove')} ${i.name}`}
                disabled={busy}
                onClick={() => void run(() => onRemove(i.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
