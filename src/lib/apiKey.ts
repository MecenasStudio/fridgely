// Client for the user's Anthropic API key (BYOK).
//
// The key is only ever sent to the `save-key` Edge Function, which stores it
// encrypted; the browser keeps just the last four characters. Nothing here logs,
// caches or returns the key itself.

import { supabase } from './supabase'

export type ApiKeyErrorCode = 'INVALID_KEY' | 'UNAUTHENTICATED' | 'NETWORK'

export class ApiKeyError extends Error {
  readonly code: ApiKeyErrorCode

  constructor(code: ApiKeyErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'ApiKeyError'
    this.code = code
  }
}

export type KeyStatus = { hasKey: boolean; last4: string | null }

type StatusRow = { has_key: boolean; last4: string | null }

function baseUrl(): string {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!url) throw new ApiKeyError('NETWORK', 'missing VITE_SUPABASE_URL')
  return `${url.replace(/\/+$/, '')}/functions/v1/save-key`
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new ApiKeyError('UNAUTHENTICATED', 'no active session')
  return token
}

/** `api_key_status()` returns zero or one row; `{ hasKey: false }` means "no key yet". */
export async function getKeyStatus(): Promise<KeyStatus> {
  const { data, error } = await supabase.rpc('api_key_status')
  if (error) throw new ApiKeyError('NETWORK', error.message)
  const row = (Array.isArray(data) ? data[0] : null) as StatusRow | null | undefined
  if (!row) return { hasKey: false, last4: null }
  return { hasKey: Boolean(row.has_key), last4: row.last4 ?? null }
}

/** Stores the key server-side; resolves with nothing but its last four characters. */
export async function saveKey(apiKey: string): Promise<{ last4: string }> {
  const token = await accessToken()

  let response: Response
  try {
    response = await fetch(baseUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ apiKey }),
    })
  } catch (cause) {
    throw new ApiKeyError('NETWORK', cause instanceof Error ? cause.message : 'network error')
  }

  const body = (await response.json().catch(() => null)) as { last4?: unknown } | null

  if (response.status === 400) throw new ApiKeyError('INVALID_KEY', 'key rejected')
  if (response.status === 401) throw new ApiKeyError('UNAUTHENTICATED', 'not authenticated')
  if (!response.ok) throw new ApiKeyError('NETWORK', `save-key responded ${response.status}`)
  if (typeof body?.last4 !== 'string' || body.last4.length === 0) {
    throw new ApiKeyError('NETWORK', 'malformed response')
  }
  return { last4: body.last4 }
}

/** Removes the stored key for the current user. */
export async function clearKey(): Promise<void> {
  const token = await accessToken()

  let response: Response
  try {
    response = await fetch(baseUrl(), {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    })
  } catch (cause) {
    throw new ApiKeyError('NETWORK', cause instanceof Error ? cause.message : 'network error')
  }

  if (response.status === 401) throw new ApiKeyError('UNAUTHENTICATED', 'not authenticated')
  if (!response.ok) throw new ApiKeyError('NETWORK', `save-key responded ${response.status}`)
}
