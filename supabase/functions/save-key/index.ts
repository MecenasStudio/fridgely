// @ts-nocheck -- Deno-only wiring (Deno.*, npm: specifiers); logic is in handler.ts.
//
// Edge Function `save-key`: stores or removes the caller's Anthropic key, encrypted.
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (injected by Supabase),
// KEY_ENCRYPTION_SECRET (set by the project owner; never commit it).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { encryptKey } from '../_shared/keycrypto.ts'
import { handle } from './handler.ts'
import type { SaveKeyDeps, KeyVerdict } from './handler.ts'

function env(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`missing env ${name}`)
  return value
}

let client = null
function db() {
  if (!client) {
    client = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}

const deps: SaveKeyDeps = {
  async getUser(jwt) {
    const { data, error } = await db().auth.getUser(jwt)
    if (error || !data?.user?.id) throw new Error('invalid token')
    return { id: data.user.id }
  },
  encrypt: (plaintext) => encryptKey(plaintext, env('KEY_ENCRYPTION_SECRET'), env('SUPABASE_URL')),
  async verify(key): Promise<KeyVerdict> {
    try {
      const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      })
      if (res.status === 401 || res.status === 403) return 'invalid'
      return res.ok ? 'valid' : 'unknown'
    } catch {
      return 'unknown'
    }
  },
  async upsert({ userId, ciphertext, last4 }) {
    const { error } = await db().from('user_secrets').upsert({
      user_id: userId,
      anthropic_key_encrypted: ciphertext,
      key_last4: last4,
      updated_at: new Date().toISOString(),
    })
    if (error) throw error
  },
  async remove(userId) {
    const { error } = await db().from('user_secrets').delete().eq('user_id', userId)
    if (error) throw error
  },
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, DELETE, OPTIONS',
}

function respond(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { ...CORS, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    const result = await handle(req, deps)
    return respond(result.status, 'body' in result ? result.body : undefined)
  } catch (error) {
    console.error('save-key failed', error instanceof Error ? error.message : String(error))
    return respond(502, { error: 'UPSTREAM_ERROR' })
  }
})
