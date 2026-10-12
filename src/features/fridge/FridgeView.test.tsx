import { render, screen, within, fireEvent } from '@testing-library/react'
import i18n from '../../i18n'
import { FridgeView } from './FridgeView'
import type { FridgeItem } from '../../domain/types'

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
})
