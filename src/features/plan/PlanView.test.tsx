import { render, screen, fireEvent } from '@testing-library/react'
import i18n from '../../i18n'
import { PlanView } from './PlanView'
import type { Recipe } from '../../domain/types'

const recipes: Recipe[] = [
  { id: 'r1', title: 'Omlet', ingredients: [], steps: [] },
  { id: 'r2', title: 'Zupa', ingredients: [], steps: [] },
]
const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']

beforeAll(() => i18n.changeLanguage('en'))

describe('PlanView', () => {
  it('renders a selector per day with the planned recipe selected', () => {
    render(<PlanView days={days} recipes={recipes} plan={{ '2026-10-12': 'r2' }} onSet={async () => {}} onRandomize={async () => {}} />)
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    expect(selects).toHaveLength(7)
    expect(selects[0].value).toBe('r2')
    expect(selects[1].value).toBe('')
  })

  it('calls onSet when a day is changed', () => {
    const onSet = vi.fn(async () => {})
    render(<PlanView days={days} recipes={recipes} plan={{}} onSet={onSet} onRandomize={async () => {}} />)
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'r1' } })
    expect(onSet).toHaveBeenCalledWith('2026-10-14', 'r1')
  })

  it('randomizes on click and is disabled without recipes', () => {
    const onRandomize = vi.fn(async () => {})
    const { rerender } = render(<PlanView days={days} recipes={recipes} plan={{}} onSet={async () => {}} onRandomize={onRandomize} />)
    fireEvent.click(screen.getByRole('button', { name: 'Randomize week' }))
    expect(onRandomize).toHaveBeenCalled()
    rerender(<PlanView days={days} recipes={[]} plan={{}} onSet={async () => {}} onRandomize={onRandomize} />)
    expect((screen.getByRole('button', { name: 'Randomize week' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Add some recipes first.')).toBeTruthy()
  })
})

describe('PlanView availability', () => {
  const omelette: Recipe = {
    id: 'r1',
    title: 'Omlet',
    ingredients: [
      { name: 'jajka', quantity: 3, unit: 'szt' },
      { name: 'masło', quantity: 1, unit: 'szt' },
    ],
    steps: [],
  }

  it('says everything is in when the fridge covers the recipe', () => {
    render(
      <PlanView
        days={days}
        recipes={[omelette]}
        plan={{ '2026-10-12': 'r1' }}
        fridge={[
          { id: 'a', name: 'Jajka', quantity: 6, unit: 'szt', expiresOn: null },
          { id: 'b', name: 'masło', quantity: 1, unit: 'szt', expiresOn: null },
        ]}
        onSet={async () => {}}
        onRandomize={async () => {}}
      />,
    )
    expect(screen.getByText('Everything is in')).toBeTruthy()
    expect(screen.queryByText(/Missing:/)).toBeNull()
  })

  it('counts the missing ingredients and says nothing for empty days', () => {
    render(
      <PlanView
        days={days}
        recipes={[omelette]}
        plan={{ '2026-10-12': 'r1' }}
        fridge={[{ id: 'a', name: 'jajka', quantity: 1, unit: 'szt', expiresOn: null }]}
        onSet={async () => {}}
        onRandomize={async () => {}}
      />,
    )
    // jajka are too few and masło is absent, so two ingredients are missing.
    expect(screen.getByText('Missing: 2 ingredients')).toBeTruthy()
    expect(screen.queryByText('Everything is in')).toBeNull()
  })

  it('treats a missing fridge prop as an empty fridge', () => {
    render(<PlanView days={days} recipes={[omelette]} plan={{ '2026-10-12': 'r1' }} onSet={async () => {}} onRandomize={async () => {}} />)
    expect(screen.getByText('Missing: 2 ingredients')).toBeTruthy()
  })
})
