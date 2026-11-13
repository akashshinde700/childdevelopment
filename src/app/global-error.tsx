'use client'

import { useEffect } from 'react'

/**
 * Global Error Boundary
 *
 * Catches runtime errors that escape the root layout, including:
 * - ChunkLoadError: "Failed to load chunk ..." — happens when the dev server
 *   recompiles and the browser holds a stale chunk reference. Auto-reloads
 *   the page once to recover.
 * - Other unexpected runtime errors — shown with a retry button.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // ChunkLoadError recovery: the dev server recompiled and the browser's
    // cached chunk path is stale. A single page reload fetches the fresh chunks.
    const isChunkLoadError =
      error.name === 'ChunkLoadError' ||
      /Failed to load chunk/i.test(error.message) ||
      /Loading chunk .* failed/i.test(error.message)

    if (isChunkLoadError) {
      // Guard against reload loops — only auto-reload once per session.
      const key = '__chunkload_reload_ts__'
      const last = sessionStorage.getItem(key)
      const now = Date.now()
      if (last && now - parseInt(last) < 10_000) {
        // Already reloaded within the last 10s — don't loop, let the user retry.
        return
      }
      sessionStorage.setItem(key, String(now))
      window.location.reload()
      return
    }

    // Log non-chunk errors for debugging
    console.error('Global error:', error)
  }, [error])

  const isChunkLoadError =
    error.name === 'ChunkLoadError' ||
    /Failed to load chunk/i.test(error.message) ||
    /Loading chunk .* failed/i.test(error.message)

  return (
    <html>
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            textAlign: 'center',
            backgroundColor: '#fafafa',
            color: '#1a1a1a',
          }}
        >
          <div
            style={{
              maxWidth: '420px',
              padding: '2rem',
              borderRadius: '12px',
              backgroundColor: '#fff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 700 }}>
              {isChunkLoadError ? 'Refreshing…' : 'Something went wrong'}
            </h2>
            <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', color: '#666' }}>
              {isChunkLoadError
                ? 'The app was updated. Reloading the page to get the latest version…'
                : 'An unexpected error occurred. Please try again.'}
            </p>
            {!isChunkLoadError && (
              <button
                onClick={reset}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#7c3aed',
                  color: '#fff',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Try Again
              </button>
            )}
          </div>
        </div>
      </body>
    </html>
  )
}
