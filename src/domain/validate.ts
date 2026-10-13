// Product validation, shared by every form that can put a row in the fridge.
//
// The rules mirror the `ai` Edge Function (see `supabase/functions/ai/handler.ts`, which uses
// the same `MAX_NAME_LENGTH`, `MAX_UNIT_LENGTH` and quantity limits), so the browser refuses
// what the server would refuse. Keeping this in one place means the three forms cannot drift
// apart again.

import { MAX_NAME_LENGTH, MAX_QUANTITY, MAX_UNIT_LENGTH } from './limits'

export type ItemInput = { name: string; quantity: number; unit: string }
export type ItemField = 'name' | 'quantity' | 'unit'
export type ValidationResult =
  | { ok: true; value: ItemInput }
  | { ok: false; error: ItemField }

export const NAME_MIN = 1
export const NAME_MAX = MAX_NAME_LENGTH
export const UNIT_MIN = 1
export const UNIT_MAX = MAX_UNIT_LENGTH
export const QUANTITY_MIN_EXCLUSIVE = 0
export const QUANTITY_MAX = MAX_QUANTITY

/** Trim and collapse inner whitespace, exactly like the server does. */
function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function validateItem(input: ItemInput): ValidationResult {
  const name = typeof input.name === 'string' ? clean(input.name) : ''
  if (name.length < NAME_MIN || name.length > NAME_MAX) return { ok: false, error: 'name' }

  const unit = typeof input.unit === 'string' ? clean(input.unit) : ''
  if (unit.length < UNIT_MIN || unit.length > UNIT_MAX) return { ok: false, error: 'unit' }

  const quantity = input.quantity
  if (
    typeof quantity !== 'number' ||
    !Number.isFinite(quantity) ||
    quantity <= QUANTITY_MIN_EXCLUSIVE ||
    quantity > QUANTITY_MAX
  ) {
    return { ok: false, error: 'quantity' }
  }

  return { ok: true, value: { name, quantity, unit } }
}
