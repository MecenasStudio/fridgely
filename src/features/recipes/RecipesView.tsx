import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseIngredient } from '../../domain/recipe'
import type { Recipe } from '../../domain/types'

type Props = {
  recipes: Recipe[]
  onAdd: (r: Omit<Recipe, 'id'>) => Promise<void>
  onDelete: (id: string) => Promise<void>
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

export function RecipesView({ recipes, onAdd, onDelete }: Props) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [ingredients, setIngredients] = useState('')
  const [steps, setSteps] = useState('')
  const [addFailed, setAddFailed] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setAddFailed(false)
    try {
      await onAdd({
        title: title.trim(),
        ingredients: ingredients.split('\n').map(parseIngredient).filter((i) => i !== null),
        steps: steps.split('\n').map((s) => s.trim()).filter(Boolean),
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
      {recipes.length === 0 ? (
        <p>{t('recipes.empty')}</p>
      ) : (
        <ul>
          {recipes.map((r) => (
            <li key={r.id}>
              <strong>{r.title}</strong>{' '}
              <DeleteButton title={r.title} onDelete={() => onDelete(r.id)} />
              <div>{r.ingredients.map((i) => `${i.quantity} ${i.unit} ${i.name}`).join(', ')}</div>
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
