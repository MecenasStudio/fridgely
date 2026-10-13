// Pure request handling for the `save-key` Edge Function (BYOK key storage).
// The plaintext key exists only inside this call: it is validated, encrypted via the
// injected `encrypt`, and never logged, returned or stored in the clear.

export type SaveKeyErrorCode = 'UNAUTHENTICATED' | 'INVALID_KEY' | 'INVALID_REQUEST'
export type KeyVerdict = 'valid' | 'invalid' | 'unknown'

export type SaveKeyDeps = {
  getUser(jwt: string): Promise<{ id: string }>
  encrypt(plaintext: string): Promise<string>
  /** Cheap check against Anthropic; `unknown` (network, 5xx) must not block saving. */
  verify(key: string): Promise<KeyVerdict>
  upsert(row: { userId: string; ciphertext: string; last4: string }): Promise<void>
  remove(userId: string): Promise<void>
}

export type SaveKeyResult =
  | { status: 200; body: { last4: string } }
  | { status: 204 }
  | { status: 400 | 401 | 405; body: { error: SaveKeyErrorCode } }

type Req = { method: string; headers: { get(name: string): string | null }; json(): Promise<unknown> }

const KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{16,300}$/

function bearerToken(req: Req): string | null {
  const header = req.headers.get('authorization')
  const match = header ? /^Bearer\s+(.+)$/i.exec(header.trim()) : null
  return match ? match[1].trim() : null
}

export async function handle(req: Req, deps: SaveKeyDeps): Promise<SaveKeyResult> {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return { status: 405, body: { error: 'INVALID_REQUEST' } }
  }

  const jwt = bearerToken(req)
  if (!jwt) return { status: 401, body: { error: 'UNAUTHENTICATED' } }
  let user: { id: string }
  try {
    user = await deps.getUser(jwt)
  } catch {
    return { status: 401, body: { error: 'UNAUTHENTICATED' } }
  }
  if (!user?.id) return { status: 401, body: { error: 'UNAUTHENTICATED' } }

  if (req.method === 'DELETE') {
    await deps.remove(user.id)
    return { status: 204 }
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return { status: 400, body: { error: 'INVALID_REQUEST' } }
  }
  const apiKey = (body as { apiKey?: unknown } | null)?.apiKey
  if (typeof apiKey !== 'string') return { status: 400, body: { error: 'INVALID_REQUEST' } }

  const key = apiKey.trim()
  if (!KEY_PATTERN.test(key)) return { status: 400, body: { error: 'INVALID_KEY' } }
  if ((await deps.verify(key)) === 'invalid') return { status: 400, body: { error: 'INVALID_KEY' } }

  const last4 = key.slice(-4)
  await deps.upsert({ userId: user.id, ciphertext: await deps.encrypt(key), last4 })
  return { status: 200, body: { last4 } }
}
