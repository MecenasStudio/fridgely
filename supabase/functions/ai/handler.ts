// Pure request handling for the `ai` Edge Function.
//
// Everything that needs the outside world (auth, database, decryption, the Claude
// API) is injected through `AiHandlerDeps`, so the whole request/response contract
// is testable off-line. `index.ts` wires the real Deno/Supabase implementations.

// Deno (like a browser) needs the explicit extension for relative imports.
import { buildPrompt, imagePrompt, systemPrompt } from './prompts.ts'
import type { AiLocale, AiTask, DetectedItem, FridgeItem, Recipe } from './prompts.ts'

export type { AiLocale, AiTask, DetectedItem, FridgeItem, Recipe } from './prompts.ts'

export type AiErrorCode = 'UNAUTHENTICATED' | 'INVALID_REQUEST' | 'NO_API_KEY' | 'UPSTREAM_ERROR'

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp'
export type PhotoPayload = { mediaType: ImageMediaType; data: string }

export type AiRequest =
  | { task: 'recipes_from_fridge' | 'dinner_from_expiring'; locale: AiLocale; payload: { fridge: FridgeItem[] } }
  | { task: 'recognize_photo' | 'read_label_date'; locale: AiLocale; payload: { image: PhotoPayload } }

export type AiResponse =
  | { recipe: Recipe }
  | { items: DetectedItem[] }
  | { expiresOn: string | null }
export type AiErrorResponse = { error: AiErrorCode }

export type StoredKey = { ciphertext: string; last4: string }
export type ClaudeCall = {
  key: string
  prompt: string
  system: string
  task: AiTask
  locale: AiLocale
  /** Vision tasks send the photo alongside the text; recipe tasks leave it out. */
  image?: PhotoPayload
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
const MAX_DETECTED_ITEMS = 50
const MAX_IMAGE_BASE64_LENGTH = 7_000_000
const RECIPE_TASKS = ['recipes_from_fridge', 'dinner_from_expiring'] as const
const PHOTO_TASKS = ['recognize_photo', 'read_label_date'] as const
const TASKS: AiTask[] = [...RECIPE_TASKS, ...PHOTO_TASKS]
const MEDIA_TYPES: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/webp']
const LOCALES: AiLocale[] = ['pl', 'en']
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const BASE64_CHUNK = /^[A-Za-z0-9+/]*={0,2}$/

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

/**
 * Base64 with no `data:` prefix. Checked in chunks: a 7 MB string in one regex call
 * risks overflowing the matcher, and the length is already capped before we get here.
 */
function isBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0) return false
  for (let i = 0; i < value.length; i += 8192) {
    if (!BASE64_CHUNK.test(value.slice(i, i + 8192))) return false
  }
  return true
}

function parseImage(value: unknown): PhotoPayload {
  if (!isRecord(value)) throw new Error('image must be an object')
  const { mediaType, data } = value
  if (typeof mediaType !== 'string' || !MEDIA_TYPES.includes(mediaType as ImageMediaType)) {
    throw new Error('bad mediaType')
  }
  if (typeof data !== 'string') throw new Error('image data must be a string')
  if (data.length > MAX_IMAGE_BASE64_LENGTH) throw new Error('image too large')
  if (!isBase64(data)) throw new Error('image data must be base64')
  return { mediaType: mediaType as ImageMediaType, data }
}

