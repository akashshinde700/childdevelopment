import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'

async function assertSuperAdmin(request: NextRequest) {
  let user
  try {
    user = await requireSessionUser(request)
  } catch {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (user.role !== 'super_admin') {
    return { error: NextResponse.json({ error: 'Forbidden — Super Admin only' }, { status: 403 }) }
  }
  return { user }
}

/**
 * POST /api/config/item
 *   Body: { category, key, label, color?, sortOrder?, isActive?, metadata? }
 *   Create-or-update (upsert) by [category, key].
 */
export async function POST(request: NextRequest) {
  const guard = await assertSuperAdmin(request)
  if (guard.error) return guard.error
  const organizationId = guard.user.organizationId

  try {
    const body = await request.json()
    const {
      category,
      key,
      label,
      color = null,
      sortOrder = 0,
      isActive = true,
      metadata = null,
    } = body || {}

    if (!category || !key || !label) {
      return NextResponse.json(
        { error: 'category, key, and label are required' },
        { status: 400 },
      )
    }

    // Scoped to this organization — one clinic's save can never match or
    // overwrite another clinic's row. Matched by hand because organizationId
    // is nullable and Prisma can't target a NULL inside a compound unique.
    const existing = await db.systemConfig.findFirst({
      where: { organizationId: organizationId ?? null, category: String(category), key: String(key) },
      select: { id: true },
    })
    const item = await db.systemConfig.upsert({
      where: { id: existing?.id ?? '__none__' },
      update: {
        label: String(label),
        color: color ? String(color) : null,
        sortOrder: Number(sortOrder) || 0,
        isActive: Boolean(isActive),
        metadata: metadata ? String(metadata) : null,
      },
      create: {
        category: String(category),
        key: String(key),
        label: String(label),
        color: color ? String(color) : null,
        sortOrder: Number(sortOrder) || 0,
        isActive: Boolean(isActive),
        metadata: metadata ? String(metadata) : null,
        organizationId,
      },
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error('POST /api/config/item error:', error)
    return NextResponse.json({ error: 'Failed to create/update config item' }, { status: 500 })
  }
}

/**
 * PUT /api/config/item
 *   Body: { id, label?, color?, sortOrder?, isActive?, metadata? }
 *   Update an existing item by id.
 */
export async function PUT(request: NextRequest) {
  const guard = await assertSuperAdmin(request)
  if (guard.error) return guard.error
  const organizationId = guard.user.organizationId

  try {
    const body = await request.json()
    const { id, label, color, sortOrder, isActive, metadata } = body || {}

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const owned = await db.systemConfig.findFirst({ where: { id: String(id), organizationId } })
    if (!owned) {
      return NextResponse.json({ error: 'Config item not found' }, { status: 404 })
    }

    const updateData: {
      label?: string
      color?: string | null
      sortOrder?: number
      isActive?: boolean
      metadata?: string | null
    } = {}
    if (label !== undefined) updateData.label = String(label)
    if (color !== undefined) updateData.color = color ? String(color) : null
    if (sortOrder !== undefined) updateData.sortOrder = Number(sortOrder) || 0
    if (isActive !== undefined) updateData.isActive = Boolean(isActive)
    if (metadata !== undefined) updateData.metadata = metadata ? String(metadata) : null

    const item = await db.systemConfig.update({
      where: { id: String(id) },
      data: updateData,
    })

    return NextResponse.json(item)
  } catch (error) {
    console.error('PUT /api/config/item error:', error)
    return NextResponse.json({ error: 'Failed to update config item' }, { status: 500 })
  }
}

/**
 * DELETE /api/config/item?id=<itemId>
 *   Delete an existing item by id.
 */
export async function DELETE(request: NextRequest) {
  const guard = await assertSuperAdmin(request)
  if (guard.error) return guard.error
  const organizationId = guard.user.organizationId

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 })
    }

    const owned = await db.systemConfig.findFirst({ where: { id, organizationId } })
    if (!owned) {
      return NextResponse.json({ error: 'Config item not found' }, { status: 404 })
    }

    await db.systemConfig.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/config/item error:', error)
    return NextResponse.json({ error: 'Failed to delete config item' }, { status: 500 })
  }
}
