import fs from 'fs'
import path from 'path'
import { platformAdminDb } from './platform-db'

// ---------------------------------------------------------------------------
// Platform Admin sessions — a SEPARATE session world from tenant sessions.
// Different directory, different cookie, different token namespace: a tenant
// session token can never be presented as a platform session or vice versa.
// ---------------------------------------------------------------------------

const PLATFORM_SESSIONS_DIR = path.join(process.cwd(), '.platform-sessions')

// Shorter TTL than tenant sessions (8h vs 30d) — this login has god-mode
// power over every clinic's data, so a stolen token must age out fast.
const PLATFORM_SESSION_TTL_MS = 8 * 60 * 60 * 1000

export const PLATFORM_SESSION_COOKIE_NAME = 'platform_session_token'

export interface PlatformSessionAdmin {
  id: string
  email: string
  name: string
}

interface StoredPlatformSession {
  admin: PlatformSessionAdmin
  createdAt: number
}

function ensureDir() {
  if (!fs.existsSync(PLATFORM_SESSIONS_DIR)) fs.mkdirSync(PLATFORM_SESSIONS_DIR, { recursive: true })
}

function tokenToFilename(token: string): string {
  return token.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json'
}

export function createPlatformSession(token: string, admin: PlatformSessionAdmin) {
  ensureDir()
  fs.writeFileSync(
    path.join(PLATFORM_SESSIONS_DIR, tokenToFilename(token)),
    JSON.stringify({ admin, createdAt: Date.now() } satisfies StoredPlatformSession),
    'utf-8'
  )
}

export function deletePlatformSession(token: string) {
  ensureDir()
  const filePath = path.join(PLATFORM_SESSIONS_DIR, tokenToFilename(token))
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch {}
}

type SessionRequest = { headers: { get: (name: string) => string | null }; cookies?: { get: (name: string) => { value: string } | undefined } }

export async function getPlatformAdmin(request: SessionRequest): Promise<PlatformSessionAdmin | null> {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
  const match = authHeader?.match(/^Bearer\s+(.+)$/i)
  const token = match?.[1] || request.cookies?.get(PLATFORM_SESSION_COOKIE_NAME)?.value
  if (!token) return null

  ensureDir()
  const filePath = path.join(PLATFORM_SESSIONS_DIR, tokenToFilename(token))
  try {
    if (!fs.existsSync(filePath)) return null
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as StoredPlatformSession
    if (!parsed?.admin || !parsed.createdAt || Date.now() - parsed.createdAt > PLATFORM_SESSION_TTL_MS) {
      try { fs.unlinkSync(filePath) } catch {}
      return null
    }
    // Re-verify against the DB on every request: a deactivated platform
    // admin loses access immediately, not when their session file expires.
    const live = await platformAdminDb.findUnique({ where: { id: parsed.admin.id } })
    if (!live || !live.isActive) {
      try { fs.unlinkSync(filePath) } catch {}
      return null
    }
    return parsed.admin
  } catch {
    try { fs.unlinkSync(filePath) } catch {}
    return null
  }
}

export async function requirePlatformAdmin(request: SessionRequest): Promise<PlatformSessionAdmin> {
  const admin = await getPlatformAdmin(request)
  if (!admin) throw new Error('Unauthorized')
  return admin
}
