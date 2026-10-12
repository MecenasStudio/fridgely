import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseIngredient } from '../../domain/recipe'
import type { Recipe } from '../../domain/types'

type Props = {
  recipes: Recipe[]
  onAdd: (r: Omit<Recipe, 'id'>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function RecipesView({ recipes, onAdd, onDelete }: Props) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [ingredients, setIngredients] = useState('')
  const [steps, setSteps] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await onAdd({
      title: title.trim(),
      ingredients: ingredients.split('\n').map(parseIngredient).filter((i) => i !== null),
      steps: steps.split('\n').map((s) => s.trim()).filter(Boolean),
    })
    setTitle('')
    setIngredients('')
    setSteps('')
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
      {recipes.length === 0 ? (
        <p>{t('recipes.empty')}</p>
      ) : (
        <ul>
          {recipes.map((r) => (
            <li key={r.id}>
              <strong>{r.title}</strong>{' '}
              <button type="button" onClick={() => onDelete(r.id)} aria-label={`${t('recipes.delete')} ${r.title}`}>×</button>
              <div>{r.ingredients.map((i) => `${i.quantity} ${i.unit} ${i.name}`).join(', ')}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
