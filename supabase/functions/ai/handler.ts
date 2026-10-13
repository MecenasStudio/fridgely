// Pure request handling for the `ai` Edge Function.
//
// Everything that needs the outside world (auth, database, decryption, the Claude
// API) is injected through `AiHandlerDeps`, so the whole request/response contract
// is testable off-line. `index.ts` wires the real Deno/Supabase implementations.

// Deno (like a browser) needs the explicit extension for relative imports.
import { buildPrompt, systemPrompt } from './prompts.ts'
import type { AiLocale, AiTask, FridgeItem, Recipe } from './prompts.ts'

export type { AiLocale, AiTask, FridgeItem, Recipe } from './prompts.ts'

export type AiErrorCode = 'UNAUTHENTICATED' | 'INVALID_REQUEST' | 'NO_API_KEY' | 'UPSTREAM_ERROR'

export type AiRequest = {
  task: AiTask
  locale: AiLocale
  payload: { fridge: FridgeItem[] }
}

export type AiResponse = { recipe: Recipe }
export type AiErrorResponse = { error: AiErrorCode }

export type StoredKey = { ciphertext: string; last4: string }
export type ClaudeCall = {
  key: string
  prompt: string
  system: string
  task: AiTask
  locale: AiLocale
}
export type ClaudeResult = { text: string; inputTokens: number; outputTokens: number }
export type UsageRow = {
  userId: string
  task: AiTask
  inputTokens: number
  outputTokens: number
}

export type AiHandlerDeps = {
  /** Resolve the `Authorization: Bearer <jwt>` header to a user id; throws on a bad token. */
  getUser(jwt: string): Promise<{ id: string }>
  /** Read `user_secrets` row for the user, or null when the user has no key yet. */
  getUserKey(userId: string): Promise<StoredKey | null>
  /** Decrypt `user_secrets.anthropic_key_encrypted` (AES-GCM, see index.ts). */
  decrypt(ciphertext: string): Promise<string>
  /** Call the Anthropic API. Never returns the key. */
  callClaude(call: ClaudeCall): Promise<ClaudeResult>
  /** Append a row to `ai_usage`. */
  recordUsage(row: UsageRow): Promise<void>
}

type HandlerResult = { status: number; body: AiResponse | AiErrorResponse }

const MAX_FRIDGE_ITEMS = 100
const MAX_NAME_LENGTH = 100
const MAX_UNIT_LENGTH = 20
const TASKS: AiTask[] = ['recipes_from_fridge', 'dinner_from_expiring']
const LOCALES: AiLocale[] = ['pl', 'en']
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function fail(status: number, error: AiErrorCode): HandlerResult {
  return { status, body: { error } }
}

/** `YYYY-MM-DD` and a real calendar day (rejects 2026-02-31 and 2026-13-01). */
function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Single-line, printable name. A product name from the client ends up verbatim in
 * the prompt, so control characters and newlines would let a name forge an extra
 * fridge line or a fake instruction. Validation and the prompt therefore share this
 * one sanitized value.
 */
function sanitizeName(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseFridgeItem(value: unknown): FridgeItem {
  if (!isRecord(value)) throw new Error('fridge item must be an object')
  const { name, quantity, unit, expiresOn } = value
  if (typeof name !== 'string') throw new Error('name must be a string')
  const clean = sanitizeName(name)
  if (clean.length === 0 || clean.length > MAX_NAME_LENGTH) throw new Error('bad name')
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('bad quantity')
  }
  const cleanUnit = typeof unit === 'string' ? sanitizeName(unit) : ''
  if (cleanUnit.length === 0 || cleanUnit.length > MAX_UNIT_LENGTH) {
    throw new Error('bad unit')
  }
  if (expiresOn !== null && !(typeof expiresOn === 'string' && isValidDate(expiresOn))) {
    throw new Error('bad expiresOn')
  }
  return { name: clean, quantity, unit: cleanUnit, expiresOn: expiresOn as string | null }
}

/** Validates the request body. Throws when anything is malformed. */
export function parseRequest(value: unknown): AiRequest {
  if (!isRecord(value)) throw new Error('body must be a JSON object')
  const { task, locale, payload } = value
  if (!TASKS.includes(task as AiTask)) throw new Error('unknown task')
  if (!LOCALES.includes(locale as AiLocale)) throw new Error('unknown locale')
  if (!isRecord(payload)) throw new Error('payload must be an object')
  const { fridge } = payload
  if (!Array.isArray(fridge)) throw new Error('payload.fridge must be an array')
  if (fridge.length > MAX_FRIDGE_ITEMS) throw new Error('too many fridge items')
  return { task: task as AiTask, locale: locale as AiLocale, payload: { fridge: fridge.map(parseFridgeItem) } }
}

