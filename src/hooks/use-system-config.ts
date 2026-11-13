'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/api-client'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SystemConfigItem {
  id: string
  key: string
  label: string
  color: string | null
  sortOrder: number
  metadata: string | null
}

export interface AllSystemConfigItem extends SystemConfigItem {
  category: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

type ConfigMap = Record<string, SystemConfigItem[]>

// ─────────────────────────────────────────────────────────────────────────────
// Module-level cache
// ─────────────────────────────────────────────────────────────────────────────

let cache: ConfigMap | null = null
let fetchPromise: Promise<ConfigMap> | null = null
const subscribers = new Set<(value: ConfigMap | null) => void>()

function notifySubscribers() {
  for (const cb of subscribers) cb(cache)
}

/**
 * Clear the in-memory cache and force a refetch on the next hook mount.
 * Call this after any mutation (create / update / delete) so other
 * components using the config don't show stale data.
 */
export function clearConfigCache() {
  cache = null
  fetchPromise = null
  notifySubscribers()
}

async function fetchConfig(): Promise<ConfigMap> {
  if (cache) return cache
  if (fetchPromise) return fetchPromise

  fetchPromise = (async () => {
    try {
      const res = await authFetch('/api/config')
      if (!res.ok) {
        throw new Error(`Failed to fetch config: ${res.status}`)
      }
      const data = (await res.json()) as ConfigMap
      cache = data
      notifySubscribers()
      return data
    } catch (err) {
      fetchPromise = null
      throw err
    }
  })()
  return fetchPromise
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export interface UseSystemConfigResult {
  config: ConfigMap
  items: SystemConfigItem[]
  loading: boolean
}

/**
 * useSystemConfig(category?)
 *
 * Returns the full config map (keyed by category) plus a convenience
 * `items` array when a category is supplied. While loading, `items`
 * is `[]` and `config` is `{}` — callers should fall back to their
 * own hardcoded values during that window.
 */
export function useSystemConfig(category?: string): UseSystemConfigResult {
  // Lazy init from cache so a populated cache immediately reflects
  // without an extra synchronous setState-in-effect cycle.
  const [config, setConfig] = useState<ConfigMap>(() => cache ?? {})
  const [loading, setLoading] = useState<boolean>(() => cache ? false : true)

  useEffect(() => {
    let mounted = true

    // Subscribe to cache invalidations triggered by clearConfigCache().
    // A `null` means the cache was just cleared — trigger a refetch so the
    // list repopulates instead of staying empty until the component remounts.
    const cb = (next: ConfigMap | null) => {
      if (!mounted) return
      if (next === null) {
        setLoading(true)
        fetchConfig()
          .then((data) => {
            if (!mounted) return
            setConfig(data)
            setLoading(false)
          })
          .catch(() => {
            if (!mounted) return
            setConfig({})
            setLoading(false)
          })
        return
      }
      setConfig(next)
      setLoading(false)
    }
    subscribers.add(cb)

    // Kick off fetch if needed.
    fetchConfig()
      .then((data) => {
        if (!mounted) return
        setConfig(data)
        setLoading(false)
      })
      .catch(() => {
        if (!mounted) return
        // On error, leave items as [] so callers fall back to hardcoded.
        setConfig({})
        setLoading(false)
      })

    return () => {
      mounted = false
      subscribers.delete(cb)
    }
  }, [])

  const items = category ? config[category] ?? [] : []

  return { config, items, loading }
}
