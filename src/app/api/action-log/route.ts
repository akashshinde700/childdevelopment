import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'

// POST /api/action-log — save a standardized action + notes entry
// Body: { module, recordId, actionType, notes }
// The user info (id, name, role) is extracted from the session — never trusted from the client.
export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const body = await request.json()

    const { module, recordId, actionType, notes } = body

    // Validate required fields
    if (!module || !recordId || !actionType || !notes || !String(notes).trim()) {
      return NextResponse.json(
        { error: 'module, recordId, actionType, and notes are all required.' },
        { status: 400 }
      )
    }

    const entry = await db.actionLog.create({
      data: {
        module: String(module),
        recordId: String(recordId),
        actionType: String(actionType),
        notes: String(notes).trim(),
        performedBy: user.id,
        performedByName: user.name || 'Unknown',
        userRole: user.role,
        organizationId,
      },
    })

    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('ActionLog create error:', error)
    return NextResponse.json({ error: 'Failed to save action log' }, { status: 500 })
  }
}

// GET /api/action-log?module=appointments&recordId=xxx&actionType=rescheduled&dateFrom=yyyy-MM-dd&dateTo=yyyy-MM-dd
// Fetch action history for a record (or by module/actionType/date range).
export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'receptionist') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { searchParams } = new URL(request.url)
    const mod = searchParams.get('module')
    const recordId = searchParams.get('recordId')
    const actionType = searchParams.get('actionType')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = { organizationId }
    if (mod) where.module = mod
    if (recordId) where.recordId = recordId
    if (actionType) where.actionType = actionType
    if (dateFrom || dateTo) {
      const range: Record<string, Date> = {}
      if (dateFrom) {
        // Inclusive from the start of the day (00:00:00Z)
        const from = new Date(`${dateFrom}T00:00:00.000Z`)
        if (!isNaN(from.getTime())) range.gte = from
      }
      if (dateTo) {
        // Inclusive to the end of the day (23:59:59Z)
        const to = new Date(`${dateTo}T23:59:59.999Z`)
        if (!isNaN(to.getTime())) range.lte = to
      }
      if (Object.keys(range).length > 0) where.timestamp = range
    }

    const logs = await db.actionLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    })

    return NextResponse.json({ logs })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('ActionLog fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch action logs' }, { status: 500 })
  }
}
