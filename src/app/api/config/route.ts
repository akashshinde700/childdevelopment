import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { THERAPY_TYPES } from '@/lib/therapy-types'
import { requireSessionUser } from '@/lib/session'

/**
 * GET /api/config
 *   Any authenticated user.
 *   Optional: ?category=<category> to filter a single category.
 *   Returns only isActive=true items, grouped by category:
 *   {
 *     roles: [{ id, key, label, color, sortOrder, metadata }],
 *     therapy_types: [...],
 *     ...
 *   }
 */
// Default lists a clinic starts with, written as its OWN rows the first time
// its config is read — so Settings → System Config (and the "+ Add" options
// in forms) show a full list the clinic can add to and remove from, instead
// of a hidden fallback that vanished the moment the first custom item was
// added. Keys for appointment types match what appointments already store.
const DEFAULT_LISTS: Record<string, Array<{ key: string; label: string }>> = {
  therapy_types: THERAPY_TYPES.map((label) => ({
    key: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    label,
  })),
  appointment_types: [
    { key: 'consultation', label: 'Consultation' },
    { key: 'therapy', label: 'Therapy' },
    { key: 'assessment', label: 'Assessment' },
    { key: 'speech', label: 'Speech Therapy' },
    { key: 'occupational', label: 'Occupational Therapy' },
    { key: 'behavioral', label: 'Behavioral Therapy' },
  ],
}

async function seedDefaultLists(organizationId: string | null) {
  for (const [category, items] of Object.entries(DEFAULT_LISTS)) {
    try {
      // Only while the clinic has none at all, so a deliberately trimmed
      // list is never re-filled.
      const existing = await db.systemConfig.count({ where: { organizationId, category } })
      if (existing > 0) continue
      await db.systemConfig.createMany({
        data: items.map((it, i) => ({ organizationId, category, key: it.key, label: it.label, sortOrder: i + 1 })),
        skipDuplicates: true,
      })
    } catch (err) {
      // Never block reading the config over the convenience seed.
      console.error(`Could not seed ${category}:`, err)
    }
  }
}

export async function GET(request: NextRequest) {
  let user
  try {
    user = await requireSessionUser(request)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const organizationId = user.organizationId

  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')

    // First read for this clinic seeds its therapy types from the built-in
    // list, so Settings → System Config opens with a usable set the clinic
    // can then add to and remove from. Only ever runs while the clinic has
    // none at all, so a deliberately trimmed list is never re-filled.
    await seedDefaultLists(organizationId ?? null)

    const where: { isActive?: boolean; category?: string; organizationId?: string | null } = { isActive: true, organizationId }
    if (category) where.category = category

    const rows = await db.systemConfig.findMany({
      where,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      select: {
        id: true,
        category: true,
        key: true,
        label: true,
        color: true,
        sortOrder: true,
        metadata: true,
      },
    })

    const grouped: Record<string, Array<{
      id: string
      key: string
      label: string
      color: string | null
      sortOrder: number
      metadata: string | null
    }>> = {}

    for (const r of rows) {
      if (!grouped[r.category]) grouped[r.category] = []
      grouped[r.category].push({
        id: r.id,
        key: r.key,
        label: r.label,
        color: r.color,
        sortOrder: r.sortOrder,
        metadata: r.metadata,
      })
    }

    return NextResponse.json(grouped)
  } catch (error) {
    console.error('GET /api/config error:', error)
    return NextResponse.json({ error: 'Failed to fetch system config' }, { status: 500 })
  }
}
