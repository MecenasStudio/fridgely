import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import i18n from '../../i18n'
import { ApiKeyError } from '../../lib/apiKey'
import { SettingsView } from './SettingsView'

// The view must not import anything from the network, but the test may: it throws the
// real error class at the view to prove the `code` field drives the message.
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
    rpc: async () => ({ data: [], error: null }),
  },
}))

const noStatus = { hasKey: false, last4: null }
const savedStatus = { hasKey: true, last4: 'wxyz' }

const noop = async () => {}

function renderView(overrides: Partial<React.ComponentProps<typeof SettingsView>> = {}) {
  const props = {
    status: noStatus,
    language: 'en',
    onSave: noop,
    onClear: noop,
    onLanguage: () => {},
    ...overrides,
  }
  render(<SettingsView {...props} />)
  return props
}

function keyField(): HTMLInputElement {
  return screen.getByLabelText('Claude key') as HTMLInputElement
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

describe('SettingsView', () => {
  it('rejects a key without the sk-ant- prefix without calling onSave', () => {
    const onSave = vi.fn(noop)
    renderView({ onSave })

    fireEvent.change(keyField(), { target: { value: 'wrong-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('The key must start with sk-ant-.')).toBeTruthy()
    expect(keyField().value).toBe('wrong-key')
  })

  it('clears the field after a successful save', async () => {
    const onSave = vi.fn(async () => {})
    renderView({ onSave })

    fireEvent.change(keyField(), { target: { value: 'sk-ant-abcdefgh' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))

    await waitFor(() => expect(keyField().value).toBe(''))
    expect(onSave).toHaveBeenCalledWith('sk-ant-abcdefgh')
  })

  it('keeps the full key out of the DOM after saving', async () => {
    const full = 'sk-ant-supersecret1234'
    const onSave = vi.fn(async () => {})
    const { container } = render(
      <SettingsView status={savedStatus} language="en" onSave={onSave} onClear={noop} onLanguage={() => {}} />,
    )

    expect((screen.getByLabelText('Claude key') as HTMLInputElement).type).toBe('password')
    fireEvent.change(keyField(), { target: { value: full } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(full))
    await waitFor(() => expect(keyField().value).toBe(''))
    expect(container.innerHTML).not.toContain(full)
    expect(container.innerHTML).not.toContain('supersecret')
    expect(screen.getByText('Key saved (…wxyz)')).toBeTruthy()
  })

  it('shows the remove button only when a key is saved', () => {
    const { unmount } = render(
      <SettingsView status={noStatus} language="en" onSave={noop} onClear={noop} onLanguage={() => {}} />,
    )
    expect(screen.getByText('No key')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove key' })).toBeNull()
    unmount()

    renderView({ status: savedStatus })
    expect(screen.getByRole('button', { name: 'Remove key' })).toBeTruthy()
  })

  it('calls onClear when the key is removed', () => {
    const onClear = vi.fn(async () => {})
    renderView({ status: savedStatus, onClear })
    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('shows a friendly message and keeps the key local when saving fails', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('network down')
    })
    renderView({ onSave })
    fireEvent.change(keyField(), { target: { value: 'sk-ant-abcdefgh' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))

    expect(await screen.findByText('Could not save the key. Please try again.')).toBeTruthy()
    expect(screen.queryByText('network down')).toBeNull()
    expect(keyField().value).toBe('sk-ant-abcdefgh')
  })

  it('says the key was rejected when the server answers INVALID_KEY', async () => {
    const onSave = vi.fn(async () => {
      throw new ApiKeyError('INVALID_KEY', 'key rejected')
    })
    renderView({ onSave })
    fireEvent.change(keyField(), { target: { value: 'sk-ant-abcdefgh' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))

    expect(await screen.findByText('Claude rejected this key. Please check that it is correct.')).toBeTruthy()
    expect(screen.queryByText('Could not save the key. Please try again.')).toBeNull()
  })

  it('alerts and keeps the key when removing it fails', async () => {
    const onClear = vi.fn(async () => {
      throw new ApiKeyError('NETWORK', 'delete failed')
    })
    renderView({ status: savedStatus, onClear })

    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Could not remove the key. Please try again.')
    // The button stays, because the key is still stored server-side.
    expect(screen.getByRole('button', { name: 'Remove key' })).toBeTruthy()
    expect(screen.queryByText('delete failed')).toBeNull()
  })

  it('switches the language through the selector', () => {
    const onLanguage = vi.fn()
    renderView({ onLanguage })
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'pl' } })
    expect(onLanguage).toHaveBeenCalledWith('pl')
  })
})

describe('SettingsView household', () => {
  const household = { name: 'Nasz dom', inviteCode: 'abcd1234', memberCount: 2 }

  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('copies the invite code and confirms', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderView({ household })

    expect(screen.getByText('Household: Nasz dom')).toBeTruthy()
    expect(screen.getByText('2 people in this household')).toBeTruthy()
    expect((screen.getByLabelText('Invite code') as HTMLInputElement).value).toBe('abcd1234')

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('abcd1234'))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', ' Copied.')
  })

  it('selects the code instead when there is no clipboard, without a status claim', async () => {
    renderView({ household })

    const field = screen.getByLabelText('Invite code') as HTMLInputElement
    expect(field.readOnly).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      ' Could not copy. The code is selected — copy it by hand.',
    )
    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe('abcd1234'.length)
    expect(screen.queryByText('Copied.')).toBeNull()
  })

  it('reports a rejected clipboard instead of lying about a copy', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('denied')
    })
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderView({ household })

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('Copied.')).toBeNull()
  })

  it('hides the lines it does not know and renders without a household at all', () => {
    const { unmount } = render(
      <SettingsView
        status={noStatus}
        language="en"
        household={{ name: null, inviteCode: null, memberCount: null }}
        onSave={noop}
        onClear={noop}
        onLanguage={() => {}}
      />,
    )
    expect(screen.queryByText(/Household:/)).toBeNull()
    expect(screen.queryByText(/people in this household/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
    unmount()

    renderView({ household: undefined })
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
    expect(screen.getByLabelText('Claude key')).toBeTruthy()
  })

  it('shows a singular count in Polish', async () => {
    await i18n.changeLanguage('pl')
    const { unmount } = render(
      <SettingsView
        status={noStatus}
        language="pl"
        household={{ name: 'Dom', inviteCode: 'abcd1234', memberCount: 1 }}
        onSave={noop}
        onClear={noop}
        onLanguage={() => {}}
      />,
    )
    expect(screen.getByText('1 osoba w domu')).toBeTruthy()
    unmount()
    await i18n.changeLanguage('en')
  })
})
