import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import i18n from '../../i18n'
import { ShoppingView } from './ShoppingView'
import type { ShoppingItem } from './ShoppingView'

const noop = async () => {}

type Handlers = {
  onToggle?: (id: string, checked: boolean) => Promise<void>
  onGenerate?: () => Promise<void>
  onAdd?: (item: { name: string; quantity: number; unit: string }) => Promise<void>
  onRemove?: (id: string) => Promise<void>
  onClearChecked?: () => Promise<void>
  onMoveChecked?: () => Promise<void>
}

/** Renders the view with every callback stubbed; each test overrides what it needs. */
function renderView(items: ShoppingItem[], handlers: Handlers = {}) {
  const props = {
    items,
    onToggle: handlers.onToggle ?? vi.fn(noop),
    onGenerate: handlers.onGenerate ?? vi.fn(noop),
    onAdd: handlers.onAdd ?? vi.fn(noop),
    onRemove: handlers.onRemove ?? vi.fn(noop),
    onClearChecked: handlers.onClearChecked ?? vi.fn(noop),
    onMoveChecked: handlers.onMoveChecked ?? vi.fn(noop),
  }
  render(<ShoppingView {...props} />)
  return props
}

const item = (id: string, name: string, checked = false): ShoppingItem => ({
  id, name, quantity: 1, unit: 'l', checked,
})

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

describe('ShoppingView', () => {
  it('shows an empty state and a generate button', () => {
    const onGenerate = vi.fn(async () => {})
    renderView([], { onGenerate })
    expect(screen.getByText('Nothing to buy.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Build list from plan' }))
    expect(onGenerate).toHaveBeenCalled()
  })

  it('toggles an item', () => {
    const onToggle = vi.fn(async () => {})
    renderView([item('a', 'milk')], { onToggle })
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onToggle).toHaveBeenCalledWith('a', true)
  })

  it('shows the move button only when something is checked', () => {
    const { unmount } = render(
      <ShoppingView
        items={[item('a', 'milk')]}
        onToggle={noop}
        onGenerate={noop}
        onAdd={noop}
        onRemove={noop}
        onClearChecked={noop}
        onMoveChecked={noop}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Move bought items to the fridge' })).toBeNull()
    unmount()

    renderView([item('a', 'milk', true)])
    expect(screen.getByRole('button', { name: 'Move bought items to the fridge' })).toBeTruthy()
  })

  it('moves the checked rows and confirms', async () => {
    const onMoveChecked = vi.fn(async () => {})
    renderView([item('a', 'milk', true), item('b', 'bread')], { onMoveChecked })

    fireEvent.click(screen.getByRole('button', { name: 'Move bought items to the fridge' }))
    expect(onMoveChecked).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('The bought items are in your fridge.')).toBeTruthy()
  })

  it('alerts when moving fails', async () => {
    const raw = 'delete denied'
    const onMoveChecked = vi.fn(async () => {
      throw new Error(raw)
    })
    renderView([item('a', 'milk', true)], { onMoveChecked })

    fireEvent.click(screen.getByRole('button', { name: 'Move bought items to the fridge' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Could not move the bought items. The list is unchanged.')
    expect(screen.queryByText(raw)).toBeNull()
    // The list is untouched, so the rows and the button are still there.
    expect(screen.getByText(/milk/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Move bought items to the fridge' })).toBeTruthy()
  })
})

describe('ShoppingView editing the list', () => {
  it('adds a hand-written item and clears the form', async () => {
    const onAdd = vi.fn(async () => {})
    renderView([], { onAdd })

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Chleb ' } })
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'szt' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    // The write is awaited before the form is reset, so wait for both.
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ name: 'Chleb', quantity: 2, unit: 'szt' }))
    await waitFor(() => expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe(''))
    expect((screen.getByLabelText('Quantity') as HTMLInputElement).value).toBe('1')
  })

  it('refuses an empty name or a zero amount, and accepts a fraction', async () => {
    const onAdd = vi.fn(async () => {})
    renderView([], { onAdd })

    const add = screen.getByRole('button', { name: 'Add' })
    expect(add).toHaveProperty('disabled', true)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'mleko' } })
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '0' } })
    fireEvent.click(add)
    expect(onAdd).not.toHaveBeenCalled()

    // A number input only accepts the dot form; the code still folds a comma defensively.
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '0.5' } })
    fireEvent.click(add)
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ name: 'mleko', quantity: 0.5, unit: 'szt' }))
  })

  it('removes a single item and clears the checked ones', async () => {
    const onRemove = vi.fn(async () => {})
    const onClearChecked = vi.fn(async () => {})
    renderView([item('a', 'milk'), item('b', 'bread', true), item('c', 'butter', true)], {
      onRemove,
      onClearChecked,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Remove milk' }))
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('a'))

    fireEvent.click(screen.getByRole('button', { name: 'Clear checked' }))
    await waitFor(() => expect(onClearChecked).toHaveBeenCalledTimes(1))
  })

  it('hides clear and move when nothing is checked', () => {
    renderView([item('a', 'milk')])
    expect(screen.queryByRole('button', { name: 'Clear checked' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Move bought items to the fridge' })).toBeNull()
  })

  it('sinks the checked rows to the bottom, keeping the order inside each group', () => {
    renderView([
      item('a', 'milk', true),
      item('b', 'bread'),
      item('c', 'butter', true),
      item('d', 'eggs'),
    ])

    const order = screen
      .getAllByRole('listitem')
      .map((row) => row.textContent?.replace('×', '').trim())
    expect(order).toEqual(['1 l bread', '1 l eggs', '1 l milk', '1 l butter'])
  })

  it('reports a failed list operation without a raw message', async () => {
    const onRemove = vi.fn(async () => {
      throw new Error('delete denied')
    })
    renderView([item('a', 'milk')], { onRemove })

    fireEvent.click(screen.getByRole('button', { name: 'Remove milk' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Could not save the change to the list. Please try again.')
    expect(screen.queryByText('delete denied')).toBeNull()
  })
})
