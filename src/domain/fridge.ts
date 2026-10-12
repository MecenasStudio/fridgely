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
