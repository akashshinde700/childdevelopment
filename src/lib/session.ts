import type { AuthUser } from '@/store/app-store'
import fs from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { isOrgActive } from '@/lib/subscription-limits'
import { getCached, setCached } from '@/lib/cache'

interface SessionUser extends AuthUser {
  employeeId?: string
}

const SESSIONS_DIR = path.join(process.cwd(), '.sessions')

// Sessions expire after 30 days (matches the cookie maxAge set at login) —
// a leaked token/cookie no longer stays valid forever.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

interface StoredSession {
  user: SessionUser
  createdAt: number
}

// Ensure sessions directory exists
function ensureSessionsDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true })
  }
}

// Sanitize token for use as filename (remove path traversal characters)
function tokenToFilename(token: string): string {
  return token.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json'
}

export function createSession(token: string, user: SessionUser) {
  ensureSessionsDir()
  const filePath = path.join(SESSIONS_DIR, tokenToFilename(token))
  const stored: StoredSession = { user, createdAt: Date.now() }
  fs.writeFileSync(filePath, JSON.stringify(stored), 'utf-8')
}

type SessionRequest =
  | Request
  | { headers: Headers; cookies?: { get: (name: string) => { value: string } | undefined } }
  | { headers: { get: (name: string) => string | null }; cookies?: { get: (name: string) => { value: string } | undefined } }

export const SESSION_COOKIE_NAME = 'session_token'

export async function getSessionUser(request: SessionRequest) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
  const match = authHeader?.match(/^Bearer\s+(.+)$/i)
  // Most API calls go through the Bearer-token path (attached by the
  // frontend's fetch wrapper). Plain browser-level requests — <img src>,
  // <a href>, direct navigation — can't set custom headers, so those rely
  // on the session cookie set at login instead (e.g. /api/uploads/[filename]).
  const token = match?.[1] || ('cookies' in request ? request.cookies?.get(SESSION_COOKIE_NAME)?.value : undefined)
  if (!token) return null

  ensureSessionsDir()
  const filePath = path.join(SESSIONS_DIR, tokenToFilename(token))

  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(data)

      // Legacy sessions written before expiry support have no `createdAt`
      // wrapper — treat them as expired so the user re-logs in once and gets
      // a properly-timestamped session from then on.
      if (!parsed || typeof parsed !== 'object' || !('createdAt' in parsed)) {
        try { fs.unlinkSync(filePath) } catch {}
        return null
      }

      const stored = parsed as StoredSession
      if (Date.now() - stored.createdAt > SESSION_TTL_MS) {
        try { fs.unlinkSync(filePath) } catch {}
        return null
      }

      // Self-healing: sessions created before the multi-tenant migration
      // (organizationId added to User) have no organizationId on the stored
      // user. Rather than forcing every already-logged-in user to re-login,
      // patch it in from the DB on first use after the migration and
      // persist the patch so this lookup only happens once per session.
      if (stored.user.organizationId === undefined) {
        const fresh = await db.user.findUnique({ where: { id: stored.user.id }, select: { organizationId: true } })
        stored.user.organizationId = fresh?.organizationId ?? null
        try { fs.writeFileSync(filePath, JSON.stringify(stored), 'utf-8') } catch {}
      }

      // Live re-check, not just at login: the session FILE is a snapshot
      // taken once at login, so a therapist deactivated (or "deleted" — see
      // DELETE /api/employees, which deactivates the linked login) after
      // that snapshot would otherwise keep working under their existing
      // session for up to the full 30-day TTL. Cached briefly (same pattern
      // as isOrgActive below) so this doesn't cost a DB round-trip on every
      // single request.
      const activeCacheKey = `user-active:${stored.user.id}`
      let isActive = getCached<boolean>(activeCacheKey)
      if (isActive === undefined) {
        const fresh = await db.user.findUnique({ where: { id: stored.user.id }, select: { isActive: true } })
        isActive = fresh?.isActive ?? false
        setCached(activeCacheKey, isActive, 30_000)
      }
      if (!isActive) {
        try { fs.unlinkSync(filePath) } catch {}
        return null
      }

      return stored.user
    }
  } catch {
    // Session file corrupted, remove it
    try { fs.unlinkSync(filePath) } catch {}
  }
  return null
}

export async function requireSessionUser(request: SessionRequest) {
  const user = await getSessionUser(request)
  if (!user) {
    throw new Error('Unauthorized')
  }
  // SaaS: a suspended / cancelled / trial-expired organization loses access
  // immediately (cached 60s in subscription-limits). Orgs with no
  // Subscription row are grandfathered as active.
  if (!(await isOrgActive(user.organizationId ?? null))) {
    throw new Error('Unauthorized')
  }
  return user
}

export function deleteSession(token: string) {
  ensureSessionsDir()
  const filePath = path.join(SESSIONS_DIR, tokenToFilename(token))
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch {}
}
