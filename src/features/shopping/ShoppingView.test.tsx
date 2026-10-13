import { render, screen, fireEvent } from '@testing-library/react'
import i18n from '../../i18n'
import { ShoppingView } from './ShoppingView'

const noop = async () => {}

beforeAll(() => i18n.changeLanguage('en'))

describe('ShoppingView', () => {
  it('shows an empty state and a generate button', () => {
    const onGenerate = vi.fn(async () => {})
    render(<ShoppingView items={[]} onToggle={noop} onGenerate={onGenerate} onMoveChecked={noop} />)
    expect(screen.getByText('Nothing to buy.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Build list from plan' }))
    expect(onGenerate).toHaveBeenCalled()
  })

  it('toggles an item', () => {
    const onToggle = vi.fn(async () => {})
    render(
      <ShoppingView
        items={[{ id: 'a', name: 'milk', quantity: 1, unit: 'l', checked: false }]}
        onToggle={onToggle}
        onGenerate={noop}
        onMoveChecked={noop}
      />,
    )
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onToggle).toHaveBeenCalledWith('a', true)
  })

  it('shows the move button only when something is checked', () => {
    const { unmount } = render(
      <ShoppingView
        items={[{ id: 'a', name: 'milk', quantity: 1, unit: 'l', checked: false }]}
        onToggle={noop}
        onGenerate={noop}
        onMoveChecked={noop}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Move bought items to the fridge' })).toBeNull()
    unmount()

    render(
      <ShoppingView
        items={[{ id: 'a', name: 'milk', quantity: 1, unit: 'l', checked: true }]}
        onToggle={noop}
        onGenerate={noop}
        onMoveChecked={noop}
      />,
    )
    expect(screen.getByRole('button', { name: 'Move bought items to the fridge' })).toBeTruthy()
  })

  it('moves the checked rows and confirms', async () => {
    const onMoveChecked = vi.fn(async () => {})
    render(
      <ShoppingView
        items={[
          { id: 'a', name: 'milk', quantity: 1, unit: 'l', checked: true },
          { id: 'b', name: 'bread', quantity: 1, unit: 'szt', checked: false },
        ]}
        onToggle={noop}
        onGenerate={noop}
        onMoveChecked={onMoveChecked}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Move bought items to the fridge' }))
    expect(onMoveChecked).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('The bought items are in your fridge.')).toBeTruthy()
  })

  it('alerts when moving fails', async () => {
    const raw = 'delete denied'
    const onMoveChecked = vi.fn(async () => {
      throw new Error(raw)
    })
    render(
      <ShoppingView
        items={[{ id: 'a', name: 'milk', quantity: 1, unit: 'l', checked: true }]}
        onToggle={noop}
        onGenerate={noop}
        onMoveChecked={onMoveChecked}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Move bought items to the fridge' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Could not move the bought items. The list is unchanged.')
    expect(screen.queryByText(raw)).toBeNull()
    // The list is untouched, so the rows and the button are still there.
    expect(screen.getByText(/milk/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Move bought items to the fridge' })).toBeTruthy()
  })
})
