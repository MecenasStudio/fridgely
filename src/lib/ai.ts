// Client for the `ai` Edge Function.
//
// The Anthropic key never exists in the browser: this module only sends the user's
// Supabase JWT, the fridge contents or a prepared photo, and reads back a recipe, a
// product list or a date. Every failure is surfaced as an `AiError` with a stable
// `code`, so the UI can route the user to the API-key settings screen on `NO_API_KEY`.

import { supabase } from './supabase'

export type AiErrorCode = 'UNAUTHENTICATED' | 'INVALID_REQUEST' | 'NO_API_KEY' | 'UPSTREAM_ERROR'
export type AiTask = 'recipes_from_fridge' | 'dinner_from_expiring' | 'recognize_photo' | 'read_label_date'
export type AiLocale = 'pl' | 'en'

export type FridgeItem = {
  name: string
  quantity: number
  unit: string
  expiresOn: string | null
}
export type RecipeIngredient = { name: string; quantity: number; unit: string }
export type Recipe = {
  title: string
  ingredients: RecipeIngredient[]
  steps: string[]
  missing: string[]
}

/** A photo on its way to a vision task: plain base64, no `data:` prefix. */
export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp'
export type PhotoPayload = { mediaType: ImageMediaType; data: string }
/** One product the model spotted on a photo. */
export type DetectedItem = { name: string; quantity: number; unit: string; expiresOn: string | null }

export type AiPayload = { fridge: FridgeItem[] }
export type AiResponse = { recipe: Recipe }

export const AI_ERROR_CODES: AiErrorCode[] = [
  'UNAUTHENTICATED',
  'INVALID_REQUEST',
  'NO_API_KEY',
  'UPSTREAM_ERROR',
]

const DEFAULT_CODE: AiErrorCode = 'UPSTREAM_ERROR'
const STATUS_CODES: Partial<Record<number, AiErrorCode>> = {
  400: 'INVALID_REQUEST',
  401: 'UNAUTHENTICATED',
  409: 'NO_API_KEY',
  502: 'UPSTREAM_ERROR',
}

export class AiError extends Error {
  readonly code: AiErrorCode
  readonly status: number | null

  constructor(code: AiErrorCode, message?: string, status: number | null = null) {
    super(message ?? code)
    this.name = 'AiError'
    this.code = code
    this.status = status
  }
}

function errorCodeFrom(body: unknown): AiErrorCode | null {
  if (typeof body !== 'object' || body === null) return null
  const error = (body as { error?: unknown }).error
  return typeof error === 'string' && (AI_ERROR_CODES as string[]).includes(error)
    ? (error as AiErrorCode)
    : null
}

function codeFor(response: Response, body: unknown): AiErrorCode {
  return errorCodeFrom(body) ?? STATUS_CODES[response.status] ?? DEFAULT_CODE
}

function isRecipe(value: unknown): value is Recipe {
  if (typeof value !== 'object' || value === null) return false
  const recipe = value as Partial<Recipe>
  return (
    typeof recipe.title === 'string' &&
    Array.isArray(recipe.ingredients) &&
    Array.isArray(recipe.steps) &&
    (recipe.missing === undefined || Array.isArray(recipe.missing))
  )
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function accessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (error || !token) throw new AiError('UNAUTHENTICATED', 'no active session')
  return token
}

function baseUrl(): string {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!url) throw new AiError('UPSTREAM_ERROR', 'missing VITE_SUPABASE_URL')
  return url.replace(/\/+$/, '')
}

/**
 * Ask the `ai` function for a recipe built from the given fridge contents.
 *
 * Rejects with `AiError`; `NO_API_KEY` means the user still has to save a key in settings.
 */
export async function askAi(task: AiTask, payload: AiPayload, locale: AiLocale): Promise<Recipe> {
  const body = await callAi({ task, locale, payload })
  const recipe = body.recipe
  if (!isRecipe(recipe)) {
    throw new AiError('UPSTREAM_ERROR', 'malformed response')
  }
  return { ...recipe, missing: recipe.missing ?? [] }
}

/** One request to the `ai` function; every helper below shares this plumbing. */
async function callAi(request: { task: AiTask; locale: AiLocale; payload: unknown }): Promise<Record<string, unknown>> {
  const token = await accessToken()

  let response: Response
  try {
    response = await fetch(`${baseUrl()}/functions/v1/ai`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
    })
  } catch (cause) {
    throw new AiError('UPSTREAM_ERROR', cause instanceof Error ? cause.message : 'network error')
  }

  const body = await readJson(response)

  if (!response.ok) {
    throw new AiError(codeFor(response, body), `ai function responded ${response.status}`, response.status)
  }
  if (typeof body !== 'object' || body === null) {
    throw new AiError('UPSTREAM_ERROR', 'malformed response', response.status)
  }
  return body as Record<string, unknown>
}

function isDetectedItem(value: unknown): value is DetectedItem {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Partial<DetectedItem>
  return (
    typeof item.name === 'string' &&
    item.name.length > 0 &&
    typeof item.quantity === 'number' &&
    typeof item.unit === 'string' &&
    (item.expiresOn === null || typeof item.expiresOn === 'string')
  )
}

/**
 * Read the products visible on a photo (`recognize_photo`).
 *
 * A single malformed entry fails the whole answer on purpose: the caller shows an
 * editable list, and inventing a placeholder product would be worse than an error.
 */
export async function recognizePhoto(image: PhotoPayload, locale: AiLocale): Promise<DetectedItem[]> {
  const body = await callAi({ task: 'recognize_photo', locale, payload: { image } })
  const items = body.items
  if (!Array.isArray(items) || !items.every(isDetectedItem)) {
    throw new AiError('UPSTREAM_ERROR', 'malformed response')
  }
  return items
}

/** Read the expiry date printed on a label (`read_label_date`); `null` when unreadable. */
export async function readLabelDate(image: PhotoPayload, locale: AiLocale): Promise<string | null> {
  const body = await callAi({ task: 'read_label_date', locale, payload: { image } })
  const expiresOn = body.expiresOn
  if (expiresOn !== null && typeof expiresOn !== 'string') {
    throw new AiError('UPSTREAM_ERROR', 'malformed response')
  }
  return expiresOn
}
