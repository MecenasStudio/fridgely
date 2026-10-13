import { describe, it, expect, vi } from 'vitest'
import { handle } from './handler.ts'
import type { SaveKeyDeps } from './handler.ts'

const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234'

function deps(over: Partial<SaveKeyDeps> = {}): SaveKeyDeps {
  return {
    getUser: vi.fn(async () => ({ id: 'user-1' })),
    encrypt: vi.fn(async () => 'CIPHERTEXT'),
    verify: vi.fn(async () => 'valid' as const),
    upsert: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    ...over,
  }
}

function req(method: string, body?: unknown, auth: string | null = 'Bearer jwt') {
  return {
    method,
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => {
      if (body === undefined) throw new Error('no body')
      return body
    },
  }
}

describe('save-key handler', () => {
  it('rejects other methods with 405', async () => {
    expect((await handle(req('GET'), deps())).status).toBe(405)
  })

  it('401 without or with a bad token, and does not touch storage', async () => {
    const d = deps({ getUser: vi.fn(async () => { throw new Error('bad') }) })
    expect((await handle(req('POST', { apiKey: KEY }, null), d)).status).toBe(401)
    expect((await handle(req('POST', { apiKey: KEY }), d)).status).toBe(401)
    expect(d.upsert).not.toHaveBeenCalled()
  })

  it('stores the encrypted key and returns only the last 4 characters', async () => {
    const d = deps()
    const res = await handle(req('POST', { apiKey: `  ${KEY}  ` }), d)
    expect(res).toEqual({ status: 200, body: { last4: '1234' } })
    expect(d.encrypt).toHaveBeenCalledWith(KEY)
    expect(d.upsert).toHaveBeenCalledWith({ userId: 'user-1', ciphertext: 'CIPHERTEXT', last4: '1234' })
    expect(JSON.stringify(res)).not.toContain(KEY)
  })

  it('400 INVALID_KEY for a wrong format, without verifying or storing', async () => {
    const d = deps()
    for (const apiKey of ['', 'hello', 'sk-ant-short', `${KEY} extra`, `${KEY}\n`.slice(0, -1) + ' x']) {
      const res = await handle(req('POST', { apiKey }), d)
      expect(res).toEqual({ status: 400, body: { error: 'INVALID_KEY' } })
    }
    expect(d.verify).not.toHaveBeenCalled()
    expect(d.upsert).not.toHaveBeenCalled()
  })

  it('400 INVALID_REQUEST for a non-string key or a missing body', async () => {
    expect((await handle(req('POST', { apiKey: 5 }), deps())).status).toBe(400)
    expect((await handle(req('POST'), deps())).status).toBe(400)
  })

  it('rejects a key Anthropic says is invalid, but saves when verification is unknown', async () => {
    const bad = deps({ verify: vi.fn(async () => 'invalid' as const) })
    expect(await handle(req('POST', { apiKey: KEY }), bad)).toEqual({ status: 400, body: { error: 'INVALID_KEY' } })
    expect(bad.upsert).not.toHaveBeenCalled()

    const unknown = deps({ verify: vi.fn(async () => 'unknown' as const) })
    expect((await handle(req('POST', { apiKey: KEY }), unknown)).status).toBe(200)
  })

  it('DELETE removes the key and returns 204', async () => {
    const d = deps()
    expect(await handle(req('DELETE'), d)).toEqual({ status: 204 })
    expect(d.remove).toHaveBeenCalledWith('user-1')
  })
})
