// Minimal in-process TTL cache for expensive, read-heavy API responses
// (e.g. dashboard aggregates) that don't need Redis — this app runs as a
// single PM2 instance, so an in-memory Map is sufficient. Entries are lost
// on restart/redeploy, which is fine: they're a short-lived read cache, not
// a source of truth, and always recomputed on the next miss.
const store = new Map<string, { value: unknown; expiresAt: number }>()

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return undefined
  }
  return entry.value as T
}

export function setCached<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs })
}

// Drops every cached entry whose key starts with the given prefix — call
// this after a write that would make a cached read stale before its TTL
// naturally expires (e.g. invalidateCachePrefix('dashboard:') after an
// appointment/invoice/expense mutation), so a 30s cache never has to mean
// "wait up to 30s to see your own change."
export function invalidateCachePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}
