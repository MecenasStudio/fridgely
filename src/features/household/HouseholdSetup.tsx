import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HouseholdState } from './useHousehold'

export function HouseholdSetup({ h }: { h: HouseholdState }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  const run = (fn: () => Promise<void>) => async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section>
      <h2>{t('household.title')}</h2>
      <form onSubmit={run(() => h.create(name))}>
        <input required placeholder={t('household.name')} value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit">{t('household.create')}</button>
      </form>
      <form onSubmit={run(() => h.joinByCode(code))}>
        <input required placeholder={t('household.code')} value={code} onChange={(e) => setCode(e.target.value)} />
        <button type="submit">{t('household.join')}</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
