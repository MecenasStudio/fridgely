import { useTranslation } from 'react-i18next'
import { readLabelDate, recognizePhoto } from '../../lib/ai'
import type { AiLocale } from '../../lib/ai'
import { todayISO } from '../../domain/fridge'
import { FridgeView } from './FridgeView'
import { useFridge } from './useFridge'

function resolveLocale(language: string | undefined): AiLocale {
  return language?.startsWith('pl') ? 'pl' : 'en'
}

export function FridgePage({ householdId }: { householdId: string }) {
  const { i18n } = useTranslation()
  const { items, add, update, remove, loading, error, reload } = useFridge(householdId)

  return (
    <FridgeView
      items={items}
      today={todayISO()}
      onAdd={add}
      onUpdate={update}
      onRemove={remove}
      loading={loading}
      error={error}
      onReload={reload}
      locale={resolveLocale(i18n.resolvedLanguage)}
      recognize={recognizePhoto}
      readDate={readLabelDate}
    />
  )
}
