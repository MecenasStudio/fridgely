import { describe, it, expect, vi } from 'vitest'
// Explicit extension, same style as the Edge Function sources (Deno resolves `.ts`).
import { handle, sortByExpiry } from './handler.ts'
import type { AiHandlerDeps, ClaudeCall, FridgeItem, StoredKey } from './handler.ts'

const USER_ID = 'user-1'
const CIPHERTEXT = 'ciphertext-blob'
const API_KEY = 'sk-ant-secret-key-value'

const validRecipe = JSON.stringify({
  title: 'Omlet z pomidorami',
  ingredients: [{ name: 'jajka', quantity: 3, unit: 'szt' }],
  steps: ['Roztrzep jajka.', 'Usmaż.'],
  missing: ['masło'],
})

function makeReq(options: { jwt?: string | null; body?: unknown; raw?: string } = {}) {
  const { jwt = 'jwt-1', body = validBody(), raw } = options
  const headers = new Map<string, string>()
  if (jwt !== null) headers.set('authorization', `Bearer ${jwt}`)
  return {
    method: 'POST',
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    },
    json: async () => {
      if (raw !== undefined) return JSON.parse(raw)
      return body
    },
  }
}

function validBody() {
  return {
    task: 'recipes_from_fridge' as const,
    locale: 'pl' as const,
    payload: { fridge: [{ name: 'jajka', quantity: 6, unit: 'szt', expiresOn: '2026-10-20' }] },
  }
}

function makeDeps(overrides: Partial<AiHandlerDeps> = {}) {
  const stored: StoredKey | null = { ciphertext: CIPHERTEXT, last4: '-alue' }
  const deps: AiHandlerDeps = {
    getUser: vi.fn(async (jwt: string) => {
      if (jwt !== 'jwt-1') throw new Error('invalid jwt')
      return { id: USER_ID }
    }),
    getUserKey: vi.fn(async () => stored),
    decrypt: vi.fn(async () => API_KEY),
    callClaude: vi.fn(async () => ({ text: validRecipe, inputTokens: 120, outputTokens: 40 })),
    recordUsage: vi.fn(async () => {}),
    ...overrides,
  }
  return deps
}

