import { describe, it, expect, vi } from 'vitest'
import { fitWithin, prepareImage, JPEG_QUALITY, MAX_EDGE } from './image'

describe('fitWithin', () => {
  it('scales a landscape image so the longer edge hits the limit', () => {
    expect(fitWithin(2560, 1440, 1280)).toEqual({ width: 1280, height: 720 })
  })

  it('scales a portrait image by its longer edge', () => {
    expect(fitWithin(1440, 2560, 1280)).toEqual({ width: 720, height: 1280 })
  })

  it('never upscales an image that already fits', () => {
    expect(fitWithin(800, 600, 1280)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(1280, 1280, 1280)).toEqual({ width: 1280, height: 1280 })
  })

  it('keeps a square square', () => {
    expect(fitWithin(4000, 4000, 1280)).toEqual({ width: 1280, height: 1280 })
  })

  it('returns zeros for a zero or broken size', () => {
    expect(fitWithin(0, 100, 1280)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(100, 0, 1280)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(0, 0, 1280)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(Number.NaN, 100, 1280)).toEqual({ width: 0, height: 0 })
  })

  it('rounds to whole pixels without collapsing a thin image to zero', () => {
    expect(fitWithin(4000, 3, 1280)).toEqual({ width: 1280, height: 1 })
  })
})

describe('prepareImage', () => {
  const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])

  function deps(size = { width: 2560, height: 1440 }) {
    const decode = vi.fn(async () => ({ ...size, source: 'bitmap' }))
    const encode = vi.fn(async () => new Blob([jpegBytes], { type: 'image/jpeg' }))
    return { decode, encode }
  }

  it('decodes, downscales, encodes and returns plain base64', async () => {
    const d = deps()
    const payload = await prepareImage(new Blob(['x']), d)

    expect(d.decode).toHaveBeenCalledTimes(1)
    expect(d.encode).toHaveBeenCalledWith(
      { width: 2560, height: 1440, source: 'bitmap' },
      { width: 1280, height: 720 },
      JPEG_QUALITY,
    )
    expect(payload.mediaType).toBe('image/jpeg')
    expect(payload.data).not.toMatch(/^data:/)
    // Round-trips to exactly the bytes the encoder produced (no Node Buffer needed).
    expect(atob(payload.data)).toBe('\xff\xd8\xff\xe0')
  })

  it('leaves an image that already fits at its own size', async () => {
    const d = deps({ width: 640, height: 480 })
    await prepareImage(new Blob(['x']), d)
    expect(d.encode).toHaveBeenCalledWith(expect.anything(), { width: 640, height: 480 }, JPEG_QUALITY)
  })

  it('rejects an image with no usable size', async () => {
    const d = deps({ width: 0, height: 0 })
    await expect(prepareImage(new Blob(['x']), d)).rejects.toThrow('no usable size')
    expect(d.encode).not.toHaveBeenCalled()
  })

  it('uses the documented limits', () => {
    expect(MAX_EDGE).toBe(1280)
    expect(JPEG_QUALITY).toBe(0.8)
  })
})
