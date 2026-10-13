// @ts-nocheck -- Deno-only file: it uses `Deno.*`, `npm:` specifiers and the WebCrypto
// global, none of which the browser build's `tsc --noEmit` can resolve. The logic that
// matters is covered by handler.test.ts / prompts.ts, which are type-checked.
//
// Edge Function `ai` - the only server-side entry point to Claude (BYOK).
//
// Deploy with: `supabase functions deploy ai` (Claude does this after review).
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KEY_ENCRYPTION_SECRET.
//
// This file wires the real world (Deno, Supabase service role, WebCrypto, Anthropic)
// into the pure logic of `handler.ts`. The Anthropic key of a user is decrypted here,
// used once, and never logged, returned or stored in plaintext.

import { createClient } from 'npm:@supabase/supabase-js@2'
// Deno (like a browser) needs the explicit extension for relative imports.
import { decryptKey } from '../_shared/keycrypto.ts'
import { handle } from './handler.ts'
import type { AiHandlerDeps, StoredKey, ClaudeCall, ClaudeResult, UsageRow } from './handler.ts'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const MODEL = 'claude-sonnet-4-5'
const MAX_TOKENS = 2000

function env(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`missing env ${name}`)
  return value
}

/** Decrypt `user_secrets.anthropic_key_encrypted` (format defined in _shared/keycrypto.ts). */
async function decrypt(ciphertext: string): Promise<string> {
  return (await decryptKey(ciphertext, env('KEY_ENCRYPTION_SECRET'), env('SUPABASE_URL'))).trim()
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

/**
 * Content blocks for one message. A vision call puts the image first, then the text
 * instruction; the base64 never leaves this request body (it is not logged).
 */
function messageContent(call: ClaudeCall): { type: string; [key: string]: unknown }[] {
  const text = { type: 'text', text: call.prompt }
  if (!call.image) return [text]
  return [
    { type: 'image', source: { type: 'base64', media_type: call.image.mediaType, data: call.image.data } },
    text,
  ]
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
      messages: [{ role: 'user', content: messageContent(call) }],
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

/** Only `user_id`, `task` and token counts - never prompt text and never the key. */
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
