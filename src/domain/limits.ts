// Every limit the app enforces, in one place.
//
// They are the browser's copy of the server rules (see `supabase/functions/ai/handler.ts`,
// which validates the same fields for the AI import). Keeping them together means a change is
// one edit plus one test, instead of a hunt for magic numbers.

/** Longest accepted product name, after trimming and collapsing whitespace. */
export const MAX_NAME_LENGTH = 100
/** Longest accepted unit ("szt", "opakowanie" …). */
export const MAX_UNIT_LENGTH = 20
/** Largest accepted quantity. */
export const MAX_QUANTITY = 100000
/** Most products one photo may produce (the `ai` function trims to the same number). */
export const MAX_PHOTO_ITEMS = 50
/** A product expiring within this many days is shown as "soon". */
export const SOON_DAYS = 3
