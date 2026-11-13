'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * useDebouncedSearch — reusable debounced search hook.
 *
 * - 700ms debounce delay (configurable)
 * - Only triggers when the user has entered at least `minChars` characters (default 2)
 * - Preserves input focus (the raw value updates instantly, only the debounced
 *   value is delayed)
 * - Returns `{ query, debouncedQuery, setQuery, isDebouncing, clear }` so
 *   callers can show an inline loading indicator while debouncing.
 *
 * Usage:
 *   const { query, debouncedQuery, setQuery, isDebouncing, clear } = useDebouncedSearch()
 *   // `query` updates instantly (for the input value)
 *   // `debouncedQuery` updates after 700ms of inactivity (for API calls)
 *   // `isDebouncing` is true while waiting for the debounce to fire
 */

export function useDebouncedSearch(
  initialQuery = '',
  delay = 700,
  minChars = 2,
) {
  const [query, setQuery] = useState(initialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Derived: true when the user has typed something that hasn't been
  // debounced yet (and meets the min-chars threshold or is empty for clearing).
  const isDebouncing = query !== debouncedQuery && (query.length === 0 || query.length >= minChars)

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      if (query.length === 0 || query.length >= minChars) {
        setDebouncedQuery(query)
      }
    }, delay)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [query, delay, minChars])

  const clear = useCallback(() => {
    setQuery('')
    setDebouncedQuery('')
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
  }, [])

  return { query, debouncedQuery, setQuery, isDebouncing, clear }
}

export default useDebouncedSearch
