import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'

export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  return session
}

/** True once the user arrives through the `PASSWORD_RECOVERY` link from the reset e-mail. */
export function usePasswordRecovery(): boolean {
  const [recovering, setRecovering] = useState(false)
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])
  return recovering
}

export function SignIn() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetNeedsEmail, setResetNeedsEmail] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setFailed(false)
    setResetSent(false)
    setResetNeedsEmail(false)
    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
    if (error) setFailed(true)
    else if (mode === 'signup') setMessage(t('auth.checkEmail'))
  }

  async function magicLink() {
    setMessage(null)
    setFailed(false)
    setResetSent(false)
    setResetNeedsEmail(false)
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) setFailed(true)
    else setMessage(t('auth.checkEmail'))
  }

  /**
   * Answers with the same confirmation no matter what the server says: the screen must
   * not reveal whether an account exists for the address.
   */
  async function resetPassword() {
    setMessage(null)
    setFailed(false)
    setResetSent(false)
    if (email.trim().length === 0) {
      setResetNeedsEmail(true)
      return
    }
    setResetNeedsEmail(false)
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    if (error) setFailed(true)
    else setResetSent(true)
  }

  return (
    <form onSubmit={submit}>
      <h2>{mode === 'signin' ? t('auth.signIn') : t('auth.signUp')}</h2>
      <input type="email" required placeholder={t('auth.email')} value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" required minLength={6} placeholder={t('auth.password')} value={password} onChange={(e) => setPassword(e.target.value)} />
      <button type="submit">{mode === 'signin' ? t('auth.signIn') : t('auth.signUp')}</button>
      <button type="button" onClick={magicLink} disabled={!email}>{t('auth.magicLink')}</button>
      <button type="button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
        {mode === 'signin' ? t('auth.switchToSignUp') : t('auth.switchToSignIn')}
      </button>
      {mode === 'signin' && (
        <button type="button" onClick={() => void resetPassword()}>{t('auth.forgotPassword')}</button>
      )}
      {failed && <p role="alert">{t('auth.failed')}</p>}
      {resetNeedsEmail && <p role="alert">{t('auth.resetNeedsEmail')}</p>}
      {resetSent && <p role="status">{t('auth.resetSent')}</p>}
      {message && <p role="status">{message}</p>}
    </form>
  )
}

/** Shown after the recovery link: the user only picks a new password. */
export function PasswordResetForm({ onDone }: { onDone(): void }) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<'short' | 'mismatch' | 'failed' | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) {
      setError('short')
      return
    }
    if (password !== repeat) {
      setError('mismatch')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setPassword('')
      setRepeat('')
      onDone()
    } catch {
      setError('failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>{t('auth.newPassword')}</h2>
      <input
        type="password"
        required
        minLength={6}
        placeholder={t('auth.newPassword')}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <input
        type="password"
        required
        minLength={6}
        placeholder={t('auth.repeatPassword')}
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
      />
      <button type="submit" disabled={saving}>{t('auth.savePassword')}</button>
      {error === 'short' && <p role="alert">{t('auth.passwordTooShort')}</p>}
      {error === 'mismatch' && <p role="alert">{t('auth.passwordMismatch')}</p>}
      {error === 'failed' && <p role="alert">{t('auth.passwordFailed')}</p>}
    </form>
  )
}

export function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const { t } = useTranslation()
  const session = useSession()
  const recovering = usePasswordRecovery()
  const [passwordChanged, setPasswordChanged] = useState(false)

  if (session === undefined) return null
  if (recovering && !passwordChanged) {
    return <PasswordResetForm onDone={() => setPasswordChanged(true)} />
  }
  if (session === null) return <SignIn />
  return (
    <>
      {passwordChanged && <p role="status">{t('auth.passwordSaved')}</p>}
      {children(session)}
    </>
  )
}
