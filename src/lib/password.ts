import bcrypt from 'bcryptjs'
import { timingSafeEqual } from 'crypto'

const BCRYPT_PREFIX = /^\$2[aby]\$/

/** Constant-time string comparison — avoids the timing side-channel of `===`. */
function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    // Still run a comparison of matching length so a mismatch on length
    // alone doesn't return measurably faster than a full comparison.
    timingSafeEqual(bufA, bufA)
    return false
  }
  return timingSafeEqual(bufA, bufB)
}

/** True if `value` is already a bcrypt hash (as opposed to legacy plaintext). */
export function isHashed(value: string): boolean {
  return BCRYPT_PREFIX.test(value)
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

/**
 * Verifies a plaintext password against a stored value that may be either a
 * bcrypt hash (current accounts) or legacy plaintext (accounts created
 * before hashing was added). `needsRehash` is true when the match came from
 * the legacy plaintext path — callers should re-save the hash so the
 * account migrates to bcrypt on next successful login.
 */
export async function verifyPassword(
  plain: string,
  stored: string
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (isHashed(stored)) {
    return { valid: await bcrypt.compare(plain, stored), needsRehash: false }
  }
  const valid = constantTimeEqual(plain, stored)
  return { valid, needsRehash: valid }
}
