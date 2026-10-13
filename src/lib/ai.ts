// Client for the `ai` Edge Function.
//
// The Anthropic key never exists in the browser: this module only sends the user's
// Supabase JWT and the fridge contents, and reads back a recipe. Every failure is
// surfaced as an `AiError` with a stable `code`, so the UI can route the user to the
// API-key settings screen on `NO_API_KEY`.

import { supabase } from './supabase'

export type AiErrorCode = 'UNAUTHENTICATED' | 'INVALID_REQUEST' | 'NO_API_KEY' | 'UPSTREAM_ERROR'
export type AiTask = 'recipes_from_fridge' | 'dinner_from_expiring'
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
  const token = await accessToken()

  let response: Response
  try {
    response = await fetch(`${baseUrl()}/functions/v1/ai`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ task, locale, payload }),
    })
  } catch (cause) {
    throw new AiError('UPSTREAM_ERROR', cause instanceof Error ? cause.message : 'network error')
  }

  const body = await readJson(response)

  if (!response.ok) {
    throw new AiError(codeFor(response, body), `ai function responded ${response.status}`, response.status)
  }

  const recipe = (body as AiResponse | null)?.recipe
  if (!isRecipe(recipe)) {
    throw new AiError('UPSTREAM_ERROR', 'malformed response', response.status)
  }
  return { ...recipe, missing: recipe.missing ?? [] }
}
