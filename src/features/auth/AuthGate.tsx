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

function SignIn() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [message, setMessage] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
    if (error) setMessage(error.message)
    else if (mode === 'signup') setMessage(t('auth.checkEmail'))
  }

  async function magicLink() {
    setMessage(null)
    const { error } = await supabase.auth.signInWithOtp({ email })
    setMessage(error ? error.message : t('auth.checkEmail'))
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
      {message && <p role="status">{message}</p>}
    </form>
  )
}

export function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const session = useSession()
  if (session === undefined) return null
  if (session === null) return <SignIn />
  return <>{children(session)}</>
}
