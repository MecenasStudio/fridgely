import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import i18n from '../../i18n'
import { AuthGate } from './AuthGate'

const { supabase, callbacks } = vi.hoisted(() => {
  const callbacks: ((event: string, session: unknown) => void)[] = []
  const supabase = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null as unknown }, error: null })),
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        callbacks.push(cb)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
      resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null as unknown })),
      updateUser: vi.fn(async () => ({ data: {}, error: null as unknown })),
    },
  }
  return { supabase, callbacks }
})

vi.mock('../../lib/supabase', () => ({ supabase }))

const RECOVERY_USER = { user: { id: 'u1' } }

/** Session the next `getSession()` result should carry. */
function setSession(session: unknown) {
  supabase.auth.getSession.mockImplementation(async () => ({ data: { session }, error: null }))
}

/** Fires an auth event on every subscriber, the way the real client does. */
async function emitAuthEvent(event: string, session: unknown) {
  await waitFor(() => expect(callbacks.length).toBeGreaterThan(0))
  await act(async () => {
    for (const cb of callbacks) cb(event, session)
  })
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  callbacks.length = 0
  setSession(null)
  supabase.auth.onAuthStateChange.mockClear()
  supabase.auth.resetPasswordForEmail.mockReset()
  supabase.auth.resetPasswordForEmail.mockImplementation(async () => ({ data: {}, error: null }))
  supabase.auth.updateUser.mockReset()
  supabase.auth.updateUser.mockImplementation(async () => ({ data: {}, error: null }))
})

describe('AuthGate', () => {
  it('renders nothing while the session is still unknown', () => {
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
    setSession(RECOVERY_USER)
    render(<AuthGate>{(s) => <p>inside {s.user.id}</p>}</AuthGate>)
    expect(await screen.findByText('inside u1')).toBeTruthy()
  })

  it('reacts to an auth state change', async () => {
    render(<AuthGate>{(s) => <p>inside {s.user.id}</p>}</AuthGate>)
    await screen.findByRole('button', { name: 'Sign in' })

    await emitAuthEvent('SIGNED_IN', { user: { id: 'u2' } })
    expect(await screen.findByText('inside u2')).toBeTruthy()
  })
})

describe('AuthGate password recovery', () => {
  it('sends the reset e-mail and confirms without revealing the account', async () => {
    render(<AuthGate>{() => <p>inside</p>}</AuthGate>)
    fireEvent.change(await screen.findByPlaceholderText('E-mail'), { target: { value: 'a@b.c' } })
    fireEvent.click(screen.getByRole('button', { name: 'I forgot my password' }))

    await waitFor(() => expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1))
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.c', {
      redirectTo: window.location.origin,
    })
    expect(await screen.findByText('If that account exists, we have sent a link to change the password.')).toBeTruthy()
  })

  it('asks for the e-mail first when it is empty', async () => {
    render(<AuthGate>{() => <p>inside</p>}</AuthGate>)
    await screen.findByRole('button', { name: 'Sign in' })

    fireEvent.click(screen.getByRole('button', { name: 'I forgot my password' }))

    expect(await screen.findByText('Type your e-mail first.')).toBeTruthy()
    expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('asks for a new password after PASSWORD_RECOVERY and saves it', async () => {
    setSession(RECOVERY_USER)
    render(<AuthGate>{(s) => <p>inside {s.user.id}</p>}</AuthGate>)
    await screen.findByText('inside u1')

    await emitAuthEvent('PASSWORD_RECOVERY', RECOVERY_USER)
    expect(await screen.findByRole('heading', { name: 'New password' })).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value: 'nowehaslo' } })
    fireEvent.change(screen.getByPlaceholderText('Repeat the password'), { target: { value: 'nowehaslo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the new password' }))

    await waitFor(() => expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'nowehaslo' }))
    // Back to the app, with a confirmation.
    expect(await screen.findByText('Password changed.')).toBeTruthy()
    expect(screen.getByText('inside u1')).toBeTruthy()
  })

  it('does not call updateUser when the passwords do not match or are too short', async () => {
    setSession(RECOVERY_USER)
    render(<AuthGate>{() => <p>inside</p>}</AuthGate>)
    await emitAuthEvent('PASSWORD_RECOVERY', RECOVERY_USER)
    await screen.findByRole('heading', { name: 'New password' })

    fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value: 'abcdef' } })
    fireEvent.change(screen.getByPlaceholderText('Repeat the password'), { target: { value: 'abcdefg' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the new password' }))
    expect(await screen.findByText('The passwords do not match.')).toBeTruthy()
    expect(supabase.auth.updateUser).not.toHaveBeenCalled()

    fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value: 'abc' } })
    fireEvent.change(screen.getByPlaceholderText('Repeat the password'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the new password' }))
    expect(await screen.findByText('The password needs at least 6 characters.')).toBeTruthy()
    expect(supabase.auth.updateUser).not.toHaveBeenCalled()
  })

  it('reports a failed password change without showing the server text', async () => {
    supabase.auth.updateUser.mockImplementation(async () => ({ data: {}, error: { message: 'weak password rejected' } }))
    setSession(RECOVERY_USER)
    render(<AuthGate>{() => <p>inside</p>}</AuthGate>)
    await emitAuthEvent('PASSWORD_RECOVERY', RECOVERY_USER)
    await screen.findByRole('heading', { name: 'New password' })

    fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value: 'nowehaslo' } })
    fireEvent.change(screen.getByPlaceholderText('Repeat the password'), { target: { value: 'nowehaslo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the new password' }))

    expect(await screen.findByText('Could not change the password. Please try again.')).toBeTruthy()
    expect(screen.queryByText('weak password rejected')).toBeNull()
  })
})
