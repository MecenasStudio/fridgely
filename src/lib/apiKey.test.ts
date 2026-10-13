import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiKeyError, saveKey, clearKey, getKeyStatus } from './apiKey'

const BASE_URL = 'https://test-project.supabase.co'
const TOKEN = 'jwt-token-1'

const state: {
  token: string
  rpc: { data: unknown; error: { message: string } | null }
} = { token: TOKEN, rpc: { data: [], error: null } }

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: state.token ? { access_token: state.token } : null },
        error: null,
      }),
    },
    rpc: async () => state.rpc,
  },
}))

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
    throw new Error('expected a rejection')
  } catch (error) {
    expect(error).toBeInstanceOf(ApiKeyError)
    return (error as ApiKeyError).code
  }
}

describe('apiKey', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    state.token = TOKEN
    state.rpc = { data: [], error: null }
    fetchMock = vi.fn(async () => jsonResponse(200, { last4: 'abcd' }))
    vi.stubEnv('VITE_SUPABASE_URL', BASE_URL)
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('posts the key to save-key with the user JWT and returns last4', async () => {
    const result = await saveKey('sk-ant-secret-value')
    expect(result).toEqual({ last4: 'abcd' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE_URL}/functions/v1/save-key`)
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ authorization: `Bearer ${TOKEN}` })
    expect(JSON.parse(String(init.body))).toEqual({ apiKey: 'sk-ant-secret-value' })
  })

  it('maps 400 to INVALID_KEY', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: 'INVALID_KEY' }))
    expect(await codeOf(() => saveKey('nope'))).toBe('INVALID_KEY')
  })

  it('maps 401 to UNAUTHENTICATED', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'UNAUTHENTICATED' }))
    expect(await codeOf(() => saveKey('sk-ant-x'))).toBe('UNAUTHENTICATED')
  })

  it('maps a failed request to NETWORK', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await codeOf(() => saveKey('sk-ant-x'))).toBe('NETWORK')
  })

  it('maps a 200 without last4 to NETWORK', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}))
    expect(await codeOf(() => saveKey('sk-ant-x'))).toBe('NETWORK')
  })

  it('rejects without a session and without calling the network', async () => {
    state.token = ''
    expect(await codeOf(() => saveKey('sk-ant-x'))).toBe('UNAUTHENTICATED')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('deletes the key with DELETE and expects 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await clearKey()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE_URL}/functions/v1/save-key`)
    expect(init.method).toBe('DELETE')
  })

  it('maps a failed delete to NETWORK', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }))
    expect(await codeOf(() => clearKey())).toBe('NETWORK')
  })

  it('reads the key status from the RPC', async () => {
    state.rpc = { data: [{ has_key: true, last4: 'wxyz' }], error: null }
    expect(await getKeyStatus()).toEqual({ hasKey: true, last4: 'wxyz' })
  })

  it('reports no key when the RPC returns no rows', async () => {
    state.rpc = { data: [], error: null }
    expect(await getKeyStatus()).toEqual({ hasKey: false, last4: null })
  })

  it('maps an RPC failure to NETWORK', async () => {
    state.rpc = { data: null, error: { message: 'boom' } }
    expect(await codeOf(() => getKeyStatus())).toBe('NETWORK')
  })
})
