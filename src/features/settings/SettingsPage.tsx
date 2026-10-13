import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { clearKey, getKeyStatus, saveKey } from '../../lib/apiKey'
import { SettingsView } from './SettingsView'

export function SettingsPage() {
  const { i18n } = useTranslation()
  const [status, setStatus] = useState<{ hasKey: boolean; last4: string | null }>({ hasKey: false, last4: null })

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
    />
  )
}
