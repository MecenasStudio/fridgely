import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import i18n from '../../i18n'
import { SettingsView } from './SettingsView'

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

  it('switches the language through the selector', () => {
    const onLanguage = vi.fn()
    renderView({ onLanguage })
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'pl' } })
    expect(onLanguage).toHaveBeenCalledWith('pl')
  })
})
