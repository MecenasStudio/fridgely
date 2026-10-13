// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { encryptKey, decryptKey } from './keycrypto.ts'

const SECRET = 'test-secret-with-enough-entropy-0123456789'
const URL = 'https://example.supabase.co'
const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz'

describe('keycrypto', () => {
  it('round-trips a key', async () => {
    const blob = await encryptKey(KEY, SECRET, URL)
    expect(await decryptKey(blob, SECRET, URL)).toBe(KEY)
  })

  it('never contains the plaintext and differs per call (random IV)', async () => {
    const a = await encryptKey(KEY, SECRET, URL)
    const b = await encryptKey(KEY, SECRET, URL)
    expect(a).not.toContain(KEY)
    expect(a).not.toBe(b)
  })

  it('has the documented layout: 12-byte IV + ciphertext + 16-byte tag', async () => {
    const blob = await encryptKey(KEY, SECRET, URL)
    expect(Buffer.from(blob, 'base64').length).toBe(12 + KEY.length + 16)
  })

  it('fails with a different secret, a different project URL, or a tampered blob', async () => {
    const blob = await encryptKey(KEY, SECRET, URL)
    await expect(decryptKey(blob, 'another-secret', URL)).rejects.toThrow()
    await expect(decryptKey(blob, SECRET, 'https://other.supabase.co')).rejects.toThrow()
    const bytes = Buffer.from(blob, 'base64')
    bytes[20] ^= 0xff
    await expect(decryptKey(bytes.toString('base64'), SECRET, URL)).rejects.toThrow()
  })

  it('rejects an empty secret and a too-short blob', async () => {
    await expect(encryptKey(KEY, '', URL)).rejects.toThrow()
    await expect(decryptKey('AAAA', SECRET, URL)).rejects.toThrow()
  })
})
