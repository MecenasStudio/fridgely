import { useState } from 'react'
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import { useTranslation } from 'react-i18next'
import { consumePlan, type ConsumeResult } from '../../domain/consume'
import { normalizeName } from '../../domain/fridge'
import { missingFor } from '../../domain/plan'
import type { FridgeItem, Recipe } from '../../domain/types'
import { LoadError } from '../common/LoadError'

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
  /** True until the first load settles: shows "Loading…" instead of empty days. */
  loading?: boolean
  /** True when the last load failed. */
  error?: boolean
  /** Retries the failing load. */
  onReload?: () => void
  onSet: (day: string, recipeId: string | null) => Promise<void>
  onRandomize: () => Promise<void>
}

/** Amount the preview will take out of a row, rounded like the domain does. */
const round1 = (n: number) => Math.round(n * 1000) / 1000

function RecipeChip({ recipe }: { recipe: Recipe }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: recipe.id })
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
  loading = false,
  error = false,
  onReload,
  onSet,
  onRandomize,
}: Props) {
  const { t, i18n } = useTranslation()
  const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  // The snapshot is taken when the preview opens: what the user sees is what will be used,
  // even if Realtime refreshes the list while the preview is on screen.
  const [preview, setPreview] = useState<{ day: string; snapshot: FridgeItem[] } | null>(null)
  const [consuming, setConsuming] = useState(false)
  // Scoped to a day: a failure in one row must not paint an alert on all seven.
  const [consumeNotice, setConsumeNotice] = useState<{ day: string; kind: 'failed' | 'stale' } | null>(null)

  function onDragEnd(e: DragEndEvent) {
    if (e.over) onSet(String(e.over.id), String(e.active.id))
  }

  /** The rows the preview was built from, as a plain `id: quantity` map. */
  function snapshotQuantities(snapshot: FridgeItem[]): Map<string, number> {
    return new Map(snapshot.map((item) => [item.id, item.quantity]))
  }

  /** The rows the snapshot was built from, as a plain `id: identity` map. */
  function snapshotRows(snapshot: FridgeItem[]): Map<string, string> {
    return new Map(snapshot.map((item) => [item.id, rowIdentity(item)]))
  }

  function rowIdentity(item: FridgeItem): string {
    return `${normalizeName(item.name)}|${item.unit}|${item.expiresOn ?? ''}`
  }

  /**
   * True when the fridge no longer matches the snapshot the user looked at: a row was added
   * or removed, its identity changed, or its quantity moved. Writing the snapshot then would
   * mean subtracting from a list the user never saw.
   */
  function isStale(snapshot: FridgeItem[]): boolean {
    if (fridge.length !== snapshot.length) return true
    const rows = snapshotRows(snapshot)
    const quantities = snapshotQuantities(snapshot)
    return fridge.some((item) => {
      const identity = rows.get(item.id)
      if (identity === undefined || identity !== rowIdentity(item)) return true
      return quantities.get(item.id) !== item.quantity
    })
  }

  /**
   * Nothing is written until the user confirms the preview.
   *
   * The writes are not a transaction, so a failure in the middle can leave part of the
   * subtraction applied. In that case the preview is closed (no one-click retry that would
   * subtract twice), the fridge is reloaded to show the real state, and the user is told to
   * check before trying again.
   */
  async function confirmConsume() {
    if (!preview || !onConsume || consuming) return
    setConsumeNotice(null)

    if (isStale(preview.snapshot)) {
      setPreview(null)
      setConsumeNotice({ day: preview.day, kind: 'stale' })
      return
    }

    setConsuming(true)
    try {
      const recipe = recipeForDay(preview.day)
      // The recipe can be deleted (or moved to another day) while the preview is on screen.
      if (!recipe) throw new Error('recipe is gone')
      await onConsume(consumePlan(recipe, preview.snapshot))
      setPreview(null)
    } catch {
      setPreview(null)
      setConsumeNotice({ day: preview.day, kind: 'failed' })
      onReload?.()
    } finally {
      setConsuming(false)
    }
  }

  function recipeForDay(day: string): Recipe | null {
    return recipes.find((r) => r.id === plan[day]) ?? null
  }

  if (loading) {
    return (
      <section>
        <h2>{t('nav.plan')}</h2>
        <p role="status">{t('common.loading')}</p>
      </section>
    )
  }

  // The preview is always computed from the snapshot the user opened, never from the live
  // list, so the numbers on screen cannot change under their eyes.
  const previewRecipe = preview ? recipeForDay(preview.day) : null
  const previewChange: ConsumeResult =
    preview && previewRecipe ? consumePlan(previewRecipe, preview.snapshot) : { updates: [], deletes: [] }

  return (
    <section>
      <h2>{t('nav.plan')}</h2>
      <LoadError error={error} onRetry={onReload} />
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
                    <button
                      type="button"
                      disabled={consuming}
                      onClick={() => {
                        setConsumeNotice(null)
                        setPreview({ day, snapshot: fridge })
                      }}
                    >
                      {t('plan.cooked')}
                    </button>
                  </>
                )}
                {preview?.day === day && (
                  <div>
                    <p role="status">{t('plan.consumePreview')}</p>
                    <ul>
                      {previewChange.updates.map((change) => {
                        const item = preview.snapshot.find((f) => f.id === change.id)
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
                      {previewChange.deletes.map((id) => {
                        const item = preview.snapshot.find((f) => f.id === id)
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
                      {previewChange.updates.length + previewChange.deletes.length === 0 && (
                        <li>{t('plan.consumeNothing')}</li>
                      )}
                    </ul>
                    <button type="button" disabled={consuming} onClick={() => void confirmConsume()}>
                      {t('plan.confirm')}
                    </button>{' '}
                    <button type="button" onClick={() => setPreview(null)}>
                      {t('plan.cancel')}
                    </button>
                  </div>
                )}
                {consumeNotice?.day === day && (
                  <p role="alert">
                    {consumeNotice.kind === 'failed' ? t('plan.consumeFailed') : t('plan.consumeStale')}
                  </p>
                )}
              </DayCell>
            )
          })}
        </ul>
      </DndContext>
    </section>
  )
}
