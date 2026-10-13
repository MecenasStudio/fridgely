// Turning a picked photo into something the `ai` function accepts.
//
// Vision calls are billed by pixels, so the image is downscaled before it is sent, and
// re-encoded as JPEG to keep the base64 small. The browser APIs that do the real work
// (`createImageBitmap`, canvas) are injected through `deps`, which keeps `fitWithin`
// and the whole pipeline testable without a canvas.

import type { PhotoPayload } from './ai'

export type ImageSize = { width: number; height: number }

export type PrepareImageDeps = {
  /** Decode a blob into something with width/height (browser: `createImageBitmap`). */
  decode(file: Blob): Promise<ImageSize & { source: unknown }>
  /** Draw the decoded image at the computed size and return JPEG bytes. */
  encode(decoded: ImageSize & { source: unknown }, size: ImageSize, quality: number): Promise<Blob>
}

export const MAX_EDGE = 1280
export const JPEG_QUALITY = 0.8

/**
 * Fits `width`x`height` inside a `max` box without upscaling and without breaking the
 * aspect ratio. The longer edge lands exactly on `max` when the image is too big, and
 * the result is never rounded below 1 px.
 */
export function fitWithin(width: number, height: number, max: number): ImageSize {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 0
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 0
  if (safeWidth === 0 || safeHeight === 0) return { width: 0, height: 0 }

  const longest = Math.max(safeWidth, safeHeight)
  if (longest <= max) return { width: Math.round(safeWidth), height: Math.round(safeHeight) }

  const scale = max / longest
  return { width: Math.max(1, Math.round(safeWidth * scale)), height: Math.max(1, Math.round(safeHeight * scale)) }
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function defaultDecode(file: Blob): Promise<ImageSize & { source: unknown }> {
  const bitmap = await createImageBitmap(file)
  return { width: bitmap.width, height: bitmap.height, source: bitmap }
}

async function defaultEncode(
  decoded: ImageSize & { source: unknown },
  size: ImageSize,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas is not available')
  context.drawImage(decoded.source as CanvasImageSource, 0, 0, size.width, size.height)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('could not encode the image'))),
      'image/jpeg',
      quality,
    )
  })
}

/**
 * Downscale a picked photo to a JPEG `PhotoPayload` (base64, no `data:` prefix).
 * A zero-sized or undecodable image is an error rather than an empty payload.
 */
export async function prepareImage(
  file: Blob,
  deps: PrepareImageDeps = { decode: defaultDecode, encode: defaultEncode },
): Promise<PhotoPayload> {
  const decoded = await deps.decode(file)
  const size = fitWithin(decoded.width, decoded.height, MAX_EDGE)
  if (size.width === 0 || size.height === 0) throw new Error('image has no usable size')

  const encoded = await deps.encode(decoded, size, JPEG_QUALITY)
  const data = toBase64(await encoded.arrayBuffer())
  return { mediaType: 'image/jpeg', data }
}
