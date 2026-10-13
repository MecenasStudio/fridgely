import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { askAi, recognizePhoto, readLabelDate, AiError } from './ai'
import type { AiLocale, AiTask } from './ai'

const BASE_URL = 'https://test-project.supabase.co'
const TOKEN = 'jwt-token-1'

// Mutable session state the mocked Supabase client hands back; one test empties it.
const state: { token: string } = { token: TOKEN }

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: state.token ? { access_token: state.token } : null },
        error: null,
      }),
    },
  },
}))

const payload = {
  fridge: [{ name: 'Mleko', quantity: 1, unit: 'l', expiresOn: '2026-10-13' }],
}

const recipe = {
  title: 'Omlet',
  ingredients: [{ name: 'jajka', quantity: 3, unit: 'szt' }],
  steps: ['Roztrzep jajka.'],
  missing: ['masło'],
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function unreadableResponse(): Response {
  return {
    ok: false,
    status: 500,
    json: async () => {
      throw new Error('not json')
    },
  } as unknown as Response
}

async function codeOf(task: AiTask, locale: AiLocale = 'pl'): Promise<string> {
  try {
    await askAi(task, payload, locale)
    throw new Error('expected askAi to reject')
  } catch (error) {
    expect(error).toBeInstanceOf(AiError)
    return (error as AiError).code
  }
}

/** Same idea as `codeOf`, for the two photo helpers. */
async function photoCodeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
    throw new Error('expected a rejection')
  } catch (error) {
    expect(error).toBeInstanceOf(AiError)
    return (error as AiError).code
  }
}

describe('askAi', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    state.token = TOKEN
    vi.stubEnv('VITE_SUPABASE_URL', BASE_URL)
    fetchMock = vi.fn(async () => jsonResponse(200, { recipe }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('posts the task to the ai function with the user JWT and no key', async () => {
    const result = await askAi('recipes_from_fridge', payload, 'pl')
    expect(result).toEqual(recipe)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE_URL}/functions/v1/ai`)
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ authorization: `Bearer ${TOKEN}` })

    const sent = JSON.parse(String(init.body))
    expect(sent).toEqual({ task: 'recipes_from_fridge', locale: 'pl', payload })
    expect(JSON.stringify(init)).not.toMatch(/anthropic|x-api-key/i)
  })

  it('sends the dinner task and the requested locale', async () => {
    await askAi('dinner_from_expiring', payload, 'en')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({ task: 'dinner_from_expiring', locale: 'en' })
  })

  it('maps 401 to UNAUTHENTICATED', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'UNAUTHENTICATED' }))
    expect(await codeOf('recipes_from_fridge')).toBe('UNAUTHENTICATED')
  })

  it('maps 400 to INVALID_REQUEST', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: 'INVALID_REQUEST' }))
    expect(await codeOf('recipes_from_fridge')).toBe('INVALID_REQUEST')
  })

  it('maps 409 to NO_API_KEY', async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { error: 'NO_API_KEY' }))
    expect(await codeOf('recipes_from_fridge')).toBe('NO_API_KEY')
  })

  it('maps 502 to UPSTREAM_ERROR', async () => {
    fetchMock.mockResolvedValue(jsonResponse(502, { error: 'UPSTREAM_ERROR' }))
    expect(await codeOf('dinner_from_expiring')).toBe('UPSTREAM_ERROR')
  })

  it('maps an unexpected status without a known code to UPSTREAM_ERROR', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'BOOM' }))
    expect(await codeOf('recipes_from_fridge')).toBe('UPSTREAM_ERROR')
  })

  it('maps an unreadable error body to UPSTREAM_ERROR', async () => {
    fetchMock.mockResolvedValue(unreadableResponse())
    expect(await codeOf('recipes_from_fridge')).toBe('UPSTREAM_ERROR')
  })

  it('maps a network failure to UPSTREAM_ERROR', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await codeOf('recipes_from_fridge')).toBe('UPSTREAM_ERROR')
  })

  it('maps a malformed 200 body to UPSTREAM_ERROR', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { recipe: { title: 'x' } }))
    expect(await codeOf('recipes_from_fridge')).toBe('UPSTREAM_ERROR')
  })

  it('rejects with UNAUTHENTICATED without calling the network when there is no session', async () => {
    state.token = ''
    expect(await codeOf('recipes_from_fridge')).toBe('UNAUTHENTICATED')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects with UPSTREAM_ERROR when the Supabase URL is not configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    expect(await codeOf('recipes_from_fridge')).toBe('UPSTREAM_ERROR')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('exposes status and message on AiError', async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { error: 'NO_API_KEY' }))
    try {
      await askAi('recipes_from_fridge', payload, 'pl')
      throw new Error('expected rejection')
    } catch (error) {
      const aiError = error as AiError
      expect(aiError.name).toBe('AiError')
      expect(aiError.code).toBe('NO_API_KEY')
      expect(aiError.status).toBe(409)
      expect(aiError.message).toContain('409')
    }
  })

  describe('photo tasks', () => {
    const photo = { mediaType: 'image/jpeg' as const, data: 'AAAA' }

    it('sends recognize_photo and returns the detected products', async () => {
      const items = [{ name: 'Mleko', quantity: 1, unit: 'l', expiresOn: null }]
      fetchMock.mockResolvedValue(jsonResponse(200, { items }))

      expect(await recognizePhoto(photo, 'pl')).toEqual(items)

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(`${BASE_URL}/functions/v1/ai`)
      expect(JSON.parse(String(init.body))).toEqual({
        task: 'recognize_photo',
        locale: 'pl',
        payload: { image: photo },
      })
    })

    it('rejects a recognized list with a broken entry', async () => {
      for (const items of [[{ name: 'Mleko' }], [{ name: 'Mleko', quantity: '1', unit: 'l', expiresOn: null }], 'milk']) {
        fetchMock.mockResolvedValue(jsonResponse(200, { items }))
        expect(await photoCodeOf(() => recognizePhoto(photo, 'pl'))).toBe('UPSTREAM_ERROR')
      }
    })

    it('rejects recognize_photo without an items array', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, {}))
      expect(await photoCodeOf(() => recognizePhoto(photo, 'pl'))).toBe('UPSTREAM_ERROR')
    })

    it('sends read_label_date and returns the date', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { expiresOn: '2026-11-30' }))
      expect(await readLabelDate({ mediaType: 'image/png', data: 'BBBB' }, 'en')).toBe('2026-11-30')

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(JSON.parse(String(init.body))).toMatchObject({ task: 'read_label_date', locale: 'en' })
    })

    it('returns null when the label has no readable date', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { expiresOn: null }))
      expect(await readLabelDate(photo, 'pl')).toBeNull()
    })

    it('rejects a malformed read_label_date body', async () => {
      for (const body of [{}, { expiresOn: 5 }]) {
        fetchMock.mockResolvedValue(jsonResponse(200, body))
        expect(await photoCodeOf(() => readLabelDate(photo, 'pl'))).toBe('UPSTREAM_ERROR')
      }
    })

    it('maps error codes for both photo tasks', async () => {
      fetchMock.mockResolvedValue(jsonResponse(409, { error: 'NO_API_KEY' }))
      expect(await photoCodeOf(() => recognizePhoto(photo, 'pl'))).toBe('NO_API_KEY')
      expect(await photoCodeOf(() => readLabelDate(photo, 'pl'))).toBe('NO_API_KEY')

      fetchMock.mockResolvedValue(jsonResponse(400, { error: 'INVALID_REQUEST' }))
      expect(await photoCodeOf(() => recognizePhoto(photo, 'pl'))).toBe('INVALID_REQUEST')
    })
  })
})
