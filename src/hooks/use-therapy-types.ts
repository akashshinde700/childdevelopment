'use client'

import { useMemo } from 'react'
import { useSystemConfig } from '@/hooks/use-system-config'
import { THERAPY_TYPES } from '@/lib/therapy-types'

/**
 * The therapy types this clinic actually offers.
 *
 * Source of truth is the organization's own `therapy_types` list, which it
 * adds to and removes from in Settings → System Config — every clinic's
 * specializations differ, so nothing here is fixed. The built-in list is only
 * a starting point, used while the config loads and for a clinic that has not
 * set its own up yet; once it has, only its own types are offered.
 *
 * `extra` keeps values already in use visible (a therapist's specialization,
 * an existing package's type) even if nobody has added them to the list, so
 * editing an old record never silently drops its type.
 */
export function useTherapyTypes(extra: readonly (string | null | undefined)[] = []): string[] {
  const { items } = useSystemConfig('therapy_types')

  const extraKey = extra.filter(Boolean).join('|')
  return useMemo(() => {
    const configured = items.map((i) => i.label.trim()).filter(Boolean)
    const base = configured.length > 0 ? configured : THERAPY_TYPES
    const used = extraKey ? extraKey.split('|').map((t) => t.trim()).filter(Boolean) : []
    return Array.from(new Set([...base, ...used]))
    // extraKey is a stable string form of `extra` (a new array each render).
  }, [items, extraKey])
}
