import { render, screen, fireEvent } from '@testing-library/react'
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

function renderView(recipes: Recipe[], onDelete = vi.fn(noop), onAdd = vi.fn(noop)) {
  render(<RecipesView recipes={recipes} onAdd={onAdd} onDelete={onDelete} />)
  return { onDelete, onAdd }
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
