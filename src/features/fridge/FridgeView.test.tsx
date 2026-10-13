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
})
