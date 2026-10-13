import { useTranslation } from 'react-i18next'
import { askAi } from '../../lib/ai'
import type { AiLocale, AiTask } from '../../lib/ai'
import { useFridge } from '../fridge/useFridge'
import { useRecipes } from '../recipes/useRecipes'
import { useShopping } from '../shopping/useShopping'
import { AiPanel } from './AiPanel'

function resolveLocale(language: string | undefined): AiLocale {
  return language?.startsWith('pl') ? 'pl' : 'en'
}

export function AiPage({ householdId }: { householdId: string }) {
  const { i18n } = useTranslation()
  const { items } = useFridge(householdId)
  const { add } = useRecipes(householdId)
  const { addMany } = useShopping(householdId)
  const locale = resolveLocale(i18n.resolvedLanguage)

  return (
    <AiPanel
      hasItems={items.length > 0}
      ask={(task: AiTask) =>
        askAi(task, { fridge: items.map(({ name, quantity, unit, expiresOn }) => ({ name, quantity, unit, expiresOn })) }, locale)
      }
      onSave={async (recipe) => {
        await add(recipe)
      }}
      onAddMissing={async (names) => {
        await addMany(names.map((name) => ({ name, quantity: 1, unit: 'szt' })))
      }}
    />
  )
}
