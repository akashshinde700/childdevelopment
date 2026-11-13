import { useAppStore } from '@/store/app-store'

/**
 * Detects whether an error is a transient network error worth retrying.
 *
 * The browser throws a `TypeError: Failed to fetch` when:
 *  - the dev server is briefly restarting (HMR / Fast Refresh)
 *  - the network connection dropped for a moment
 *  - the server was temporarily unreachable
 *
 * These are transient and a single retry almost always succeeds. HTTP
 * errors (4xx / 5xx) are NOT network errors — they have a response object
 * and should not be retried here.
 */
function isNetworkError(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false
  // Browsers use "Failed to fetch"; some use "NetworkError when attempting
  // to fetch resource". Both are TypeErrors thrown by fetch().
  const msg = err.message.toLowerCase()
  return msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed')
}

/**
 * Fetch wrapper that attaches the Bearer token from the Zustand store.
 *
 * Resilience: automatically retries once on transient network errors
 * ("Failed to fetch" TypeErrors) which commonly occur in dev mode when
 * the Next.js dev server briefly restarts for HMR. Without this retry,
 * every page-load `useEffect` that fires during a server restart would
 * throw an uncaught TypeError and log a long stack trace to the console.
 *
 * If the server returns 401 (Unauthorized — e.g. after a server restart
 * that cleared session files), the stale token is cleaned up and the user
 * is redirected to the login page so they can re-authenticate.
 */
export async function authFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const token = useAppStore.getState().token
  const headers = new Headers(init?.headers ?? {})
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  // First attempt + one retry on transient network errors.
  const MAX_ATTEMPTS = 2
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(input, { ...init, headers })

      // Auto-logout on 401 — the session is no longer valid (server restart,
      // expired session file, etc.). Prevents "Unauthorized" console errors
      // from cascading across every API call.
      if (res.status === 401) {
        const store = useAppStore.getState()
        if (store.isAuthenticated) {
          store.logout()
        }
      }

      return res
    } catch (err) {
      lastError = err
      // Only retry on transient network errors. HTTP errors (4xx/5xx) are
      // returned as a Response above and never reach this catch block.
      if (isNetworkError(err) && attempt < MAX_ATTEMPTS) {
        // Brief delay before retrying — gives the dev server time to finish
        // restarting. 800ms is short enough to feel instant but long enough
        // for a typical HMR restart.
        await new Promise((resolve) => setTimeout(resolve, 800))
        continue
      }
      throw err
    }
  }

  // Should be unreachable (loop either returns or throws), but keeps TS happy.
  throw lastError
}

/**
 * Upload files with authentication.
 * Unlike authFetch, this does NOT create a new Headers object to avoid
 * interfering with the browser's automatic Content-Type setting for FormData.
 */
export function authUpload(input: RequestInfo, init?: RequestInit) {
  const token = useAppStore.getState().token
  // For FormData uploads, we must NOT set Content-Type manually.
  // The browser will auto-set it to multipart/form-data with the correct boundary.
  // We only need to set Authorization.
  const headers = new Headers()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return fetch(input, { ...init, headers })
}
