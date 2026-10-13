import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

describe('PlanView week navigation', () => {
  it('shifts back and forward and returns to this week', () => {
    const onShiftWeek = vi.fn()
    const onThisWeek = vi.fn()
    render(
      <PlanView
        days={days}
        recipes={recipes}
        plan={{}}
        weekLabel="Oct 12 – Oct 18, 2026"
        isCurrentWeek={false}
        onShiftWeek={onShiftWeek}
        onThisWeek={onThisWeek}
        onSet={async () => {}}
        onRandomize={async () => {}}
      />,
    )

    expect(screen.getByText('Oct 12 – Oct 18, 2026')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))
    expect(onShiftWeek).toHaveBeenCalledWith(-1)

    fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
    expect(onShiftWeek).toHaveBeenCalledWith(1)

    fireEvent.click(screen.getByRole('button', { name: 'This week' }))
    expect(onThisWeek).toHaveBeenCalledTimes(1)
  })

  it('disables "this week" while the current week is shown and hides the bar without handlers', () => {
    const { unmount } = render(
      <PlanView
        days={days}
        recipes={recipes}
        plan={{}}
        weekLabel="Oct 12 – Oct 18, 2026"
        isCurrentWeek
        onShiftWeek={() => {}}
        onThisWeek={() => {}}
        onSet={async () => {}}
        onRandomize={async () => {}}
      />,
    )
    expect((screen.getByRole('button', { name: 'This week' }) as HTMLButtonElement).disabled).toBe(true)
    unmount()

    render(<PlanView days={days} recipes={recipes} plan={{}} onSet={async () => {}} onRandomize={async () => {}} />)
    expect(screen.queryByRole('button', { name: 'Previous week' })).toBeNull()
  })
})

