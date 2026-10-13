import { useState } from 'react'
import { useTranslation } from 'react-i18next'

type Props = {
  status: { hasKey: boolean; last4: string | null }
  language: string
  onSave(key: string): Promise<void>
  onClear(): Promise<void>
  onLanguage(lang: 'pl' | 'en'): void
}

const PREFIX = 'sk-ant-'

export function SettingsView({ status, language, onSave, onClear, onLanguage }: Props) {
  const { t } = useTranslation()
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<'invalid' | 'failed' | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    // Local check first: a key that cannot be a Claude key never leaves the browser.
    if (!key.startsWith(PREFIX)) {
      setError('invalid')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(key)
      // Drop the key from component state as soon as the server has it.
      setKey('')
    } catch {
      setError('failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <h2>{t('nav.settings')}</h2>

      <p>{status.hasKey ? t('settings.keySaved', { last4: status.last4 ?? '' }) : t('settings.noKey')}</p>

      <form onSubmit={submit}>
        <label>
          {t('settings.key')}{' '}
          <input
            type="password"
            autoComplete="off"
            aria-label={t('settings.key')}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </label>{' '}
        <button type="submit" disabled={saving}>
          {t('settings.save')}
        </button>
      </form>

      {error === 'invalid' && <p>{t('settings.invalidKey')}</p>}
      {error === 'failed' && <p>{t('settings.saveFailed')}</p>}

      {status.hasKey && (
        <button type="button" onClick={() => onClear()}>
          {t('settings.clear')}
        </button>
      )}

      <label>
        {t('settings.language')}{' '}
        <select value={language} onChange={(e) => onLanguage(e.target.value === 'pl' ? 'pl' : 'en')}>
          <option value="pl">Polski</option>
          <option value="en">English</option>
        </select>
      </label>
    </section>
  )
}
