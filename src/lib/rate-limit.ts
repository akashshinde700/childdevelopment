// Simple in-memory login rate limiter. Deliberately process-local (no Redis) —
// this app runs as a single PM2 process per deploy.py, so in-memory state is
// consistent for the current deployment topology. If this ever moves to a
// multi-instance deployment, swap the Map for a shared store.

interface Attempt {
  count: number
  firstAttemptAt: number
  lockedUntil?: number
}

const attempts = new Map<string, Attempt>()

const WINDOW_MS = 15 * 60 * 1000 // failed attempts count within a 15-minute window
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000 // locked out for 15 minutes after MAX_ATTEMPTS

export function checkLoginLockout(key: string): { locked: boolean; retryAfterSeconds?: number } {
  const a = attempts.get(key)
  if (!a?.lockedUntil) return { locked: false }
  if (Date.now() < a.lockedUntil) {
    return { locked: true, retryAfterSeconds: Math.ceil((a.lockedUntil - Date.now()) / 1000) }
  }
  attempts.delete(key)
  return { locked: false }
}

export function recordFailedLogin(key: string): void {
  const now = Date.now()
  const a = attempts.get(key)
  if (!a || now - a.firstAttemptAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttemptAt: now })
    return
  }
  a.count++
  if (a.count >= MAX_ATTEMPTS) {
    a.lockedUntil = now + LOCKOUT_MS
  }
  attempts.set(key, a)
}

export function clearLoginAttempts(key: string): void {
  attempts.delete(key)
}