/** Validates the request body. Throws when anything is malformed. */
export function parseRequest(value: unknown): AiRequest {
  if (!isRecord(value)) throw new Error('body must be a JSON object')
  const { task, locale, payload } = value
  if (!TASKS.includes(task as AiTask)) throw new Error('unknown task')
  if (!LOCALES.includes(locale as AiLocale)) throw new Error('unknown locale')
  if (!isRecord(payload)) throw new Error('payload must be an object')

  const parsedLocale = locale as AiLocale

  if ((PHOTO_TASKS as readonly string[]).includes(task as string)) {
    return {
      task: task as 'recognize_photo' | 'read_label_date',
      locale: parsedLocale,
      payload: { image: parseImage(payload.image) },
    }
  }

  const { fridge } = payload
  if (!Array.isArray(fridge)) throw new Error('payload.fridge must be an array')
  if (fridge.length > MAX_FRIDGE_ITEMS) throw new Error('too many fridge items')
  return {
    task: task as 'recipes_from_fridge' | 'dinner_from_expiring',
    locale: parsedLocale,
    payload: { fridge: fridge.map(parseFridgeItem) },
  }
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

/** Truncates with a marker, so a too-long string is visible rather than silently cut. */
function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max)
}

/**
 * One product from a photo. Unlike the request body, a sloppy field is repaired
 * instead of rejected: a missing quantity becomes 1, a missing unit "szt", an
 * unreadable date null, and an over-long name is clipped. A wrong date is never
 * invented, it is dropped.
 */
function parseDetectedItem(value: unknown): DetectedItem {
  if (!isRecord(value)) throw new Error('product must be an object')
  const { name, quantity, unit, expiresOn } = value
  if (typeof name !== 'string') throw new Error('bad product name')
  const clean = clip(sanitizeName(name), MAX_NAME_LENGTH)
  if (clean.length === 0) throw new Error('bad product name')

  const parsedQuantity =
    typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0 ? quantity : 1
  const cleanUnit = clip(typeof unit === 'string' ? sanitizeName(unit) : '', MAX_UNIT_LENGTH) || 'szt'
  const parsedExpiry =
    typeof expiresOn === 'string' && isValidDate(expiresOn) ? expiresOn : null

  return { name: clean, quantity: parsedQuantity, unit: cleanUnit, expiresOn: parsedExpiry }
}

/** Model output of `recognize_photo`; over 50 items are dropped, not a 502. */
export function parseDetectedItems(text: string): DetectedItem[] {
  const value = extractJsonObject(text)
  if (!isRecord(value) || !Array.isArray(value.items)) throw new Error('model output has no items array')
  return value.items.slice(0, MAX_DETECTED_ITEMS).map(parseDetectedItem)
}

/** Model output of `read_label_date`: a valid date or null, never a guessed or broken one. */
export function parseLabelDate(text: string): string | null {
  const value = extractJsonObject(text)
  if (!isRecord(value)) throw new Error('model output is not an object')
  const { expiresOn } = value
  if (expiresOn === null || expiresOn === undefined) return null
  if (typeof expiresOn !== 'string') throw new Error('bad expiresOn')
  return isValidDate(expiresOn) ? expiresOn : null
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

  const today = new Date().toISOString().slice(0, 10)

  let answer: ClaudeResult
  try {
    answer =
      request.task === 'recognize_photo' || request.task === 'read_label_date'
        ? await deps.callClaude({
            key,
            prompt: imagePrompt(request.task, request.locale, today),
            system: systemPrompt(request.locale),
            task: request.task,
            locale: request.locale,
            image: request.payload.image,
          })
        : await deps.callClaude({
            key,
            prompt: buildPrompt(request.task, request.locale, sortByExpiry(request.payload.fridge), today),
            system: systemPrompt(request.locale),
            task: request.task,
            locale: request.locale,
          })
  } catch {
    return fail(502, 'UPSTREAM_ERROR')
  }

  let body: AiResponse
  try {
    body =
      request.task === 'recognize_photo'
        ? { items: parseDetectedItems(answer.text) }
        : request.task === 'read_label_date'
          ? { expiresOn: parseLabelDate(answer.text) }
          : { recipe: parseRecipe(answer.text) }
  } catch {
    return fail(502, 'UPSTREAM_ERROR')
  }

  // Usage is best-effort: a bookkeeping failure must not cost the user their answer.
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

  return { status: 200, body }
}
