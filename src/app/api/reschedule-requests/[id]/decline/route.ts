import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { notifyPatientParent } from '@/lib/notifications'
import { RESCHEDULE_STAFF_ROLES } from '@/lib/reschedule'

const MAX_NOTE_LENGTH = 500

// POST /api/reschedule-requests/[id]/decline — staff turn down a parent's
// reschedule request with a reason the parent will see. (Approving is done
// by actually rescheduling the appointment via PUT /api/appointments.)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser(request)
    if (!RESCHEDULE_STAFF_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => ({})) as { note?: unknown }
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    if (!note) {
      return NextResponse.json({ error: 'Please give the parent a reason' }, { status: 400 })
    }
    if (note.length > MAX_NOTE_LENGTH) {
      return NextResponse.json({ error: `Reason must be under ${MAX_NOTE_LENGTH} characters` }, { status: 400 })
    }

    const existing = await db.rescheduleRequest.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { appointment: { select: { date: true, startTime: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }
    if (existing.status !== 'pending') {
      return NextResponse.json({ error: 'This request has already been handled' }, { status: 409 })
    }

    const updated = await db.rescheduleRequest.update({
      where: { id },
      data: { status: 'declined', responseNote: note, respondedBy: user.name, respondedAt: new Date() },
    })

    const dateLabel = existing.appointment.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    await notifyPatientParent(user.organizationId ?? null, existing.patientId, {
      type: 'appointment',
      title: 'Reschedule Request Declined',
      message: `Your request to reschedule the ${dateLabel} ${existing.appointment.startTime} appointment was declined: ${note}`,
      link: 'parent-appointments',
    })

    return NextResponse.json(updated)
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/reschedule-requests/[id]/decline error:', error)
    return NextResponse.json({ error: 'Failed to decline request' }, { status: 500 })
  }
}
