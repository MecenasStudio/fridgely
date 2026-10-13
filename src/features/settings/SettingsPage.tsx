import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { clearKey, getKeyStatus, saveKey } from '../../lib/apiKey'
import { readStoredTheme, setTheme as persistTheme, type Theme } from '../../lib/theme'
import { buildExport, exportFileName } from '../../domain/export'
import { todayISO } from '../../domain/fridge'
import { weekDays } from '../../domain/plan'
import { useFridge } from '../fridge/useFridge'
import { useHousehold } from '../household/useHousehold'
import { useMealPlan } from '../plan/useMealPlan'
import { useRecipes } from '../recipes/useRecipes'
import { useShopping } from '../shopping/useShopping'
import { SettingsView } from './SettingsView'

export function SettingsPage({ userId }: { userId: string }) {
  const { i18n } = useTranslation()
  const [status, setStatus] = useState<{ hasKey: boolean; last4: string | null }>({ hasKey: false, last4: null })
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme())
  const household = useHousehold(userId)
  const days = weekDays(todayISO())
  const { recipes } = useRecipes(household.householdId ?? '')
  const { items: fridge } = useFridge(household.householdId ?? '')
  const { items: shoppingItems } = useShopping(household.householdId ?? '')
  const { plan } = useMealPlan(household.householdId ?? '', days)

  async function refresh() {
    setStatus(await getKeyStatus())
  }

  useEffect(() => {
    refresh().catch(() => setStatus({ hasKey: false, last4: null }))
  }, [])

  /**
   * Downloads the household data through a temporary object URL. Only the shared tables are
   * written; the key, its tail and every account identifier stay out of the file.
   */
  function exportData() {
    const text = buildExport({
      recipes,
      fridge,
      shoppingList: shoppingItems.map(({ name, quantity, unit, checked }) => ({ name, quantity, unit, checked })),
      plan: days.map((day) => ({ day, recipeId: plan[day] ?? null })),
    })
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    try {
      const link = document.createElement('a')
      link.href = url
      link.download = exportFileName()
      document.body.appendChild(link)
      link.click()
      link.remove()
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  return (
    <SettingsView
      status={status}
      language={i18n.resolvedLanguage === 'pl' ? 'pl' : 'en'}
      household={{ name: household.name, inviteCode: household.inviteCode, memberCount: household.memberCount }}
      onSave={async (key) => {
        await saveKey(key)
        await refresh()
      }}
      onClear={async () => {
        await clearKey()
        await refresh()
      }}
      onLanguage={(lang) => {
        void i18n.changeLanguage(lang)
      }}
      theme={theme}
      onTheme={(next) => {
        setTheme(next)
        persistTheme(next)
      }}
      onExport={exportData}
    />
  )
}