/** Ascending by expiry, items without a date last; never mutates the input. */
export function sortByExpiry(fridge: FridgeItem[]): FridgeItem[] {
  return [...fridge].sort((a, b) => {
    if (a.expiresOn === b.expiresOn) return 0
    if (a.expiresOn === null) return 1
    if (b.expiresOn === null) return -1
    return a.expiresOn < b.expiresOn ? -1 : 1
  })
}

/** Models sometimes wrap JSON in prose or code fences; take the first object. */
function extractJsonObject(text: string): unknown {
  const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end <= start) throw new Error('no JSON object in model output')
    return JSON.parse(cleaned.slice(start, end + 1))
  }
}

function parseIngredient(value: unknown): { name: string; quantity: number; unit: string } {
  if (!isRecord(value)) throw new Error('ingredient must be an object')
  const { name, quantity, unit } = value
  if (typeof name !== 'string' || name.trim().length === 0) throw new Error('bad ingredient name')
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) throw new Error('bad ingredient quantity')
  if (typeof unit !== 'string') throw new Error('bad ingredient unit')
  return { name: name.trim(), quantity, unit: unit.trim() }
}

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('expected an array of strings')
  return value.map((entry) => {
    if (typeof entry !== 'string') throw new Error('expected a string')
    return entry.trim()
  })
}

/**
 * Validates the model output against the documented recipe shape. Any deviation
 * (prose, missing fields, wrong types) is an upstream problem, not a 200.
 */
export function parseRecipe(text: string): Recipe {
  const value = extractJsonObject(text)
  if (!isRecord(value)) throw new Error('model output is not an object')
  const { title, ingredients, steps, missing } = value
  if (typeof title !== 'string' || title.trim().length === 0) throw new Error('bad title')
  if (!Array.isArray(ingredients) || ingredients.length === 0) throw new Error('bad ingredients')
  const parsedSteps = parseStringList(steps)
  if (parsedSteps.length === 0) throw new Error('bad steps')
  return {
    title: title.trim(),
    ingredients: ingredients.map(parseIngredient),
    steps: parsedSteps,
    missing: missing === undefined ? [] : parseStringList(missing),
  }
}

function tokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}

function bearerToken(req: { headers: { get(name: string): string | null } }): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1].trim() : null
}

/**
 * Handle one `POST /functions/v1/ai` request.
 *
 * Order is fixed: authenticate -> validate body -> read the user's key ->
 * call Claude -> record usage -> respond. The key (encrypted or plain) is never
 * part of the response and never reaches `recordUsage`.
 */
export async function handle(
  req: { method?: string; headers: { get(name: string): string | null }; json(): Promise<unknown> },
  deps: AiHandlerDeps,
): Promise<HandlerResult> {
  const jwt = bearerToken(req)
  if (!jwt) return fail(401, 'UNAUTHENTICATED')

  let user: { id: string }
  try {
    user = await deps.getUser(jwt)
  } catch {
    return fail(401, 'UNAUTHENTICATED')
  }
  if (!user || typeof user.id !== 'string' || user.id.length === 0) {
    return fail(401, 'UNAUTHENTICATED')
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return fail(400, 'INVALID_REQUEST')
  }

  let request: AiRequest
  try {
    request = parseRequest(raw)
  } catch {
    return fail(400, 'INVALID_REQUEST')
  }

  const stored = await deps.getUserKey(user.id)
  if (!stored) return fail(409, 'NO_API_KEY')

  let key: string
  try {
    key = await deps.decrypt(stored.ciphertext)
  } catch {
    return fail(502, 'UPSTREAM_ERROR')
  }
  if (typeof key !== 'string' || key.length === 0) return fail(409, 'NO_API_KEY')

  const fridge = sortByExpiry(request.payload.fridge)
  const today = new Date().toISOString().slice(0, 10)

  let answer: ClaudeResult
  try {
    answer = await deps.callClaude({
      key,
      prompt: buildPrompt(request.task, request.locale, fridge, today),
      system: systemPrompt(request.locale),
      task: request.task,
      locale: request.locale,
    })
  } catch {
    return fail(502, 'UPSTREAM_ERROR')
  }

  let recipe: Recipe
  try {
    recipe = parseRecipe(answer.text)
  } catch {
    return fail(502, 'UPSTREAM_ERROR')
  }

  // Usage is best-effort: a bookkeeping failure must not cost the user their recipe.
  try {
    await deps.recordUsage({
      userId: user.id,
      task: request.task,
      inputTokens: tokenCount(answer.inputTokens),
      outputTokens: tokenCount(answer.outputTokens),
    })
  } catch {
    // ignore
  }

  return { status: 200, body: { recipe } }
}