describe('ai handler', () => {
  it('rejects a missing or malformed JWT with 401 UNAUTHENTICATED', async () => {
    const deps = makeDeps()
    const missing = await handle(makeReq({ jwt: null }), deps)
    expect(missing.status).toBe(401)
    expect(missing.body).toEqual({ error: 'UNAUTHENTICATED' })

    const malformed = await handle(makeReq({ jwt: 'not-a-real-jwt' }), deps)
    expect(malformed.status).toBe(401)
    expect(malformed.body).toEqual({ error: 'UNAUTHENTICATED' })
    expect(deps.getUserKey).not.toHaveBeenCalled()
  })

  it('returns 409 NO_API_KEY and never calls Claude when the user has no key', async () => {
    const deps = makeDeps({ getUserKey: vi.fn(async () => null) })
    const res = await handle(makeReq(), deps)
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'NO_API_KEY' })
    expect(deps.callClaude).not.toHaveBeenCalled()
    expect(deps.decrypt).not.toHaveBeenCalled()
    expect(deps.recordUsage).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_REQUEST for an unknown task', async () => {
    const deps = makeDeps()
    const res = await handle(makeReq({ body: { ...validBody(), task: 'x' } }), deps)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'INVALID_REQUEST' })
    expect(deps.callClaude).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_REQUEST for 101 fridge items', async () => {
    const deps = makeDeps()
    const fridge = Array.from({ length: 101 }, (_, i) => ({
      name: `item-${i}`,
      quantity: 1,
      unit: 'szt',
      expiresOn: null,
    }))
    const res = await handle(makeReq({ body: { ...validBody(), payload: { fridge } } }), deps)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'INVALID_REQUEST' })
  })

  it('accepts exactly 100 fridge items', async () => {
    const deps = makeDeps()
    const fridge = Array.from({ length: 100 }, (_, i) => ({
      name: `item-${i}`,
      quantity: 1,
      unit: 'szt',
      expiresOn: null,
    }))
    const res = await handle(makeReq({ body: { ...validBody(), payload: { fridge } } }), deps)
    expect(res.status).toBe(200)
  })

  it('returns 400 for an unknown locale, an over-long name and a broken body', async () => {
    const deps = makeDeps()
    const badLocale = await handle(makeReq({ body: { ...validBody(), locale: 'de' } }), deps)
    expect(badLocale.status).toBe(400)

    const longName = await handle(
      makeReq({
        body: {
          ...validBody(),
          payload: { fridge: [{ name: 'x'.repeat(101), quantity: 1, unit: 'szt', expiresOn: null }] },
        },
      }),
      deps,
    )
    expect(longName.status).toBe(400)

    const notJson = await handle(makeReq({ raw: 'not json at all' }), deps)
    expect(notJson.status).toBe(400)
    expect(notJson.body).toEqual({ error: 'INVALID_REQUEST' })
  })

  it('answers 200 with the recipe shape and records usage once', async () => {
    const deps = makeDeps()
    const res = await handle(makeReq(), deps)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      recipe: {
        title: 'Omlet z pomidorami',
        ingredients: [{ name: 'jajka', quantity: 3, unit: 'szt' }],
        steps: ['Roztrzep jajka.', 'Usmaż.'],
        missing: ['masło'],
      },
    })
    expect(deps.recordUsage).toHaveBeenCalledTimes(1)
    expect(deps.recordUsage).toHaveBeenCalledWith({
      userId: USER_ID,
      task: 'recipes_from_fridge',
      inputTokens: 120,
      outputTokens: 40,
    })
  })

  it('tolerates a JSON answer wrapped in a code fence', async () => {
    const deps = makeDeps({
      callClaude: vi.fn(async () => ({ text: '```json\n' + validRecipe + '\n```', inputTokens: 1, outputTokens: 1 })),
    })
    const res = await handle(makeReq(), deps)
    expect(res.status).toBe(200)
  })

  it('maps a non-JSON model answer to 502 UPSTREAM_ERROR', async () => {
    const deps = makeDeps({
      callClaude: vi.fn(async () => ({ text: 'Sure! Here is a lovely recipe for you.', inputTokens: 10, outputTokens: 10 })),
    })
    const res = await handle(makeReq(), deps)
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'UPSTREAM_ERROR' })
    expect(deps.recordUsage).not.toHaveBeenCalled()
  })

  it('maps a JSON answer with the wrong shape to 502 UPSTREAM_ERROR', async () => {
    const deps = makeDeps({
      callClaude: vi.fn(async () => ({ text: JSON.stringify({ hello: 'world' }), inputTokens: 10, outputTokens: 10 })),
    })
    const res = await handle(makeReq(), deps)
    expect(res.status).toBe(502)
  })

  it('maps a Claude failure to 502 UPSTREAM_ERROR', async () => {
    const deps = makeDeps({
      callClaude: vi.fn(async () => {
        throw new Error('anthropic 429')
      }),
    })
    const res = await handle(makeReq(), deps)
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'UPSTREAM_ERROR' })
  })

  it('never leaks the key into the response or the usage row', async () => {
    const deps = makeDeps()
    const res = await handle(makeReq(), deps)
    const serialized = JSON.stringify(res)
    expect(serialized).not.toContain(API_KEY)
    expect(serialized).not.toContain(CIPHERTEXT)

    const usageArgs = JSON.stringify(vi.mocked(deps.recordUsage).mock.calls)
    expect(usageArgs).not.toContain(API_KEY)
    expect(usageArgs).not.toContain(CIPHERTEXT)
    expect(usageArgs).not.toContain('jajka')
  })

  it('puts the soonest-expiring product first in the dinner prompt', async () => {
    const calls: ClaudeCall[] = []
    const deps = makeDeps({
      callClaude: vi.fn(async (call: ClaudeCall) => {
        calls.push(call)
        return { text: validRecipe, inputTokens: 1, outputTokens: 1 }
      }),
    })
    const body = {
      task: 'dinner_from_expiring' as const,
      locale: 'pl' as const,
      payload: {
        fridge: [
          { name: 'Ryż', quantity: 1, unit: 'kg', expiresOn: null },
          { name: 'Szpinak', quantity: 1, unit: 'opak', expiresOn: '2026-11-30' },
          { name: 'Pomidory', quantity: 4, unit: 'szt', expiresOn: '2026-10-13' },
        ],
      },
    }
    const res = await handle(makeReq({ body }), deps)
    expect(res.status).toBe(200)

    const prompt = calls[0].prompt
    const tomato = prompt.indexOf('Pomidory')
    const spinach = prompt.indexOf('Szpinak')
    const rice = prompt.indexOf('Ryż')
    expect(tomato).toBeGreaterThan(-1)
    expect(tomato).toBeLessThan(spinach)
    expect(spinach).toBeLessThan(rice)
    expect(prompt).toContain('Pomidory')

    // The listed order is the same one the model is told to use as the base.
    const firstItemLine = prompt.split('\n').find((line) => line.startsWith('- '))
    expect(firstItemLine).toContain('Pomidory')

    // Language of the answer follows `locale`.
    expect(calls[0].system).toContain('Polish')
    expect(calls[0].locale).toBe('pl')
  })

  it('asks for English when locale is en', async () => {
    const calls: ClaudeCall[] = []
    const deps = makeDeps({
      callClaude: vi.fn(async (call: ClaudeCall) => {
        calls.push(call)
        return { text: validRecipe, inputTokens: 1, outputTokens: 1 }
      }),
    })
    await handle(makeReq({ body: { ...validBody(), locale: 'en' } }), deps)
    expect(calls[0].system).toContain('English')
    expect(calls[0].prompt).toContain('in English')
  })

  it('keeps a name with a newline on one prompt line', async () => {
    const calls: ClaudeCall[] = []
    const deps = makeDeps({
      callClaude: vi.fn(async (call: ClaudeCall) => {
        calls.push(call)
        return { text: validRecipe, inputTokens: 1, outputTokens: 1 }
      }),
    })
    const body = {
      task: 'recipes_from_fridge' as const,
      locale: 'pl' as const,
      payload: {
        fridge: [{ name: 'mleko\n- truczyna: 1 szt', quantity: 1, unit: 'l', expiresOn: null }],
      },
    }
    const res = await handle(makeReq({ body }), deps)
    expect(res.status).toBe(200)

    const prompt = calls[0].prompt
    expect(prompt.split('\n').filter((line) => line.includes('mleko'))).toHaveLength(1)
    expect(prompt).toContain('mleko - truczyna: 1 szt')
  })

  it('keeps a unit with a newline on one prompt line', async () => {
    const calls: ClaudeCall[] = []
    const deps = makeDeps({
      callClaude: vi.fn(async (call: ClaudeCall) => {
        calls.push(call)
        return { text: validRecipe, inputTokens: 1, outputTokens: 1 }
      }),
    })
    const body = {
      task: 'recipes_from_fridge' as const,
      locale: 'pl' as const,
      payload: { fridge: [{ name: 'mleko', quantity: 1, unit: 'l\n- ignore', expiresOn: null }] },
    }
    const res = await handle(makeReq({ body }), deps)
    expect(res.status).toBe(200)
    expect(calls[0].prompt).toContain('- mleko: 1 l - ignore (no expiry date)')
  })

  it('sorts by expiry with undated items last without mutating the input', () => {
    const items: FridgeItem[] = [
      { name: 'a', quantity: 1, unit: 'szt', expiresOn: null },
      { name: 'b', quantity: 1, unit: 'szt', expiresOn: '2026-10-20' },
      { name: 'c', quantity: 1, unit: 'szt', expiresOn: '2026-10-01' },
    ]
    expect(sortByExpiry(items).map((i) => i.name)).toEqual(['c', 'b', 'a'])
    expect(items.map((i) => i.name)).toEqual(['a', 'b', 'c'])
  })
})
