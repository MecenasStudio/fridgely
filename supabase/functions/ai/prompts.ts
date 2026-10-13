// Prompt construction for the `ai` Edge Function.
//
// This module is pure: no Deno APIs, no network, no secrets. It only decides what
// the model is asked to do. The response shape documented here is the same one
// `handler.ts` validates, so a model that follows the prompt always passes validation.

export type AiTask = 'recipes_from_fridge' | 'dinner_from_expiring' | 'recognize_photo' | 'read_label_date'
export type AiLocale = 'pl' | 'en'

export type RecipeIngredient = { name: string; quantity: number; unit: string }
export type Recipe = {
  title: string
  ingredients: RecipeIngredient[]
  steps: string[]
  missing: string[]
}

export type FridgeItem = {
  name: string
  quantity: number
  unit: string
  expiresOn: string | null
}

/** One product the model spotted on a photo (task `recognize_photo`). */
export type DetectedItem = FridgeItem

const languageName: Record<AiLocale, string> = {
  pl: 'Polish',
  en: 'English',
}

// The literal shape the model must return. Kept verbatim in every prompt.
const RESPONSE_SHAPE = `{"title": string, "ingredients": [{"name": string, "quantity": number, "unit": string}], "steps": [string], "missing": [string]}`

const ITEMS_SHAPE = `{"items": [{"name": string, "quantity": number, "unit": string, "expiresOn": string | null}]}`

const NO_GUESSED_DATES = `Never guess a date. Put a date in "expiresOn" only when it is clearly readable on the label in the photo; otherwise use null. "expiresOn" must be "YYYY-MM-DD".`

const RULES = `Rules:
- Answer with a single JSON object and nothing else: no markdown, no code fences, no comments, no text before or after.
- The JSON must have exactly this shape: ${RESPONSE_SHAPE}
- "quantity" is a number (use decimals if needed), everything else is a string or an array of strings.
- "steps" holds 3-6 short imperative sentences.
- "missing" lists only the ingredients that are NOT in the fridge (may be empty).
- Never mention the fridge contents in "missing"; use it only for what has to be bought.
- Do not invent an "id" field.`

export function renderFridge(fridge: FridgeItem[]): string {
  if (fridge.length === 0) return '(empty)'
  return fridge
    .map((item) => {
      const expiry = item.expiresOn ? `expires ${item.expiresOn}` : 'no expiry date'
      return `- ${item.name}: ${item.quantity} ${item.unit} (${expiry})`
    })
    .join('\n')
}

function fridgeBlock(fridge: FridgeItem[]): string {
  return `Fridge contents (soonest expiry first, undated last):\n${renderFridge(fridge)}`
}

/**
 * Build the prompt for a task. `fridge` is expected to be sorted by expiry
 * ascending with undated items last (see `sortByExpiry` in the handler), so the
 * item that expires first is always the first line under "Fridge contents".
 *
 * `recognize_photo` and `read_label_date` ignore `fridge`: the photo carries the input.
 */
export function buildPrompt(
  task: AiTask,
  locale: AiLocale,
  fridge: FridgeItem[],
  today: string,
): string {
  const language = languageName[locale]
  const date = `Today is ${today}.`

  if (task === 'recognize_photo') {
    return `You are the fridge assistant of Fridgely. List the food products visible in the attached photo.

${date}

Task:
- Name only food and drink you can actually see. Ignore shelves, packaging text that is not a product, and anything you cannot identify.
- One entry per distinct product; do not repeat the same product twice.
- "quantity" is your best estimate of how many are visible (1 when unsure), "unit" is a short unit such as "szt", "g", "l" (use "szt" when unsure).
- ${NO_GUESSED_DATES}
- Write every product name in ${language}.
- List at most 50 products.

Rules:
- Answer with a single JSON object and nothing else: no markdown, no code fences, no comments, no text before or after.
- The JSON must have exactly this shape: ${ITEMS_SHAPE}
- "items" may be an empty array when the photo shows no food.
- Do not invent an "id" field.`
  }

  if (task === 'read_label_date') {
    return `You are the fridge assistant of Fridgely. Read the expiry date printed on the label in the attached photo.

${date}

Task:
- Look for "najlepiej spożyć przed", "termin przydatności do spożycia", "use by", "best before" or an equivalent label.
- When the photo shows several dates, return the one that belongs to the expiry date, never the production date or a batch number.
- Accept these printed formats: dd.mm.yyyy, dd/mm/yy, yyyy-mm-dd and mm.yyyy. For a month without a day, use the last day of that month.
- Answer with the date as "YYYY-MM-DD".
- When no expiry date is readable, answer null. Never guess.

Rules:
- Answer with a single JSON object and nothing else: no markdown, no code fences, no comments, no text before or after.
- The JSON must have exactly this shape: {"expiresOn": string | null}
- "expiresOn" is either a "YYYY-MM-DD" string or null.`
  }

  if (task === 'dinner_from_expiring') {
    const base = fridge.find((item) => item.expiresOn !== null)
    const baseLine = base
      ? `The base of the dish must be the first product above, "${base.name}" (expires ${base.expiresOn}), because it expires soonest. Products without an expiry date are never the base.`
      : 'No product above has an expiry date, so pick the base yourself from the first product listed.'

    return `You are a home cook. Propose one dinner that rescues the ingredient closest to its expiry date.

${date}

${fridgeBlock(fridge)}

Task:
- ${baseLine}
- Complete the dish with the rest of the fridge contents; keep it simple and realistic for a weeknight.
- Prefer using as much of the soonest-expiring produce as possible.
- Write the title, every ingredient name, every step and every missing item in ${language}.

${RULES}`
  }

  return `You are a home cook. Propose one recipe that uses the fridge contents below.

${date}

${fridgeBlock(fridge)}

Task:
- Build the recipe mostly from the listed products; allow a few common pantry staples.
- When two products compete, use the one that expires sooner.
- Write the title, every ingredient name, every step and every missing item in ${language}.

${RULES}`
}

/** System message sent with every request. */
export function systemPrompt(locale: AiLocale): string {
  return `You are the recipe generator of Fridgely, a meal planner. You always reply with raw JSON only, using ${languageName[locale]} for all human-readable text.`
}

/**
 * Prompt for a task that reads a photo. The image itself is attached separately by
 * `callClaude` (see index.ts); this text only describes what to look for.
 */
export function imagePrompt(task: 'recognize_photo' | 'read_label_date', locale: AiLocale, today: string): string {
  return buildPrompt(task, locale, [], today)
}
