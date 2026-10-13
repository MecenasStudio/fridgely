import { render, screen, fireEvent } from '@testing-library/react'
import i18n from '../../i18n'
import { AiError } from '../../lib/ai'
import type { Recipe } from '../../lib/ai'
import { AiPanel } from './AiPanel'

// `lib/ai.ts` imports the Supabase client, which refuses to load without env vars.
// The panel never touches the network, so a stub keeps this test offline (same
// approach as `src/lib/ai.test.ts`).
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null }, error: null }) } },
}))

const recipe: Recipe = {
  title: 'Omlet z pomidorami',
  ingredients: [{ name: 'jajka', quantity: 3, unit: 'szt' }],
  steps: ['Roztrzep jajka.', 'Usmaż na patelni.'],
  missing: ['masło'],
}

const noop = async () => {}

function renderPanel(overrides: {
  hasItems?: boolean
  ask?: (task: 'recipes_from_fridge' | 'dinner_from_expiring') => Promise<Recipe>
  onSave?: (recipe: { title: string; ingredients: { name: string; quantity: number; unit: string }[]; steps: string[] }) => Promise<void>
  onAddMissing?: (names: string[]) => Promise<void>
} = {}) {
  const ask = overrides.ask ?? (async () => recipe)
  const onSave = overrides.onSave ?? noop
  render(
    <AiPanel
      hasItems={overrides.hasItems ?? true}
      ask={ask}
      onSave={onSave}
      onAddMissing={overrides.onAddMissing}
    />,
  )
  return { ask, onSave }
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

describe('AiPanel', () => {
  it('shows the loading state and then the recipe', async () => {
    let resolve: (value: Recipe) => void = () => {}
    const ask = () => new Promise<Recipe>((r) => { resolve = r })
    renderPanel({ ask })

    fireEvent.click(screen.getByRole('button', { name: 'Recipe from my fridge' }))
    expect(screen.getByText('Putting a recipe together…')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Recipe from my fridge' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Dinner from what expires next' })).toHaveProperty('disabled', true)

    resolve(recipe)
    expect(await screen.findByText('Omlet z pomidorami')).toBeTruthy()
    expect(screen.getByText('3 szt jajka')).toBeTruthy()
    expect(screen.getByText('Roztrzep jajka.')).toBeTruthy()
    expect(screen.getByText('To buy')).toBeTruthy()
    expect(screen.getByText('masło')).toBeTruthy()
  })

  it('runs the dinner task only after the click', async () => {
    const { ask } = renderPanel({ ask: vi.fn(async () => recipe) })
    expect(ask).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Dinner from what expires next' }))
    expect(await screen.findByText('Omlet z pomidorami')).toBeTruthy()
    expect(ask).toHaveBeenCalledWith('dinner_from_expiring')
  })

  it('asks again with the same task on "Another one"', async () => {
    const ask = vi.fn<(task: 'recipes_from_fridge' | 'dinner_from_expiring') => Promise<Recipe>>(async () => recipe)
    renderPanel({ ask })
    fireEvent.click(screen.getByRole('button', { name: 'Recipe from my fridge' }))
    await screen.findByText('Omlet z pomidorami')

    fireEvent.click(screen.getByRole('button', { name: 'Another one' }))
    await screen.findByText('Omlet z pomidorami')
    expect(ask).toHaveBeenCalledTimes(2)
    expect(ask.mock.calls[1][0]).toBe('recipes_from_fridge')
  })

  it('saves the recipe without the missing list', async () => {
    const onSave = vi.fn(async () => {})
    renderPanel({ onSave })
    fireEvent.click(screen.getByRole('button', { name: 'Recipe from my fridge' }))
    await screen.findByText('Omlet z pomidorami')

    fireEvent.click(screen.getByRole('button', { name: 'Save to my recipes' }))
    expect(onSave).toHaveBeenCalledWith({ title: 'Omlet z pomidorami', ingredients: recipe.ingredients, steps: recipe.steps })
    expect(await screen.findByText('Saved to your recipes.')).toBeTruthy()
  })

  it('hints at Settings when there is no API key and hides the raw error', async () => {
    const raw = 'ai function responded 409'
    renderPanel({ ask: async () => { throw new AiError('NO_API_KEY', raw, 409) } })
    fireEvent.click(screen.getByRole('button', { name: 'Recipe from my fridge' }))

    expect(await screen.findByText('No Claude key yet. Add one in Settings to use AI.')).toBeTruthy()
    expect(screen.queryByText(raw)).toBeNull()
  })

  it('shows a generic message and lets the user retry on other errors', async () => {
    const raw = 'anthropic 500 boom'
    const ask = vi.fn(async () => { throw new Error(raw) })
    renderPanel({ ask })
    fireEvent.click(screen.getByRole('button', { name: 'Recipe from my fridge' }))

    expect(await screen.findByText('Could not get a recipe. Please try again.')).toBeTruthy()
    expect(screen.queryByText(raw)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.queryByText('Could not get a recipe. Please try again.')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Recipe from my fridge' })).toHaveLength(1)
  })

  it('says the session expired instead of blaming a missing key', async () => {
    renderPanel({
      ask: async () => {
        throw new AiError('UNAUTHENTICATED', 'ai function responded 401', 401)
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Recipe from my fridge' }))

    expect(await screen.findByText('Your session expired. Please sign in again.')).toBeTruthy()
    expect(screen.queryByText('No Claude key yet. Add one in Settings to use AI.')).toBeNull()
  })

  it('keeps the recipe on screen and alerts when saving fails', async () => {
    const raw = 'insert failed: permission denied'
    const onSave = vi.fn(async () => {
      throw new Error(raw)
    })
    renderPanel({ onSave })
    fireEvent.click(screen.getByRole('button', { name: 'Recipe from my fridge' }))
    await screen.findByText('Omlet z pomidorami')

    fireEvent.click(screen.getByRole('button', { name: 'Save to my recipes' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Could not save the recipe. Please try again.')
    expect(screen.queryByText(raw)).toBeNull()
    // The recipe stays, so the user can press save again.
    expect(screen.getByText('Omlet z pomidorami')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save to my recipes' })).toBeTruthy()
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('hides the "add missing" button when the recipe needs nothing', async () => {
    const onAddMissing = vi.fn(async () => {})
    const full: Recipe = { ...recipe, missing: [] }
    renderPanel({ ask: async () => full, onAddMissing })
    fireEvent.click(screen.getByRole('button', { name: 'Recipe from my fridge' }))
    await screen.findByText('Omlet z pomidorami')

    expect(screen.queryByRole('button', { name: 'Add missing items to the shopping list' })).toBeNull()
    expect(onAddMissing).not.toHaveBeenCalled()
  })

  it('sends the missing names to the shopping list', async () => {
    const onAddMissing = vi.fn(async () => {})
    renderPanel({ onAddMissing })
    fireEvent.click(screen.getByRole('button', { name: 'Recipe from my fridge' }))
    await screen.findByText('Omlet z pomidorami')

    fireEvent.click(screen.getByRole('button', { name: 'Add missing items to the shopping list' }))
    expect(onAddMissing).toHaveBeenCalledWith(['masło'])
    expect(await screen.findByText('Missing items added to the shopping list.')).toBeTruthy()
  })

  it('alerts when adding the missing items fails', async () => {
    const raw = 'insert denied'
    const onAddMissing = vi.fn(async () => {
      throw new Error(raw)
    })
    renderPanel({ onAddMissing })
    fireEvent.click(screen.getByRole('button', { name: 'Recipe from my fridge' }))
    await screen.findByText('Omlet z pomidorami')

    fireEvent.click(screen.getByRole('button', { name: 'Add missing items to the shopping list' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Could not add the missing items to the shopping list. Please try again.')
    expect(screen.queryByText(raw)).toBeNull()
    expect(screen.getByRole('button', { name: 'Add missing items to the shopping list' })).toBeTruthy()
  })

  it('disables both buttons and explains why when the fridge is empty', () => {
    renderPanel({ hasItems: false })
    expect(screen.getByRole('button', { name: 'Recipe from my fridge' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Dinner from what expires next' })).toHaveProperty('disabled', true)
    expect(screen.getByText('Add products to your fridge first.')).toBeTruthy()
  })
})
