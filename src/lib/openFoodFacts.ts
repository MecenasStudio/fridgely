// Product lookup by barcode in Open Food Facts (no key, HTTPS, CORS).
//
// Open Food Facts never provides an expiry date, so the caller always has to ask the
// user for one; this module only resolves a product name.

const ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product'
const FIELDS = 'product_name,product_name_pl,product_name_en'
const CODE_PATTERN = /^\d{8,14}$/

type ApiResponse = {
  status?: number
  product?: {
    product_name?: string
    product_name_pl?: string
    product_name_en?: string
  }
}

function firstFilled(values: (string | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return null
}

/**
 * Resolve a barcode to a product name, or `null` when the code is malformed or the
 * product is unknown. Network problems and server errors (5xx) throw instead.
 */
export async function lookupBarcode(code: string): Promise<{ name: string } | null> {
  const trimmed = code.trim()
  if (!CODE_PATTERN.test(trimmed)) return null

  const response = await fetch(`${ENDPOINT}/${trimmed}.json?fields=${FIELDS}`)
  if (response.status >= 500) throw new Error(`Open Food Facts responded ${response.status}`)

  let body: ApiResponse
  try {
    body = (await response.json()) as ApiResponse
  } catch {
    return null
  }

  if (body.status === 0) return null
  const name = firstFilled([
    body.product?.product_name_pl,
    body.product?.product_name,
    body.product?.product_name_en,
  ])
  return name ? { name } : null
}
