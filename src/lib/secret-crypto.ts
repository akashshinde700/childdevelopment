import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

// Reversible encryption for secrets the Platform Admin must be able to
// retrieve later (e.g. a clinic's generated login password, shown again in
// the Organizations list). This is NOT for authentication — auth always
// checks the bcrypt `password` hash (see password.ts). This only protects
// the plaintext copy against a raw database leak.
//
// AES-256-GCM: a random 12-byte IV per value + the auth tag are stored
// alongside the ciphertext, so nothing here is reused across encryptions.

const ALGO = 'aes-256-gcm'
const IV_LENGTH = 12

function getKey(): Buffer {
  const secret = process.env.ORG_PASSWORD_ENC_KEY
  if (!secret) {
    throw new Error('ORG_PASSWORD_ENC_KEY is not set — required to store/retrieve generated passwords')
  }
  // scrypt derives a fixed 32-byte key from a secret of any length/format.
  return scryptSync(secret, 'org-password-enc', 32)
}

/** Encrypts `plain`; returns `iv:authTag:ciphertext`, all hex-encoded. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`
}

/** Reverses encryptSecret(). Returns null (never throws) if `enc` is malformed or undecryptable. */
export function decryptSecret(enc: string | null | undefined): string | null {
  if (!enc) return null
  try {
    const [ivHex, tagHex, dataHex] = enc.split(':')
    if (!ivHex || !tagHex || !dataHex) return null
    const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    const plain = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()])
    return plain.toString('utf-8')
  } catch {
    return null
  }
}
