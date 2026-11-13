import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { RESCHEDULE_STAFF_ROLES } from '@/lib/reschedule'

// GET /api/reschedule-requests — pending parent reschedule requests for the
// front office, oldest first, with the appointment they refer to.
export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    if (!RESCHEDULE_STAFF_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const requests = await db.rescheduleRequest.findMany({
      where: { organizationId: user.organizationId, status: 'pending' },
      orderBy: { createdAt: 'asc' },
      include: {
        appointment: {
          include: { patient: { select: { id: true, patientId: true, childName: true } } },
        },
      },
    })
    return NextResponse.json({ requests })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/reschedule-requests error:', error)
    return NextResponse.json({ error: 'Failed to load reschedule requests' }, { status: 500 })
  }
}
