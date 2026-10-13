// @ts-nocheck -- Deno-only file: it uses `Deno.*`, `npm:` specifiers and the WebCrypto
// global, none of which the browser build's `tsc --noEmit` can resolve. The logic that
// matters is covered by handler.test.ts / prompts.ts, which are type-checked.
//
// Edge Function `ai` — the only server-side entry point to Claude (BYOK).
//
// Deploy with: `supabase functions deploy ai` (Claude does this after review).
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KEY_ENCRYPTION_SECRET.
//
// This file wires the real world (Deno, Supabase service role, WebCrypto, Anthropic)
// into the pure logic of `handler.ts`. The Anthropic key of a user is decrypted here,
// used once, and never logged, returned or stored in plaintext.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { handle } from './handler'
import type { AiHandlerDeps, StoredKey, ClaudeCall, ClaudeResult, UsageRow } from './handler'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const MODEL = 'claude-sonnet-4-5'
const MAX_TOKENS = 2000
const ENCRYPTION_CONTEXT = 'fridgely:user_secrets:anthropic_key:v1'

// AES-GCM given a 32-byte key is a non-standard (but accepted) key size; `CryptoKey`
// is used instead of `webcrypto.CryptoKey` to stay version-agnostic.
let cachedKey: CryptoKey | null = null

function env(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`missing env ${name}`)
  return value
}

/** Raw AES-GCM key derived from `KEY_ENCRYPTION_SECRET` (32 bytes, via SHA-256). */
async function encryptionKey(): Promise<CryptoKey> {
  if (!cachedKey) {
    const secret = env('KEY_ENCRYPTION_SECRET')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
    cachedKey = await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['decrypt'])
  }
  return cachedKey
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/**
 * Decrypt `user_secrets.anthropic_key_encrypted`.
 *
 * The stored string is base64 of `iv (12 bytes) || ciphertext || tag (16 bytes)`,
 * which is exactly what WebCrypto expects once the parts are concatenated again.
 * The additional authenticated data binds the ciphertext to this column, so a blob
 * lifted from elsewhere fails to decrypt instead of silently yielding a wrong key.
 */
async function decrypt(ciphertext: string): Promise<string> {
  const payload = fromBase64(ciphertext)
  if (payload.length <= 28) throw new Error('encrypted key is too short')
  const iv = payload.slice(0, 12)
  const body = payload.slice(12)
  const aad = new TextEncoder().encode(`${ENCRYPTION_CONTEXT}:${env('SUPABASE_URL')}`)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
    await encryptionKey(),
    body,
  )
  return new TextDecoder().decode(plaintext).trim()
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = any

function adminClient(): AnyClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

let client: AnyClient | null = null
function db(): AnyClient {
  if (!client) client = adminClient()
  return client
}

async function getUser(jwt: string): Promise<{ id: string }> {
  const { data, error } = await db().auth.getUser(jwt)
  if (error || !data?.user?.id) throw new Error('invalid token')
  return { id: data.user.id as string }
}

async function getUserKey(userId: string): Promise<StoredKey | null> {
  const { data, error } = await db()
    .from('user_secrets')
    .select('anthropic_key_encrypted, key_last4')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data?.anthropic_key_encrypted) return null
  return { ciphertext: data.anthropic_key_encrypted as string, last4: (data.key_last4 as string) ?? '' }
}

async function callClaude(call: ClaudeCall): Promise<ClaudeResult> {
  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': call.key,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: call.system,
      messages: [{ role: 'user', content: call.prompt }],
    }),
  })

  if (!response.ok) {
    // Body is read for the operator, never echoed to the client.
    const detail = await response.text().catch(() => '')
    console.error(`anthropic ${response.status}: ${detail.slice(0, 500)}`)
    throw new Error(`anthropic responded ${response.status}`)
  }

  const data = (await response.json()) as {
    content?: { type: string; text?: string }[]
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  const text = (data.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')
    .trim()
  if (!text) throw new Error('anthropic returned no text')

  return {
    text,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  }
}

/** Only `user_id`, `task` and token counts — never prompt text and never the key. */
async function recordUsage(row: UsageRow): Promise<void> {
  const { error } = await db().from('ai_usage').insert({
    user_id: row.userId,
    task: row.task,
    input_tokens: row.inputTokens,
    output_tokens: row.outputTokens,
  })
  if (error) throw error
}

const deps: AiHandlerDeps = { getUser, getUserKey, decrypt, callClaude, recordUsage }

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (req.method !== 'POST') return json(405, { error: 'INVALID_REQUEST' })

    const result = await handle(req, deps)
    return json(result.status, result.body)
  } catch (error) {
    // Unexpected wiring failure (missing env, database down). The handler already
    // turns every expected failure into a typed status, so this stays generic.
    console.error('ai function failed', error instanceof Error ? error.message : String(error))
    return json(502, { error: 'UPSTREAM_ERROR' })
  }
})
