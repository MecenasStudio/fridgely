import { useTranslation } from 'react-i18next'
import { AuthGate } from './features/auth/AuthGate'
import { useHousehold } from './features/household/useHousehold'
import { HouseholdSetup } from './features/household/HouseholdSetup'
import { FridgePage } from './features/fridge/FridgePage'
import { supabase } from './lib/supabase'

function Home({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const h = useHousehold(userId)
  if (h.loading) return null
  if (!h.householdId) return <HouseholdSetup h={h} />
  return (
    <main>
      <h1>{t('app.name')}</h1>
      <p>{t('household.inviteCode', { code: h.inviteCode })}</p>
      <FridgePage householdId={h.householdId} />
      <button onClick={() => supabase.auth.signOut()}>{t('auth.signOut')}</button>
    </main>
  )
}

export default function App() {
  return <AuthGate>{(session) => <Home userId={session.user.id} />}</AuthGate>
}

