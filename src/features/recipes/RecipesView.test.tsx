import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import i18n from '../../i18n'
import { RecipesView } from './RecipesView'
import type { Recipe } from '../../domain/types'

const noop = async () => {}

const withSteps: Recipe = {
  id: 'r1',
  title: 'Omlet',
  ingredients: [{ name: 'jajka', quantity: 3, unit: 'szt' }],
  steps: ['Roztrzep jajka.', 'Usmaż.'],
}

const withoutSteps: Recipe = {
  id: 'r2',
  title: 'Kanapka',
  ingredients: [{ name: 'chleb', quantity: 2, unit: 'kromki' }],
  steps: [],
}

function renderView(recipes: Recipe[], onDelete = vi.fn(noop), onAdd = vi.fn(noop), onUpdate = vi.fn(noop)) {
  render(<RecipesView recipes={recipes} onAdd={onAdd} onDelete={onDelete} onUpdate={onUpdate} />)
  return { onDelete, onAdd, onUpdate }
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

describe('RecipesView', () => {
  it('shows the steps of a recipe inside a details element', () => {
    renderView([withSteps])
    const details = screen.getByText('Show steps').closest('details')
    expect(details).toBeTruthy()

    const steps = Array.from(details!.querySelectorAll('ol li')).map((li) => li.textContent)
    expect(steps).toEqual(['Roztrzep jajka.', 'Usmaż.'])
  })

  it('renders no details element when a recipe has no steps', () => {
    renderView([withoutSteps])
    expect(screen.queryByText('Show steps')).toBeNull()
    expect(screen.getByText('Kanapka')).toBeTruthy()
  })

  it('deletes only on the second click of the same button', () => {
    const onDelete = vi.fn(noop)
    renderView([withSteps], onDelete)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Omlet' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Really delete? Omlet' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Really delete? Omlet' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledWith('r1')
  })

  it('cancels the confirmation on Escape and on blur', () => {
    const onDelete = vi.fn(noop)
    renderView([withSteps], onDelete)

    const deleteButton = screen.getByRole('button', { name: 'Delete Omlet' })
    fireEvent.click(deleteButton)
    fireEvent.keyDown(deleteButton, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Delete Omlet' })).toBeTruthy()
    expect(onDelete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Omlet' }))
    fireEvent.blur(screen.getByRole('button', { name: 'Really delete? Omlet' }))
    expect(screen.getByRole('button', { name: 'Delete Omlet' })).toBeTruthy()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('reports a failed delete and a failed add', async () => {
    const onDelete = vi.fn(async () => {
      throw new Error('delete denied')
    })
    const onAdd = vi.fn(async () => {
      throw new Error('insert denied')
    })
    renderView([withSteps], onDelete, onAdd)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Omlet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Really delete? Omlet' }))
    expect(await screen.findByText('Could not delete the recipe. Please try again.')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('Recipe title'), { target: { value: 'Nowy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add recipe' }))
    expect(await screen.findByText('Could not add the recipe. Please try again.')).toBeTruthy()
  })
})

describe('RecipesView editing', () => {
  const recipe: Recipe = {
    id: 'r1',
    title: 'Omlet',
    ingredients: [
      { name: 'jajka', quantity: 3, unit: 'szt' },
      { name: 'mleko', quantity: 0.5, unit: 'l' },
    ],
    steps: ['Roztrzep jajka.', 'Usmaż.'],
  }

  it('opens a prefilled form and saves the edited recipe', async () => {
    const onUpdate = vi.fn(noop)
    renderView([recipe], vi.fn(noop), vi.fn(noop), onUpdate)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Omlet' }))

    const titleField = screen.getByLabelText('Recipe title') as HTMLInputElement
    expect(titleField.value).toBe('Omlet')
    // Ingredients come back in the same "qty unit name" shape the parser reads.
    expect((screen.getByLabelText(/Ingredients/) as HTMLTextAreaElement).value).toBe('3 jajka\n0.5 l mleko')
    expect((screen.getByLabelText('Steps, one per line') as HTMLTextAreaElement).value).toBe('Roztrzep jajka.\nUsmaż.')

    fireEvent.change(titleField, { target: { value: 'Omlet z serem' } })
    fireEvent.change(screen.getByLabelText(/Ingredients/), { target: { value: '4 jajka\n0.5 l mleko\n100 g ser' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('r1', {
        title: 'Omlet z serem',
        ingredients: [
          { name: 'jajka', quantity: 4, unit: 'szt' },
          { name: 'mleko', quantity: 0.5, unit: 'l' },
          { name: 'ser', quantity: 100, unit: 'g' },
        ],
        steps: ['Roztrzep jajka.', 'Usmaż.'],
      }),
    )
    // The form closes on success.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).toBeNull())
  })

  it('cancels without saving', () => {
    const onUpdate = vi.fn(noop)
    renderView([recipe], vi.fn(noop), vi.fn(noop), onUpdate)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Omlet' }))
    fireEvent.change(screen.getByLabelText('Recipe title'), { target: { value: 'Cokolwiek' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.getByText('Omlet')).toBeTruthy()
  })

  it('blocks an empty title and an empty save', () => {
    const onUpdate = vi.fn(noop)
    renderView([recipe], vi.fn(noop), vi.fn(noop), onUpdate)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Omlet' }))
    const save = screen.getByRole('button', { name: 'Save' })
    fireEvent.change(screen.getByLabelText('Recipe title'), { target: { value: '   ' } })
    expect(save).toHaveProperty('disabled', true)

    fireEvent.click(save)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('reports a failed update and keeps the form open', async () => {
    const onUpdate = vi.fn(async () => {
      throw new Error('update denied')
    })
    renderView([recipe], vi.fn(noop), vi.fn(noop), onUpdate)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Omlet' }))
    fireEvent.change(screen.getByLabelText('Recipe title'), { target: { value: 'Nowy tytuł' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Could not save the changes. Please try again.')).toBeTruthy()
    expect(screen.queryByText('update denied')).toBeNull()
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })
})
