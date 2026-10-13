import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export type ShoppingItem = { id: string; name: string; quantity: number; unit: string; checked: boolean }

type Props = {
  items: ShoppingItem[]
  onToggle: (id: string, checked: boolean) => Promise<void>
  onGenerate: () => Promise<void>
  /** Moves the checked rows into the fridge; only shown when something is checked. */
  onMoveChecked(): Promise<void>
}

export function ShoppingView({ items, onToggle, onGenerate, onMoveChecked }: Props) {
  const { t } = useTranslation()
  const [moving, setMoving] = useState(false)
  const [moved, setMoved] = useState(false)
  const [moveFailed, setMoveFailed] = useState(false)

  const checkedCount = items.filter((i) => i.checked).length

  async function move() {
    if (moving) return
    setMoving(true)
    setMoved(false)
    setMoveFailed(false)
    try {
      await onMoveChecked()
      setMoved(true)
    } catch {
      setMoveFailed(true)
    } finally {
      setMoving(false)
    }
  }

  return (
    <section>
      <h2>{t('nav.shopping')}</h2>
      <button type="button" onClick={() => void onGenerate()}>{t('shopping.generate')}</button>
      {checkedCount > 0 && (
        <>
          {' '}
          <button type="button" disabled={moving} onClick={() => void move()}>
            {t('shopping.moveChecked')}
          </button>
        </>
      )}
      {moved && <p role="status">{t('shopping.moved')}</p>}
      {moveFailed && <p role="alert">{t('shopping.moveFailed')}</p>}
      {items.length === 0 ? (
        <p>{t('shopping.empty')}</p>
      ) : (
        <ul>
          {items.map((i) => (
            <li key={i.id}>
              <label style={{ textDecoration: i.checked ? 'line-through' : undefined }}>
                <input type="checkbox" checked={i.checked} onChange={(e) => void onToggle(i.id, e.target.checked)} />{' '}
                {i.quantity} {i.unit} {i.name}
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
