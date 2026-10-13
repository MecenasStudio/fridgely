// Date display.
//
// Everything that is stored or typed stays ISO (`YYYY-MM-DD`, same as `<input type="date">`);
// this is only about what the user reads. Dates are formatted in UTC, because the app treats
// a day as a plain calendar day and a negative timezone offset must not shift it.

/**
 * Formats an ISO date in the interface language ("3 paź 2026" / "Oct 3, 2026").
 *
 * Anything that is not a real `YYYY-MM-DD` day — empty strings, half-typed input, dates like
 * 2026-02-31 — is returned unchanged, so a field being edited never shows "Invalid Date".
 */
export function formatDate(iso: string, locale: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const date = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return iso

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}
