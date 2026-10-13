import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatIngredient, parseIngredient } from '../../domain/recipe'
import { missingFor } from '../../domain/plan'
import { matchesQuery } from '../../domain/search'
import type { FridgeItem, Ingredient, Recipe } from '../../domain/types'

type Props = {
  recipes: Recipe[]
  /** The fridge decides which recipes can be cooked right now. */
  fridge?: FridgeItem[]
  onAdd: (r: Omit<Recipe, 'id'>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onUpdate: (id: string, patch: { title: string; ingredients: Ingredient[]; steps: string[] }) => Promise<void>
}

/**
 * Deleting is two steps on the same button: "Delete" arms it, the second click really
 * deletes. Losing focus or pressing Escape disarms it, so a stray click cannot delete.
 */
function DeleteButton({ title, onDelete }: { title: string; onDelete: () => Promise<void> }) {
  const { t } = useTranslation()
  const [armed, setArmed] = useState(false)
  const [failed, setFailed] = useState(false)

  async function click() {
    if (!armed) {
      setArmed(true)
      setFailed(false)
      return
    }
    setArmed(false)
    try {
      await onDelete()
    } catch {
      setFailed(true)
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={armed ? `${t('recipes.confirmDelete')} ${title}` : `${t('recipes.delete')} ${title}`}
        onBlur={() => setArmed(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setArmed(false)
        }}
        onClick={() => void click()}
      >
        {armed ? t('recipes.confirmDelete') : t('recipes.delete')}
      </button>
      {failed && <p role="alert">{t('recipes.deleteFailed')}</p>}
    </>
  )
}

/** Shared by the "add" form and the per-recipe edit form. */
type RecipeDraft = { title: string; ingredients: string; steps: string }

function ingredientsFromText(text: string): Ingredient[] {
  return text.split('\n').map(parseIngredient).filter((i) => i !== null)
}

function stepsFromText(text: string): string[] {
  return text.split('\n').map((step) => step.trim()).filter(Boolean)
}

/**
 * The edit form of one recipe. It starts from the stored recipe and only calls `onUpdate`
 * when the title is filled in; "Cancel" simply closes, leaving the recipe untouched.
 */
function EditRecipeForm({
  recipe,
  onUpdate,
  onClose,
}: {
  recipe: Recipe
  onUpdate: (patch: { title: string; ingredients: Ingredient[]; steps: string[] }) => Promise<void>
  onClose(): void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<RecipeDraft>({
    title: recipe.title,
    ingredients: recipe.ingredients.map(formatIngredient).join('\n'),
    steps: recipe.steps.join('\n'),
  })
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const title = draft.title.trim()
    if (!title || saving) return
    setSaving(true)
    setFailed(false)
    try {
      await onUpdate({
        title,
        ingredients: ingredientsFromText(draft.ingredients),
        steps: stepsFromText(draft.steps),
      })
      onClose()
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <input
        required
        aria-label={t('recipes.title')}
        placeholder={t('recipes.title')}
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
      />
      <textarea
        aria-label={t('recipes.ingredientsHint')}
        placeholder={t('recipes.ingredientsHint')}
        value={draft.ingredients}
        onChange={(e) => setDraft({ ...draft, ingredients: e.target.value })}
      />
      <textarea
        aria-label={t('recipes.steps')}
        placeholder={t('recipes.steps')}
        value={draft.steps}
        onChange={(e) => setDraft({ ...draft, steps: e.target.value })}
      />
      <button type="submit" disabled={draft.title.trim().length === 0 || saving}>
        {t('recipes.save')}
      </button>{' '}
      <button type="button" onClick={onClose}>
        {t('recipes.cancel')}
      </button>
      {failed && <p role="alert">{t('recipes.updateFailed')}</p>}
    </form>
  )
}

export function RecipesView({ recipes, fridge = [], onAdd, onDelete, onUpdate }: Props) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [ingredients, setIngredients] = useState('')
  const [steps, setSteps] = useState('')
  const [addFailed, setAddFailed] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [cookableOnly, setCookableOnly] = useState(false)

  const visible = recipes.filter(
    (recipe) =>
      matchesQuery(recipe.title, query) && (!cookableOnly || missingFor(recipe, fridge).length === 0),
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setAddFailed(false)
    try {
      await onAdd({
        title: title.trim(),
        ingredients: ingredientsFromText(ingredients),
        steps: stepsFromText(steps),
      })
      setTitle('')
      setIngredients('')
      setSteps('')
    } catch {
      setAddFailed(true)
    }
  }

  return (
    <section>
      <h2>{t('nav.recipes')}</h2>
      <form onSubmit={submit}>
        <input required placeholder={t('recipes.title')} value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea placeholder={t('recipes.ingredientsHint')} value={ingredients} onChange={(e) => setIngredients(e.target.value)} />
        <textarea placeholder={t('recipes.steps')} value={steps} onChange={(e) => setSteps(e.target.value)} />
        <button type="submit">{t('recipes.add')}</button>
      </form>
      {addFailed && <p role="alert">{t('recipes.addFailed')}</p>}
      {recipes.length > 0 && (
        <div>
          <label>
            {t('recipes.search')}{' '}
            <input
              type="search"
              aria-label={t('recipes.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>{' '}
          <label>
            <input
              type="checkbox"
              checked={cookableOnly}
              onChange={(e) => setCookableOnly(e.target.checked)}
            />{' '}
            {t('recipes.cookableOnly')}
          </label>{' '}
          <span role="status">{t('recipes.found', { count: visible.length })}</span>
        </div>
      )}
      {recipes.length === 0 ? (
        <p>{t('recipes.empty')}</p>
      ) : visible.length === 0 ? (
        <p>{t('recipes.noMatches')}</p>
      ) : (
        <ul>
          {visible.map((r) => (
            <li key={r.id}>
              <strong>{r.title}</strong>{' '}
              <button type="button" aria-label={`${t('recipes.edit')} ${r.title}`} onClick={() => setEditingId(r.id)}>
                {t('recipes.edit')}
              </button>{' '}
              <DeleteButton title={r.title} onDelete={() => onDelete(r.id)} />
              {editingId === r.id && (
                <EditRecipeForm
                  recipe={r}
                  onUpdate={(patch) => onUpdate(r.id, patch)}
                  onClose={() => setEditingId(null)}
                />
              )}
              <div>{r.ingredients.map((ing) => `${ing.quantity} ${ing.unit} ${ing.name}`).join(', ')}</div>
              {(r.steps ?? []).length > 0 && (
                <details>
                  <summary>{t('recipes.showSteps')}</summary>
                  <ol>
                    {r.steps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
