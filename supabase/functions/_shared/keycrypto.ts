// AES-GCM envelope for `user_secrets.anthropic_key_encrypted`. Shared by `save-key`
// (encrypt) and `ai` (decrypt) so the stored format has exactly one definition.
//
// Stored string: base64( iv (12 bytes) || ciphertext || tag (16 bytes) ).
// Key: SHA-256(KEY_ENCRYPTION_SECRET). AAD binds the blob to this column and project,
// so a value copied from elsewhere fails to decrypt instead of yielding a wrong key.

const CONTEXT = 'fridgely:user_secrets:anthropic_key:v1'
const IV_BYTES = 12
const TAG_BYTES = 16

async function aesKey(secret: string, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  if (!secret) throw new Error('missing encryption secret')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [usage])
}

function aad(supabaseUrl: string): Uint8Array {
  return new TextEncoder().encode(`${CONTEXT}:${supabaseUrl}`)
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function encryptKey(
  plaintext: string,
  secret: string,
  supabaseUrl: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad(supabaseUrl), tagLength: TAG_BYTES * 8 },
      await aesKey(secret, 'encrypt'),
      new TextEncoder().encode(plaintext),
    ),
  )
  const out = new Uint8Array(IV_BYTES + sealed.length)
  out.set(iv, 0)
  out.set(sealed, IV_BYTES)
  return toBase64(out)
}

export async function decryptKey(
  ciphertext: string,
  secret: string,
  supabaseUrl: string,
): Promise<string> {
  const payload = fromBase64(ciphertext)
  if (payload.length <= IV_BYTES + TAG_BYTES) throw new Error('encrypted key is too short')
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: payload.slice(0, IV_BYTES),
      additionalData: aad(supabaseUrl),
      tagLength: TAG_BYTES * 8,
    },
    await aesKey(secret, 'decrypt'),
    payload.slice(IV_BYTES),
  )
  return new TextDecoder().decode(plaintext)
}
