'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Convert a stored file path (e.g. "/uploads/filename.pdf") to the API route
 * that serves it ("/api/uploads/filename.pdf"). If the path is already an
 * absolute URL or doesn't start with /uploads/, return it as-is.
 *
 * Returns `null` for empty/undefined values so callers can distinguish
 * "no file stored" from "file stored at #".
 */
export function toFileUrl(storedPath: string | undefined | null): string | null {
  if (!storedPath || typeof storedPath !== 'string') return null
  const trimmed = storedPath.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('http')) return trimmed
  if (trimmed.startsWith('/uploads/')) {
    return `/api/uploads/${encodeURIComponent(trimmed.slice('/uploads/'.length))}`
  }
  // Anything else (plain text like "Autism", or a relative path) is NOT a
  // valid uploaded-file URL.
  return null
}

/**
 * Returns `true` only if `value` looks like a real uploaded-file reference —
 * i.e. a `/uploads/...` path or an absolute http(s) URL. Plain text values
 * (e.g. "Autism" set via Excel import) return `false`.
 */
export function isFileReference(value: string | undefined | null): boolean {
  if (!value || typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  return trimmed.startsWith('/uploads/') || trimmed.startsWith('http')
}

export type FileExistsStatus = 'idle' | 'checking' | 'exists' | 'missing' | 'invalid'

export interface UseFileExistsResult {
  /** Current verification status. */
  status: FileExistsStatus
  /** True while the HEAD request is in flight. */
  checking: boolean
  /** True only when the file has been verified to exist (HTTP 200). */
  exists: boolean
  /**
   * Re-run the existence check. Useful after a file is replaced or removed.
   * If `nextUrl` is omitted, the hook re-checks the currently bound URL.
   */
  recheck: (nextUrl?: string | null) => void
}

/**
 * Verify that an uploaded file still exists on the server.
 *
 * Sends a HEAD request to the file URL (resolved via `toFileUrl`). If the
 * server returns 404, the file is missing and `status` becomes `'missing'`.
 * This lets the UI auto-clear invalid stored paths and show the upload UI
 * instead of a broken "View File" link.
 *
 * - Pass the RAW stored path (e.g. "/uploads/123.pdf") — the hook resolves
 *   it to the API URL automatically.
 * - If the stored value is null/empty/text (not a file reference), the hook
 *   short-circuits to `'invalid'` without a network request.
 * - Set `enabled` to false to skip the check entirely (e.g. while loading).
 *
 * Implementation note: all `setState` calls happen inside async callbacks
 * (Promise `.then` / `.catch` / `queueMicrotask`) rather than synchronously
 * in the effect body, to comply with React 19's `set-state-in-effect` rule
 * and avoid cascading renders.
 */
export function useFileExists(
  storedPath: string | undefined | null,
  options?: { enabled?: boolean }
): UseFileExistsResult {
  const enabled = options?.enabled ?? true
  const [status, setStatus] = useState<FileExistsStatus>('idle')
  // Guard against stale responses: if the stored path changes while a request
  // is in flight, the old response is ignored.
  const requestIdRef = useRef(0)

  const performCheck = useCallback(
    (pathToCheck: string | undefined | null, isEnabled: boolean) => {
      const url = toFileUrl(pathToCheck)
      const myRequestId = ++requestIdRef.current

      if (!url) {
        // Not a file reference (null, empty, or plain text) — no network call.
        // Defer the setState so it isn't synchronous in the effect body.
        queueMicrotask(() => {
          if (requestIdRef.current === myRequestId) setStatus('invalid')
        })
        return
      }
      if (!isEnabled) {
        queueMicrotask(() => {
          if (requestIdRef.current === myRequestId) setStatus('idle')
        })
        return
      }

      // Mark as "checking" asynchronously so the effect doesn't trigger a
      // synchronous state update.
      queueMicrotask(() => {
        if (requestIdRef.current === myRequestId) setStatus('checking')
      })

      const controller = new AbortController()
      // Timeout so a hung request doesn't block the UI forever.
      const timeout = setTimeout(() => controller.abort(), 8000)

      fetch(url, { method: 'HEAD', signal: controller.signal })
        .then((res) => {
          if (requestIdRef.current !== myRequestId) return
          if (res.ok) setStatus('exists')
          else if (res.status === 404) setStatus('missing')
          else setStatus('invalid')
        })
        .catch(() => {
          if (requestIdRef.current !== myRequestId) return
          // Network error / abort — treat as missing rather than blocking the UI.
          setStatus('missing')
        })
        .finally(() => clearTimeout(timeout))
    },
    []
  )

  useEffect(() => {
    performCheck(storedPath, enabled)
  }, [storedPath, enabled, performCheck])

  const recheck = useCallback(
    (nextUrl?: string | null) => {
      performCheck(nextUrl !== undefined ? nextUrl : storedPath, enabled)
    },
    [performCheck, storedPath, enabled]
  )

  return {
    status,
    checking: status === 'checking',
    exists: status === 'exists',
    recheck,
  }
}
