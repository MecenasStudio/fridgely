import { render, screen, waitFor } from '@testing-library/react'
import i18n from '../../i18n'
import { AuthGate } from './AuthGate'

const { supabase } = vi.hoisted(() => {
  const supabase = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null as unknown }, error: null })),
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        void cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
    },
  }
  return { supabase }
})

vi.mock('../../lib/supabase', () => ({ supabase }))

/** Session the next `getSession()`/`onAuthStateChange` result should carry. */
function setSession(session: unknown) {
  supabase.auth.getSession.mockImplementation(async () => ({ data: { session }, error: null }))
}

function lastAuthCallback(): (event: string, session: unknown) => void {
  const calls = supabase.auth.onAuthStateChange.mock.calls
  return calls[calls.length - 1][0]
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  supabase.auth.onAuthStateChange.mockClear()
  setSession(null)
})

describe('AuthGate', () => {
  it('renders nothing while the session is still unknown', async () => {
    supabase.auth.getSession.mockReturnValueOnce(new Promise(() => {}))
    const { container } = render(<AuthGate>{() => <p>inside</p>}</AuthGate>)
    expect(container.textContent).toBe('')
  })

  it('shows the sign-in form without a session', async () => {
    render(<AuthGate>{() => <p>inside</p>}</AuthGate>)
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByText('inside')).toBeNull()
  })

  it('renders the children with the session once signed in', async () => {
    setSession({ user: { id: 'u1' } })
    render(<AuthGate>{(s) => <p>inside {s.user.id}</p>}</AuthGate>)
    expect(await screen.findByText('inside u1')).toBeTruthy()
  })

  it('reacts to an auth state change', async () => {
    render(<AuthGate>{(s) => <p>inside {s.user.id}</p>}</AuthGate>)
    await screen.findByRole('button', { name: 'Sign in' })

    await waitFor(() => expect(supabase.auth.onAuthStateChange).toHaveBeenCalled())
    lastAuthCallback()('SIGNED_IN', { user: { id: 'u2' } })
    expect(await screen.findByText('inside u2')).toBeTruthy()
  })
})
