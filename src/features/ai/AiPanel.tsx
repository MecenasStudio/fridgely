import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AiError } from '../../lib/ai'
import type { Recipe } from '../../lib/ai'
import type { Ingredient } from '../../domain/types'

type Task = 'recipes_from_fridge' | 'dinner_from_expiring'

type Props = {
  hasItems: boolean
  ask(task: Task): Promise<Recipe>
  onSave(recipe: { title: string; ingredients: Ingredient[]; steps: string[] }): Promise<void>
}

// Only these codes get their own wording; everything else is the generic message,
// and the raw server text is never rendered.
const MESSAGE_KEY: Partial<Record<string, string>> = {
  NO_API_KEY: 'ai.noKey',
  UNAUTHENTICATED: 'ai.noKey',
}

export function AiPanel({ hasItems, ask, onSave }: Props) {
  const { t } = useTranslation()
  const [result, setResult] = useState<{ task: Task; recipe: Recipe } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)

  async function run(task: Task) {
    setLoading(true)
    setError(null)
    setSaved(false)
    setResult(null)
    try {
      const recipe = await ask(task)
      setResult({ task, recipe })
    } catch (cause) {
      setError(cause)
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    if (!result) return
    await onSave({
      title: result.recipe.title,
      ingredients: result.recipe.ingredients,
      steps: result.recipe.steps,
    })
    setSaved(true)
    setResult(null)
  }

  const errorKey = error instanceof AiError ? MESSAGE_KEY[error.code] : undefined
  const errorText = errorKey ? t(errorKey) : t('ai.genericError')

  return (
    <section>
      <h2>{t('nav.ai')}</h2>

      <button type="button" disabled={!hasItems || loading} onClick={() => run('recipes_from_fridge')}>
        {t('ai.fromFridge')}
      </button>{' '}
      <button type="button" disabled={!hasItems || loading} onClick={() => run('dinner_from_expiring')}>
        {t('ai.dinnerFromExpiring')}
      </button>

      {!hasItems && <p>{t('ai.emptyFridge')}</p>}
      {loading && <p>{t('ai.loading')}</p>}

      {error !== null && !loading && (
        <div>
          <p>{errorText}</p>
          <button type="button" onClick={() => setError(null)}>
            {t('ai.retry')}
          </button>
        </div>
      )}

      {result && !loading && (
        <>
          <h3>{result.recipe.title}</h3>

          <h4>{t('ai.ingredients')}</h4>
          <ul>
            {result.recipe.ingredients.map((ing, index) => (
              <li key={`${ing.name}-${index}`}>
                {ing.quantity} {ing.unit} {ing.name}
              </li>
            ))}
          </ul>

          <h4>{t('ai.steps')}</h4>
          <ol>
            {result.recipe.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>

          {result.recipe.missing.length > 0 && (
            <>
              <h4>{t('ai.missing')}</h4>
              <ul>
                {result.recipe.missing.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </>
          )}

          <button type="button" disabled={loading} onClick={() => save()}>
            {t('ai.save')}
          </button>{' '}
          <button type="button" disabled={loading} onClick={() => run(result.task)}>
            {t('ai.next')}
          </button>
        </>
      )}

      {saved && <p>{t('ai.saved')}</p>}
    </section>
  )
}
