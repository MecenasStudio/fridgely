import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type HouseholdState = {
  loading: boolean
  householdId: string | null
  inviteCode: string | null
  name: string | null
  /** Household size, or `null` when it could not be read (the UI then hides the line). */
  memberCount: number | null
  create: (name: string) => Promise<void>
  joinByCode: (code: string) => Promise<void>
}

export function useHousehold(userId: string): HouseholdState {
  const [loading, setLoading] = useState(true)
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [name, setName] = useState<string | null>(null)
  const [memberCount, setMemberCount] = useState<number | null>(null)

  const load = useCallback(async () => {
    const { data: member } = await supabase
      .from('members')
      .select('household_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()
    if (member) {
      const { data: h } = await supabase
        .from('households')
        .select('id, name, invite_code')
        .eq('id', member.household_id)
        .single()
      setHouseholdId(h?.id ?? null)
      setInviteCode(h?.invite_code ?? null)
      setName(h?.name ?? null)

      // Counting the rows of this household is a plain read under RLS; a failure just
      // means the size is unknown, which the caller renders as "hide the line".
      const { data: members, error } = await supabase
        .from('members')
        .select('user_id')
        .eq('household_id', member.household_id)
      setMemberCount(error || !Array.isArray(members) ? null : members.length)
    } else {
      setHouseholdId(null)
      setInviteCode(null)
      setName(null)
      setMemberCount(null)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  const create = async (name: string) => {
    const { error } = await supabase.rpc('create_household', { p_name: name })
    if (error) throw error
    await load()
  }
  const joinByCode = async (code: string) => {
    const { error } = await supabase.rpc('join_household', { p_code: code })
    if (error) throw error
    await load()
  }

  return { loading, householdId, inviteCode, name, memberCount, create, joinByCode }
}
