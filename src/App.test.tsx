import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import i18n from './i18n'
import App from './App'

// One Supabase stub for the whole app: auth, the household lookup, the shared tables and
// Realtime. `vi.hoisted` keeps it available to the (hoisted) `vi.mock` factory.
const { state, supabase } = vi.hoisted(() => {
  const state = {
    session: null as unknown,
    member: null as { household_id: string } | null,
    household: null as { id: string; invite_code: string } | null,
  }

  type Chain = {
    select: () => Chain
    eq: () => Chain
    in: () => Chain
    order: () => Chain
    limit: () => Chain
    maybeSingle: () => Promise<{ data: unknown; error: null }>
    single: () => Promise<{ data: unknown; error: null }>
    then: (resolve: (value: unknown) => unknown) => Promise<unknown>
  }

  const query = (table: string): Chain => {
    const self: Chain = {
      select: () => self,
      eq: () => self,
      in: () => self,
      order: () => self,
      limit: () => self,
      maybeSingle: async () => ({ data: table === 'members' ? state.member : null, error: null }),
      single: async () => ({ data: table === 'households' ? state.household : null, error: null }),
      then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
    }
    return self
  }

  const supabase = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: state.session }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signUp: vi.fn(async () => ({ error: null })),
      signInWithOtp: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn((table: string) => query(table)),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    channel: vi.fn(() => {
      const channel = { on: () => channel, subscribe: () => channel }
      return channel
    }),
    removeChannel: vi.fn(),
  }

  return { state, supabase }
})

vi.mock('./lib/supabase', () => ({ supabase }))

async function renderApp() {
  render(<App />)
  await waitFor(() => expect(supabase.auth.getSession).toHaveBeenCalled())
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  state.session = null
  state.member = null
  state.household = null
  supabase.auth.getSession.mockClear()
  supabase.auth.signOut.mockClear()
  supabase.auth.signInWithPassword.mockReset()
  supabase.auth.signInWithPassword.mockImplementation(async () => ({ error: null }))
})

describe('App', () => {
  it('shows the sign-in form to a signed-out visitor', async () => {
    await renderApp()
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(screen.getByPlaceholderText('E-mail')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Fridge' })).toBeNull()
  })

  it('shows a message when signing in fails', async () => {
    const auth = supabase.auth as { signInWithPassword: { mockResolvedValueOnce: (value: unknown) => void } }
    auth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } })
    await renderApp()

    fireEvent.change(await screen.findByPlaceholderText('E-mail'), { target: { value: 'a@b.c' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Could not sign you in. Check your e-mail and password.')
    // The raw server text is never shown.
    expect(screen.queryByText('Invalid login credentials')).toBeNull()
  })

  it('asks a signed-in user without a household to create or join one', async () => {
    state.session = { user: { id: 'u1' } }
    await renderApp()
    expect(await screen.findByText('Your household')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create household' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Join' })).toBeTruthy()
  })

  it('shows all six tabs and switches between the sections', async () => {
    state.session = { user: { id: 'u1' } }
    state.member = { household_id: 'h1' }
    state.household = { id: 'h1', invite_code: 'abcd1234' }
    await renderApp()

    await screen.findByRole('button', { name: 'Fridge' })
    // Scoped to the nav: the "AI" and "Settings" buttons share their name with the
    // section heading they switch to.
    const tabs = within(document.querySelector('nav') as HTMLElement)
    for (const tab of ['Fridge', 'Recipes', 'Plan', 'Shopping', 'AI', 'Settings']) {
      expect(tabs.getByRole('button', { name: tab })).toBeTruthy()
    }

    // Each tab renders its own section heading.
    fireEvent.click(tabs.getByRole('button', { name: 'Recipes' }))
    expect(await screen.findByRole('heading', { name: 'Recipes' })).toBeTruthy()

    fireEvent.click(tabs.getByRole('button', { name: 'AI' }))
    expect(await screen.findByRole('heading', { name: 'AI' })).toBeTruthy()

    fireEvent.click(tabs.getByRole('button', { name: 'Settings' }))
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy()
    expect(screen.getByLabelText('Language')).toBeTruthy()
  })

  it('signs the user out from the footer', async () => {
    state.session = { user: { id: 'u1' } }
    state.member = { household_id: 'h1' }
    state.household = { id: 'h1', invite_code: 'abcd1234' }
    await renderApp()

    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1)
  })
})
