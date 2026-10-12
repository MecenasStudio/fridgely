import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import { useTranslation } from 'react-i18next'
import type { Recipe } from '../../domain/types'

type Props = {
  days: string[]
  recipes: Recipe[]
  plan: Record<string, string | null>
  onSet: (day: string, recipeId: string | null) => Promise<void>
  onRandomize: () => Promise<void>
}

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

export function PlanView({ days, recipes, plan, onSet, onRandomize }: Props) {
  const { t, i18n } = useTranslation()
  const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

  function onDragEnd(e: DragEndEvent) {
    if (e.over) onSet(String(e.over.id), String(e.active.id))
  }

  return (
    <section>
      <h2>{t('nav.plan')}</h2>
      <button type="button" disabled={recipes.length === 0} onClick={() => onRandomize()}>
        {t('plan.randomize')}
      </button>
      {recipes.length === 0 && <p>{t('plan.noRecipes')}</p>}
      <DndContext onDragEnd={onDragEnd}>
        <p>{recipes.map((r) => <RecipeChip key={r.id} recipe={r} />)}</p>
        <ul>
          {days.map((day) => (
            <DayCell key={day} day={day}>
              <label>
                {fmt.format(new Date(`${day}T00:00:00Z`))}{' '}
                <select value={plan[day] ?? ''} onChange={(e) => onSet(day, e.target.value || null)}>
                  <option value="">{t('plan.none')}</option>
                  {recipes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
              </label>
            </DayCell>
          ))}
        </ul>
      </DndContext>
    </section>
  )
}
