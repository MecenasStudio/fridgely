import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

type Props = {
  status: { hasKey: boolean; last4: string | null }
  language: string
  /** Household details; `null` means "not known (yet)", which hides that line. */
  household?: { name: string | null; inviteCode: string | null; memberCount: number | null }
  onSave(key: string): Promise<void>
  onClear(): Promise<void>
  onLanguage(lang: 'pl' | 'en'): void
}

const PREFIX = 'sk-ant-'

/**
 * The view stays free of any network import, so an error raised by the API client is
 * recognised by its `code` field (duck typing), not by `instanceof`.
 */
function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

export function SettingsView({ status, language, household, onSave, onClear, onLanguage }: Props) {
  const { t } = useTranslation()
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [saveError, setSaveError] = useState<'invalid' | 'rejected' | 'failed' | null>(null)
  const [clearFailed, setClearFailed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const inviteRef = useRef<HTMLInputElement>(null)

  /**
   * Copy the invite code. Without the Clipboard API (or when it is denied) the code is
   * selected instead, so the user can copy it with the keyboard — the text never leaves
   * the page on its own.
   */
  async function copyInvite() {
    const code = household?.inviteCode
    if (!code) return
    setCopied(false)
    setCopyFailed(false)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      const field = inviteRef.current
      field?.focus()
      field?.select()
      setCopyFailed(true)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    // Local check first: a key that cannot be a Claude key never leaves the browser.
    if (!key.startsWith(PREFIX)) {
      setSaveError('invalid')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(key)
      // Drop the key from component state as soon as the server has it.
      setKey('')
    } catch (error) {
      setSaveError(errorCodeOf(error) === 'INVALID_KEY' ? 'rejected' : 'failed')
    } finally {
      setSaving(false)
    }
  }

  async function clear() {
    if (clearing) return
    setClearing(true)
    setClearFailed(false)
    try {
      await onClear()
    } catch {
      setClearFailed(true)
    } finally {
      setClearing(false)
    }
  }

  const saveMessage =
    saveError === 'invalid'
      ? t('settings.invalidKey')
      : saveError === 'rejected'
        ? t('settings.keyRejected')
        : saveError === 'failed'
          ? t('settings.saveFailed')
          : null

  return (
    <section>
      <h2>{t('nav.settings')}</h2>

      {household && (
        <div>
          {household.name && <p>{t('settings.householdName', { name: household.name })}</p>}
          {household.memberCount !== null && (
            <p>{t('settings.memberCount', { count: household.memberCount })}</p>
          )}
          {household.inviteCode && (
            <p>
              <label>
                {t('settings.inviteCode')}{' '}
                <input ref={inviteRef} readOnly value={household.inviteCode} />
              </label>{' '}
              <button type="button" onClick={() => void copyInvite()}>
                {t('settings.copy')}
              </button>
              {copied && <span role="status"> {t('settings.copied')}</span>}
              {copyFailed && <span role="alert"> {t('settings.copyFailed')}</span>}
            </p>
          )}
        </div>
      )}

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

      {saving && <p role="status">{t('settings.saving')}</p>}
      {saveMessage && <p role="alert">{saveMessage}</p>}

      {status.hasKey && (
        <button type="button" disabled={clearing} onClick={() => void clear()}>
          {t('settings.clear')}
        </button>
      )}
      {clearFailed && <p role="alert">{t('settings.clearFailed')}</p>}

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
