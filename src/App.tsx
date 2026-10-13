import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthGate } from './features/auth/AuthGate'
import { useHousehold } from './features/household/useHousehold'
import { HouseholdSetup } from './features/household/HouseholdSetup'
import { FridgePage } from './features/fridge/FridgePage'
import { AiPage } from './features/ai/AiPage'
import { RecipesPage } from './features/recipes/RecipesPage'
import { PlanPage } from './features/plan/PlanPage'
import { ShoppingPage } from './features/shopping/ShoppingPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { ErrorBoundary } from './features/common/ErrorBoundary'
import { useOnline } from './lib/useOnline'
import { supabase } from './lib/supabase'

const TABS = ['fridge', 'recipes', 'plan', 'shopping', 'ai', 'settings'] as const
type Tab = (typeof TABS)[number]

function Home({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation()
  const h = useHousehold(userId)
  const online = useOnline()
  const [tab, setTab] = useState<Tab>('fridge')
  if (h.loading) return null
  if (!h.householdId) return <HouseholdSetup h={h} />
  const id = h.householdId

  return (
    <main>
      {!online && <p role="status">{t('common.offline')}</p>}
      <header>
        <h1>{t('app.name')}</h1>
        <nav>
          {TABS.map((k) => (
            <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
              {t(`nav.${k}`)}
            </button>
          ))}
        </nav>
      </header>
      <ErrorBoundary key={tab}>
        {tab === 'fridge' && <FridgePage householdId={id} />}
        {tab === 'recipes' && <RecipesPage householdId={id} />}
        {tab === 'plan' && <PlanPage householdId={id} />}
        {tab === 'shopping' && <ShoppingPage householdId={id} />}
        {tab === 'ai' && <AiPage householdId={id} />}
        {tab === 'settings' && <SettingsPage userId={userId} />}
      </ErrorBoundary>
      <footer>
        <button type="button" onClick={() => supabase.auth.signOut()}>{t('auth.signOut')}</button>
      </footer>
    </main>
  )
}

export default function App() {
  return <AuthGate>{(session) => <Home userId={session.user.id} />}</AuthGate>
}
