import { render, screen, within, fireEvent } from '@testing-library/react'
import i18n from '../../i18n'
import { FridgeView } from './FridgeView'
import type { FridgeItem } from '../../domain/types'

// `FridgeView` renders `PhotoImport`, which imports `lib/ai.ts`, which imports the
// Supabase client. The view itself never talks to the network, so a stub is enough.
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null }, error: null }) } },
}))

const item = (id: string, name: string, expiresOn: string | null): FridgeItem => ({
  id, name, quantity: 1, unit: 'szt', expiresOn,
})

const noop = async () => {}

beforeAll(() => i18n.changeLanguage('en'))

describe('FridgeView', () => {
  const items = [
    item('c', 'Rice', null),
    item('b', 'Yogurt', '2026-10-14'),
    item('a', 'Milk', '2026-10-10'),
  ]

  it('lists items sorted by expiry with undated last', () => {
    render(<FridgeView items={items} today="2026-10-12" onAdd={noop} onUpdate={noop} onRemove={noop} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((r) => within(r).getByTestId('name').textContent)).toEqual(['Milk', 'Yogurt', 'Rice'])
  })

  it('marks expired items and asks for a date when missing', () => {
    render(<FridgeView items={items} today="2026-10-12" onAdd={noop} onUpdate={noop} onRemove={noop} />)
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByText('Expired')).toBeTruthy()
    expect(within(rows[2]).getByText('Add expiry date')).toBeTruthy()
  })

  it('shows an empty state', () => {
    render(<FridgeView items={[]} today="2026-10-12" onAdd={noop} onUpdate={noop} onRemove={noop} />)
    expect(screen.getByText('Your fridge is empty.')).toBeTruthy()
  })

  it('submits a new item with null expiry when date is left blank', () => {
    const onAdd = vi.fn(async () => {})
    render(<FridgeView items={[]} today="2026-10-12" onAdd={onAdd} onUpdate={noop} onRemove={noop} />)
    fireEvent.change(screen.getByPlaceholderText('Product name'), { target: { value: ' Cheese ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalledWith({ name: 'Cheese', quantity: 1, unit: 'szt', expiresOn: null })
  })

  it('refuses a name that is too long and a quantity of zero, saying which field', () => {
    const onAdd = vi.fn(async () => {})
    render(<FridgeView items={[]} today="2026-10-12" onAdd={onAdd} onUpdate={noop} onRemove={noop} />)

    fireEvent.change(screen.getByPlaceholderText('Product name'), { target: { value: 'a'.repeat(101) } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('The name must be between 1 and 100 characters.')

    // A 100-character name is fine, but the quantity is not.
    fireEvent.change(screen.getByPlaceholderText('Product name'), { target: { value: 'a'.repeat(100) } })
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('The quantity must be above 0 and at most 100000.')

    // An over-long unit is the third rule.
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'x'.repeat(21) } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('The unit must be between 1 and 20 characters.')
  })

  it('saves a new quantity on blur and on Enter', () => {
    const onUpdate = vi.fn(noop)
    render(<FridgeView items={[item('a', 'Milk', '2026-10-10')]} today="2026-10-12" onAdd={noop} onUpdate={onUpdate} onRemove={noop} />)

    const quantity = screen.getByLabelText('Quantity: Milk')
    fireEvent.change(quantity, { target: { value: '3' } })
    fireEvent.blur(quantity)
    expect(onUpdate).toHaveBeenCalledWith('a', { quantity: 3 })

    onUpdate.mockClear()
    fireEvent.change(quantity, { target: { value: '4' } })
    fireEvent.keyDown(quantity, { key: 'Enter' })
    expect(onUpdate).toHaveBeenCalledWith('a', { quantity: 4 })
  })

  it('rejects zero and negative quantities and restores the stored value', () => {
    const onUpdate = vi.fn(noop)
    render(<FridgeView items={[item('a', 'Milk', '2026-10-10')]} today="2026-10-12" onAdd={noop} onUpdate={onUpdate} onRemove={noop} />)

    const quantity = screen.getByLabelText('Quantity: Milk') as HTMLInputElement
    fireEvent.change(quantity, { target: { value: '0' } })
    fireEvent.blur(quantity)
    expect(onUpdate).not.toHaveBeenCalled()
    expect(quantity.value).toBe('1')

    fireEvent.change(quantity, { target: { value: '-5' } })
    fireEvent.blur(quantity)
    expect(onUpdate).not.toHaveBeenCalled()
    expect(quantity.value).toBe('1')
  })

  it('does not save an unchanged quantity', () => {
    const onUpdate = vi.fn(noop)
    render(<FridgeView items={[item('a', 'Milk', '2026-10-10')]} today="2026-10-12" onAdd={noop} onUpdate={onUpdate} onRemove={noop} />)

    const quantity = screen.getByLabelText('Quantity: Milk')
    fireEvent.change(quantity, { target: { value: '1' } })
    fireEvent.blur(quantity)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('changes and clears the expiry date of a dated product', () => {
    const onUpdate = vi.fn(noop)
    render(<FridgeView items={[item('a', 'Milk', '2026-10-10')]} today="2026-10-12" onAdd={noop} onUpdate={onUpdate} onRemove={noop} />)

    const expiry = screen.getByLabelText('Expiry date: Milk')
    fireEvent.change(expiry, { target: { value: '2026-12-01' } })
    expect(onUpdate).toHaveBeenCalledWith('a', { expiresOn: '2026-12-01' })

    onUpdate.mockClear()
    fireEvent.change(expiry, { target: { value: '' } })
    expect(onUpdate).toHaveBeenCalledWith('a', { expiresOn: null })
  })

  it('alerts on that row when a change cannot be saved', async () => {
    const onUpdate = vi.fn(async () => {
      throw new Error('update denied')
    })
    render(<FridgeView items={[item('a', 'Milk', '2026-10-10')]} today="2026-10-12" onAdd={noop} onUpdate={onUpdate} onRemove={noop} />)

    fireEvent.change(screen.getByLabelText('Expiry date: Milk'), { target: { value: '2026-12-01' } })
    expect(await screen.findByText('Could not save the change. Please try again.')).toBeTruthy()
  })

  it('filters by name and keeps the expiry order', () => {
    const items = [
      { id: 'a', name: 'Mleko', quantity: 1, unit: 'l', expiresOn: '2026-10-10' },
      { id: 'b', name: 'Masło', quantity: 1, unit: 'szt', expiresOn: '2026-10-11' },
      { id: 'c', name: 'Jajka', quantity: 6, unit: 'szt', expiresOn: '2026-10-12' },
    ]
    render(<FridgeView items={items} today="2026-10-12" onAdd={noop} onUpdate={noop} onRemove={noop} />)

    expect(screen.getByRole('status').textContent).toBe('3 products')

    fireEvent.change(screen.getByLabelText('Search the fridge'), { target: { value: 'm' } })
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((r) => within(r).getByTestId('name').textContent)).toEqual(['Mleko', 'Masło'])
    expect(screen.getByRole('status').textContent).toBe('2 products')

    // Case and diacritics do not matter.
    fireEvent.change(screen.getByLabelText('Search the fridge'), { target: { value: 'MASLO' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(within(screen.getAllByRole('listitem')[0]).getByTestId('name').textContent).toBe('Masło')
  })

  it('shows its own message when nothing matches, not the empty-fridge one', () => {
    render(<FridgeView items={[item('a', 'Milk', '2026-10-10')]} today="2026-10-12" onAdd={noop} onUpdate={noop} onRemove={noop} />)

    fireEvent.change(screen.getByLabelText('Search the fridge'), { target: { value: 'chleb' } })

    expect(screen.getByText(/Nothing matches your search/)).toBeTruthy()
    expect(screen.queryByText('Your fridge is empty.')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('0 products')
  })

  it('shows no search field for an empty fridge', () => {
    render(<FridgeView items={[]} today="2026-10-12" onAdd={noop} onUpdate={noop} onRemove={noop} />)
    expect(screen.getByText('Your fridge is empty.')).toBeTruthy()
    expect(screen.queryByLabelText('Search the fridge')).toBeNull()
  })

  it('shows a loading state instead of the empty state while the first load runs', () => {
    render(<FridgeView items={[]} today="2026-10-12" loading onAdd={noop} onUpdate={noop} onRemove={noop} />)

    expect(screen.getByRole('status').textContent).toBe('Loading…')
    // The empty-state text must not flash before the data arrives.
    expect(screen.queryByText('Your fridge is empty.')).toBeNull()
    expect(screen.queryByLabelText('Search the fridge')).toBeNull()
  })

  it('shows the data instead of the loading state once it is loaded', () => {
    render(<FridgeView items={[item('a', 'Milk', '2026-10-10')]} today="2026-10-12" loading={false} onAdd={noop} onUpdate={noop} onRemove={noop} />)
    expect(screen.queryByText('Loading…')).toBeNull()
    expect(screen.getByTestId('name').textContent).toBe('Milk')
  })

  it('alerts about a failed load, keeps the rows and retries on demand', () => {    const onReload = vi.fn()
    render(
      <FridgeView
        items={[item('a', 'Milk', '2026-10-10')]}
        today="2026-10-12"
        error
        onReload={onReload}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain('Could not load the data.')
    // The data that was already there stays visible.
    expect(screen.getByTestId('name').textContent).toBe('Milk')

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('shows the expiry date in the interface language, keeping the field ISO', () => {
    render(
      <FridgeView
        items={[item('a', 'Milk', '2026-10-03')]}
        today="2026-10-12"
        locale="en"
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
      />,
    )

    // The human-readable date is shown, while the input still carries the ISO value.
    expect(screen.getByText('Oct 3, 2026')).toBeTruthy()
    expect((screen.getByLabelText('Expiry date: Milk') as HTMLInputElement).value).toBe('2026-10-03')
  })
})
