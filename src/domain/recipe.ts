import type { Ingredient } from './types'

// "qty unit name" (e.g. "0.5 l mleko"), "qty name" (unit szt) or just "name".
export function parseIngredient(line: string): Ingredient | null {
  const text = line.trim()
  if (!text) return null
  const num = (s: string) => Number(s.replace(',', '.'))

  const full = text.match(/^(\d+(?:[.,]\d+)?)\s+(\S+)\s+(.+)$/)
  if (full) return { name: full[3].trim(), quantity: num(full[1]), unit: full[2] }

  const short = text.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/)
  if (short) return { name: short[2].trim(), quantity: num(short[1]), unit: 'szt' }

  return { name: text, quantity: 1, unit: 'szt' }
}
