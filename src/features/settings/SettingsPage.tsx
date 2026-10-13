import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { clearKey, getKeyStatus, saveKey } from '../../lib/apiKey'
import { readStoredTheme, setTheme as persistTheme, type Theme } from '../../lib/theme'
import { useHousehold } from '../household/useHousehold'
import { SettingsView } from './SettingsView'

export function SettingsPage({ userId }: { userId: string }) {
  const { i18n } = useTranslation()
  const [status, setStatus] = useState<{ hasKey: boolean; last4: string | null }>({ hasKey: false, last4: null })
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme())
  const household = useHousehold(userId)

  async function refresh() {
    setStatus(await getKeyStatus())
  }

  useEffect(() => {
    refresh().catch(() => setStatus({ hasKey: false, last4: null }))
  }, [])

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
    />
  )
}
