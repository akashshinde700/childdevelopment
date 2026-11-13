import fs from 'fs'
import path from 'path'
import { randomInt, createHash } from 'crypto'

// File-backed OTP store (survives dev-server hot reloads, unlike an
// in-memory Map). One active OTP per email per scope; 5-minute expiry;
// max 5 verify attempts per code.
//
// `scope` separates the two login worlds: 'platform' (Platform Admin) and
// 'tenant' (clinic users). The same email can exist in both — a platform
// OTP must never validate a tenant login or vice versa.

export type OtpScope = 'platform' | 'tenant'

const OTP_DIR = path.join(process.cwd(), '.platform-otp')
const OTP_TTL_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 5

interface StoredOtp {
  codeHash: string
  createdAt: number
  attempts: number
}

function ensureDir() {
  if (!fs.existsSync(OTP_DIR)) fs.mkdirSync(OTP_DIR, { recursive: true })
}

function fileFor(email: string, scope: OtpScope): string {
  const safe = createHash('sha256').update(`${scope}:${email.toLowerCase().trim()}`).digest('hex').slice(0, 32)
  return path.join(OTP_DIR, `${scope}-${safe}.json`)
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

export function issueOtp(email: string, scope: OtpScope = 'platform'): string {
  ensureDir()
  const code = String(randomInt(100000, 1000000)) // 6 digits, crypto-random
  const stored: StoredOtp = { codeHash: hashCode(code), createdAt: Date.now(), attempts: 0 }
  fs.writeFileSync(fileFor(email, scope), JSON.stringify(stored), 'utf-8')
  return code
}

export function verifyOtp(email: string, code: string, scope: OtpScope = 'platform'): { ok: boolean; error?: string } {
  ensureDir()
  const file = fileFor(email, scope)
  try {
    if (!fs.existsSync(file)) return { ok: false, error: 'No verification code found — log in again to get a new one' }
    const stored = JSON.parse(fs.readFileSync(file, 'utf-8')) as StoredOtp
    if (Date.now() - stored.createdAt > OTP_TTL_MS) {
      fs.unlinkSync(file)
      return { ok: false, error: 'Code expired — log in again to get a new one' }
    }
    if (stored.attempts >= MAX_ATTEMPTS) {
      fs.unlinkSync(file)
      return { ok: false, error: 'Too many wrong attempts — log in again to get a new code' }
    }
    if (hashCode(String(code).trim()) !== stored.codeHash) {
      stored.attempts += 1
      fs.writeFileSync(file, JSON.stringify(stored), 'utf-8')
      return { ok: false, error: `Wrong code (${MAX_ATTEMPTS - stored.attempts} attempts left)` }
    }
    fs.unlinkSync(file) // single use
    return { ok: true }
  } catch {
    try { fs.unlinkSync(file) } catch {}
    return { ok: false, error: 'Verification failed — log in again' }
  }
}
