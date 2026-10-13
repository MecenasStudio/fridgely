// Product validation, shared by every form that can put a row in the fridge.
//
// The rules mirror the `ai` Edge Function (see `supabase/functions/ai/handler.ts`), so the
// browser refuses what the server would refuse: a name of 1-100 characters after trimming
// and collapsing whitespace, a unit of 1-20, and a finite quantity above 0 and at most
// 100000. Keeping this in one place means the three forms cannot drift apart again.

export type ItemInput = { name: string; quantity: number; unit: string }
export type ItemField = 'name' | 'quantity' | 'unit'
export type ValidationResult =
  | { ok: true; value: ItemInput }
  | { ok: false; error: ItemField }

export const NAME_MIN = 1
export const NAME_MAX = 100
export const UNIT_MIN = 1
export const UNIT_MAX = 20
export const QUANTITY_MIN_EXCLUSIVE = 0
export const QUANTITY_MAX = 100_000

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
