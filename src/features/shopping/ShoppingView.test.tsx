import { render, screen, fireEvent } from '@testing-library/react'
import i18n from '../../i18n'
import { ShoppingView } from './ShoppingView'

beforeAll(() => i18n.changeLanguage('en'))

describe('ShoppingView', () => {
  it('shows an empty state and a generate button', () => {
    const onGenerate = vi.fn(async () => {})
    render(<ShoppingView items={[]} onToggle={async () => {}} onGenerate={onGenerate} />)
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
        onGenerate={async () => {}}
      />,
    )
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onToggle).toHaveBeenCalledWith('a', true)
  })
})
