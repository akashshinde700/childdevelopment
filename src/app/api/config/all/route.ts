import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'

/**
 * GET /api/config/all
 *   Super Admin only.
 *   Returns ALL SystemConfig items (including inactive) for the admin
 *   management page, grouped by category.
 */
export async function GET(request: NextRequest) {
  let user
  try {
    user = await requireSessionUser(request)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden — Super Admin only' }, { status: 403 })
  }
  const organizationId = user.organizationId

  try {
    const rows = await db.systemConfig.findMany({
      where: { organizationId },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      select: {
        id: true,
        category: true,
        key: true,
        label: true,
        color: true,
        sortOrder: true,
        isActive: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    const grouped: Record<string, Array<typeof rows[number]>> = {}
    for (const r of rows) {
      if (!grouped[r.category]) grouped[r.category] = []
      grouped[r.category].push(r)
    }

    return NextResponse.json(grouped)
  } catch (error) {
    console.error('GET /api/config/all error:', error)
    return NextResponse.json({ error: 'Failed to fetch all system config' }, { status: 500 })
  }
}
