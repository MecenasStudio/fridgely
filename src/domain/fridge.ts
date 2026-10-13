import type { FridgeItem } from './types'

const DAY_MS = 86_400_000
const SOON_DAYS = 3

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function sortByExpiry(items: FridgeItem[]): FridgeItem[] {
  return [...items].sort((a, b) => {
    if (a.expiresOn === b.expiresOn) return 0
    if (a.expiresOn === null) return 1
    if (b.expiresOn === null) return -1
    return a.expiresOn < b.expiresOn ? -1 : 1
  })
}

export function expiryStatus(
  item: FridgeItem,
  today: string,
): 'expired' | 'soon' | 'ok' | 'unknown' {
  if (item.expiresOn === null) return 'unknown'
  const days = (Date.parse(item.expiresOn) - Date.parse(today)) / DAY_MS
  if (days < 0) return 'expired'
  return days <= SOON_DAYS ? 'soon' : 'ok'
}

export function todayISO(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

export type MergeCandidate = { name: string; unit: string; expiresOn: string | null }

/**
 * Finds the fridge row a new product should be added to, so the same thing twice does
 * not create two rows. Name (normalized) and unit must match, and so must the expiry
 * date — `null` only matches `null`, because "milk with no date" and "milk expiring on
 * Friday" are not interchangeable when the app plans meals around dates.
 */
export function findMergeTarget(items: FridgeItem[], candidate: MergeCandidate): FridgeItem | null {
  const name = normalizeName(candidate.name)
  return (
    items.find(
      (item) =>
        normalizeName(item.name) === name &&
        item.unit === candidate.unit &&
        item.expiresOn === candidate.expiresOn,
    ) ?? null
  )
}
