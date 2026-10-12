import { useTranslation } from 'react-i18next'

export type ShoppingItem = { id: string; name: string; quantity: number; unit: string; checked: boolean }

type Props = {
  items: ShoppingItem[]
  onToggle: (id: string, checked: boolean) => Promise<void>
  onGenerate: () => Promise<void>
}

export function ShoppingView({ items, onToggle, onGenerate }: Props) {
  const { t } = useTranslation()
  return (
    <section>
      <h2>{t('nav.shopping')}</h2>
      <button type="button" onClick={() => onGenerate()}>{t('shopping.generate')}</button>
      {items.length === 0 ? (
        <p>{t('shopping.empty')}</p>
      ) : (
        <ul>
          {items.map((i) => (
            <li key={i.id}>
              <label style={{ textDecoration: i.checked ? 'line-through' : undefined }}>
                <input type="checkbox" checked={i.checked} onChange={(e) => onToggle(i.id, e.target.checked)} />{' '}
                {i.quantity} {i.unit} {i.name}
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
