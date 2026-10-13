import { useState } from 'react'
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import { useTranslation } from 'react-i18next'
import { consumePlan, type ConsumeResult } from '../../domain/consume'
import { missingFor } from '../../domain/plan'
import type { FridgeItem, Recipe } from '../../domain/types'

type Props = {
  days: string[]
  recipes: Recipe[]
  plan: Record<string, string | null>
  fridge?: FridgeItem[]
  /** Week range, already formatted in the interface language. */
  weekLabel?: string
  isCurrentWeek?: boolean
  /** `weeks` is -1 for the previous week and 1 for the next one. */
  onShiftWeek?: (weeks: number) => void
  onThisWeek?: () => void
  /** Writes the outcome of a cooked meal; the preview is shown before this is called. */
  onConsume?: (change: ConsumeResult) => Promise<void>
  onSet: (day: string, recipeId: string | null) => Promise<void>
  onRandomize: () => Promise<void>
}

/** Amount the preview will take out of a row, rounded like the domain does. */
const round1 = (n: number) => Math.round(n * 1000) / 1000

function RecipeChip({ recipe }: { recipe: Recipe }) {  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: recipe.id })
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined
  return (
    <span ref={setNodeRef} style={style} {...listeners} {...attributes} role="presentation">
      {recipe.title}{' '}
    </span>
  )
}

function DayCell({ day, children }: { day: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: day })
  return (
    <li ref={setNodeRef} data-over={isOver}>
      {children}
    </li>
  )
}

export function PlanView({
  days,
  recipes,
  plan,
  fridge = [],
  weekLabel,
  isCurrentWeek = false,
  onShiftWeek,
  onThisWeek,
  onConsume,
  onSet,
  onRandomize,
}: Props) {
  const { t, i18n } = useTranslation()
  const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const [preview, setPreview] = useState<{ day: string; change: ConsumeResult } | null>(null)
  const [consuming, setConsuming] = useState(false)
  const [consumeFailed, setConsumeFailed] = useState(false)

  function onDragEnd(e: DragEndEvent) {
    if (e.over) onSet(String(e.over.id), String(e.active.id))
  }

  /** Nothing is written until the user confirms the preview. */
  async function confirmConsume() {
    if (!preview || !onConsume || consuming) return
    setConsuming(true)
    setConsumeFailed(false)
    try {
      await onConsume(preview.change)
      setPreview(null)
    } catch {
      // The preview stays, so the user can look and try again deliberately.
      setConsumeFailed(true)
    } finally {
      setConsuming(false)
    }
  }

  return (
    <section>
      <h2>{t('nav.plan')}</h2>
      {onShiftWeek && (
        <p>
          <button type="button" onClick={() => onShiftWeek(-1)}>
            {t('plan.previousWeek')}
          </button>{' '}
          <button type="button" disabled={isCurrentWeek} onClick={() => onThisWeek?.()}>
            {t('plan.thisWeek')}
          </button>{' '}
          <button type="button" onClick={() => onShiftWeek(1)}>
            {t('plan.nextWeek')}
          </button>{' '}
          {weekLabel && <p role="status">{weekLabel}</p>}
        </p>
      )}
      <button type="button" disabled={recipes.length === 0} onClick={() => onRandomize()}>
        {t('plan.randomize')}
      </button>
      {recipes.length === 0 && <p>{t('plan.noRecipes')}</p>}
      <DndContext onDragEnd={onDragEnd}>
        <p>{recipes.map((r) => <RecipeChip key={r.id} recipe={r} />)}</p>
        <ul>
          {days.map((day) => {
            const recipe = recipes.find((r) => r.id === plan[day]) ?? null
            const missing = recipe ? missingFor(recipe, fridge) : []
            return (
              <DayCell key={day} day={day}>
                <label>
                  {fmt.format(new Date(`${day}T00:00:00Z`))}{' '}
                  <select value={plan[day] ?? ''} onChange={(e) => onSet(day, e.target.value || null)}>
                    <option value="">{t('plan.none')}</option>
                    {recipes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                  </select>
                </label>
                {recipe && (
                  <span> {missing.length === 0 ? t('plan.allInFridge') : t('plan.missing', { count: missing.length })}</span>
                )}
                {recipe && onConsume && (
                  <>
                    {' '}
                    <button type="button" onClick={() => setPreview({ day, change: consumePlan(recipe, fridge) })}>
                      {t('plan.cooked')}
                    </button>
                  </>
                )}
                {preview?.day === day && (
                  <div>
                    <p role="status">{t('plan.consumePreview')}</p>
                    <ul>
                      {preview.change.updates.map((change) => {
                        const item = fridge.find((f) => f.id === change.id)
                        return (
                          <li key={change.id}>
                            {t('plan.consumeUse', {
                              name: item?.name ?? '',
                              quantity: round1(Number(item?.quantity ?? 0) - change.newQuantity),
                              unit: item?.unit ?? '',
                            })}
                          </li>
                        )
                      })}
                      {preview.change.deletes.map((id) => {
                        const item = fridge.find((f) => f.id === id)
                        return (
                          <li key={id}>
                            {t('plan.consumeUse', {
                              name: item?.name ?? '',
                              quantity: item?.quantity ?? 0,
                              unit: item?.unit ?? '',
                            })}
                          </li>
                        )
                      })}
                      {preview.change.updates.length + preview.change.deletes.length === 0 && (
                        <li>{t('plan.consumeNothing')}</li>
                      )}
                    </ul>
                    <button type="button" disabled={consuming} onClick={() => void confirmConsume()}>
                      {t('plan.confirm')}
                    </button>{' '}
                    <button type="button" onClick={() => setPreview(null)}>
                      {t('plan.cancel')}
                    </button>
                    {consumeFailed && <p role="alert">{t('plan.consumeFailed')}</p>}
                  </div>
                )}
              </DayCell>
            )
          })}
        </ul>
      </DndContext>
    </section>
  )
}
