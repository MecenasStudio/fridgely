// Prompt construction for the `ai` Edge Function.
//
// This module is pure: no Deno APIs, no network, no secrets. It only decides what
// the model is asked to do. The response shape documented here is the same one
// `handler.ts` validates, so a model that follows the prompt always passes validation.

export type AiTask = 'recipes_from_fridge' | 'dinner_from_expiring'
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

const languageName: Record<AiLocale, string> = {
  pl: 'Polish',
  en: 'English',
}

// The literal shape the model must return. Kept verbatim in every prompt.
const RESPONSE_SHAPE = `{"title": string, "ingredients": [{"name": string, "quantity": number, "unit": string}], "steps": [string], "missing": [string]}`

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
 */
export function buildPrompt(
  task: AiTask,
  locale: AiLocale,
  fridge: FridgeItem[],
  today: string,
): string {
  const language = languageName[locale]
  const date = `Today is ${today}.`

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