describe('PlanView cooking', () => {
  const omelette: Recipe = {
    id: 'r1',
    title: 'Omlet',
    ingredients: [{ name: 'jajka', quantity: 3, unit: 'szt' }],
    steps: [],
  }
  const fridge = [{ id: 'f1', name: 'jajka', quantity: 6, unit: 'szt', expiresOn: null }]

  it('previews what it will take and only writes after confirming', async () => {
    const onConsume = vi.fn(async () => {})
    render(
      <PlanView
        days={days}
        recipes={[omelette]}
        plan={{ '2026-10-12': 'r1' }}
        fridge={fridge}
        onConsume={onConsume}
        onSet={async () => {}}
        onRandomize={async () => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cooked' }))
    expect(screen.getByText('I will use from the fridge:')).toBeTruthy()
    expect(screen.getByText('jajka: 3 szt')).toBeTruthy()
    expect(onConsume).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(onConsume).toHaveBeenCalledTimes(1))
    // The payload is computed from the snapshot, not from a re-read of the live list.
    expect(onConsume).toHaveBeenCalledWith(expect.objectContaining({ updates: [{ id: 'f1', newQuantity: 3 }], deletes: [] }))
  })

  it('cancels without writing', () => {
    const onConsume = vi.fn(async () => {})
    render(
      <PlanView
        days={days}
        recipes={[omelette]}
        plan={{ '2026-10-12': 'r1' }}
        fridge={fridge}
        onConsume={onConsume}
        onSet={async () => {}}
        onRandomize={async () => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cooked' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onConsume).not.toHaveBeenCalled()
    expect(screen.queryByText('I will use from the fridge:')).toBeNull()
  })

  it('shows the whole row when it will be used up, and alerts on failure', async () => {
    const onConsume = vi.fn(async () => {
      throw new Error('update denied')
    })
    const onReload = vi.fn()
    render(
      <PlanView
        days={days}
        recipes={[omelette]}
        plan={{ '2026-10-12': 'r1' }}
        fridge={[{ id: 'f1', name: 'jajka', quantity: 2, unit: 'szt', expiresOn: null }]}
        onConsume={onConsume}
        onReload={onReload}
        onSet={async () => {}}
        onRandomize={async () => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cooked' }))
    expect(screen.getByText('jajka: 2 szt')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    // dnd-kit's live region makes `findByRole('alert')` slow, so the message itself is awaited.
    expect(
      await screen.findByText('Part of the changes may have been saved. Check the fridge before trying again.'),
    ).toBeTruthy()
    // The message belongs to the day it happened on, not to every row.
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1)
    expect(screen.queryByText('update denied')).toBeNull()
    // A failed write closes the preview and reloads the fridge: there must be no one-click
    // retry that would subtract the same ingredients twice.
    expect(onReload).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('I will use from the fridge:')).toBeNull()
  })

  it('refuses to write when the fridge changed while the preview was open', async () => {
    const onConsume = vi.fn(async () => {})
    const onReload = vi.fn()
    const { rerender } = render(
      <PlanView
        days={days}
        recipes={[omelette]}
        plan={{ '2026-10-12': 'r1' }}
        fridge={[{ id: 'f1', name: 'jajka', quantity: 6, unit: 'szt', expiresOn: null }]}
        onConsume={onConsume}
        onReload={onReload}
        onSet={async () => {}}
        onRandomize={async () => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cooked' }))
    expect(screen.getByText('jajka: 3 szt')).toBeTruthy()

    // Realtime brings a changed quantity for the same row while the preview is on screen.
    rerender(
      <PlanView
        days={days}
        recipes={[omelette]}
        plan={{ '2026-10-12': 'r1' }}
        fridge={[{ id: 'f1', name: 'jajka', quantity: 4, unit: 'szt', expiresOn: null }]}
        onConsume={onConsume}
        onReload={onReload}
        onSet={async () => {}}
        onRandomize={async () => {}}
      />,
    )

    // The numbers on screen still come from the snapshot …
    expect(screen.getByText('jajka: 3 szt')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('The fridge changed. Open the preview again.')).toBeTruthy()
    expect(onConsume).not.toHaveBeenCalled()
    expect(screen.queryByText('I will use from the fridge:')).toBeNull()
  })

  it('refuses to write when a row disappeared while the preview was open', async () => {
    const onConsume = vi.fn(async () => {})
    const { rerender } = render(
      <PlanView
        days={days}
        recipes={[omelette]}
        plan={{ '2026-10-12': 'r1' }}
        fridge={[
          { id: 'f1', name: 'jajka', quantity: 6, unit: 'szt', expiresOn: null },
          { id: 'f2', name: 'masło', quantity: 1, unit: 'szt', expiresOn: null },
        ]}
        onConsume={onConsume}
        onSet={async () => {}}
        onRandomize={async () => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cooked' }))
    rerender(
      <PlanView
        days={days}
        recipes={[omelette]}
        plan={{ '2026-10-12': 'r1' }}
        fridge={[{ id: 'f1', name: 'jajka', quantity: 6, unit: 'szt', expiresOn: null }]}
        onConsume={onConsume}
        onSet={async () => {}}
        onRandomize={async () => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('The fridge changed. Open the preview again.')).toBeTruthy()
    expect(onConsume).not.toHaveBeenCalled()
  })

  it('writes the change computed from the snapshot on the happy path', async () => {
    const onConsume = vi.fn(async () => {})
    render(
      <PlanView
        days={days}
        recipes={[omelette]}
        plan={{ '2026-10-12': 'r1' }}
        fridge={[
          { id: 'f1', name: 'jajka', quantity: 6, unit: 'szt', expiresOn: null },
          { id: 'f2', name: 'masło', quantity: 1, unit: 'szt', expiresOn: null },
        ]}
        onConsume={onConsume}
        onSet={async () => {}}
        onRandomize={async () => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cooked' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(onConsume).toHaveBeenCalledTimes(1))
    expect(onConsume).toHaveBeenCalledWith({ updates: [{ id: 'f1', newQuantity: 3 }], deletes: [] })
    // The preview closes and no error is shown.
    expect(screen.queryByText('I will use from the fridge:')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says so when the recipe uses nothing from the fridge', () => {
    render(
      <PlanView
        days={days}
        recipes={[omelette]}
        plan={{ '2026-10-12': 'r1' }}
        fridge={[]}
        onConsume={vi.fn(async () => {})}
        onSet={async () => {}}
        onRandomize={async () => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cooked' }))
    expect(screen.getByText('Nothing comes out of the fridge.')).toBeTruthy()
  })

  it('hides the cooked button when there is no handler', () => {
    render(<PlanView days={days} recipes={[omelette]} plan={{ '2026-10-12': 'r1' }} onSet={async () => {}} onRandomize={async () => {}} />)
    expect(screen.queryByRole('button', { name: 'Cooked' })).toBeNull()
  })
})
