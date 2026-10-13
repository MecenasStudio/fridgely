import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { lookupBarcode } from './openFoodFacts'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('lookupBarcode', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async () => jsonResponse(200, { status: 1, product: { product_name: 'Milk' } }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prefers the Polish name', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        status: 1,
        product: { product_name: 'Milk', product_name_pl: 'Mleko', product_name_en: 'Milk' },
      }),
    )
    expect(await lookupBarcode('5901234123457')).toEqual({ name: 'Mleko' })

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe(
      'https://world.openfoodfacts.org/api/v2/product/5901234123457.json?fields=product_name,product_name_pl,product_name_en',
    )
  })

  it('falls back to the generic name and then to English', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: 1, product: { product_name: '  Generic  ' } }))
    expect(await lookupBarcode('12345678')).toEqual({ name: 'Generic' })

    fetchMock.mockResolvedValue(jsonResponse(200, { status: 1, product: { product_name_en: 'Butter' } }))
    expect(await lookupBarcode('12345678')).toEqual({ name: 'Butter' })
  })

  it('returns null for an unknown product', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: 0 }))
    expect(await lookupBarcode('12345678')).toBeNull()

    fetchMock.mockResolvedValue(jsonResponse(200, { status: 1, product: { product_name: '   ' } }))
    expect(await lookupBarcode('12345678')).toBeNull()

    fetchMock.mockResolvedValue(jsonResponse(404, {}))
    expect(await lookupBarcode('12345678')).toBeNull()
  })

  it('returns null for a malformed code without calling fetch', async () => {
    for (const bad of ['123', '1234567', '123456789012345', 'abc12345', '', '  ']) {
      expect(await lookupBarcode(bad)).toBeNull()
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws on a server error', async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, {}))
    await expect(lookupBarcode('12345678')).rejects.toThrow('503')
  })

  it('propagates a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(lookupBarcode('12345678')).rejects.toThrow('Failed to fetch')
  })
})
