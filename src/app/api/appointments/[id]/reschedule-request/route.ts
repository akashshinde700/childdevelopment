import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { notifyRoles } from '@/lib/notifications'

const MAX_REASON_LENGTH = 500
const UPCOMING_STATUSES = ['scheduled', 'confirmed']

// POST /api/appointments/[id]/reschedule-request — the parent asks for their
// OWN child's upcoming appointment to be moved (reason + optional preferred
// date/time). This only records the request and alerts the front office; the
// actual slot change is done by staff via PUT /api/appointments.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser(request)
    if (user.role !== 'parent' || !user.patientId) {
      return NextResponse.json({ error: 'Only the child\'s parent can request a reschedule' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => ({})) as { reason?: unknown; preferredDate?: unknown; preferredTime?: unknown }

    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (!reason) {
      return NextResponse.json({ error: 'Please tell us why you need to reschedule' }, { status: 400 })
    }
    if (reason.length > MAX_REASON_LENGTH) {
      return NextResponse.json({ error: `Reason must be under ${MAX_REASON_LENGTH} characters` }, { status: 400 })
    }

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    let preferredDate: Date | null = null
    if (typeof body.preferredDate === 'string' && body.preferredDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.preferredDate)) {
        return NextResponse.json({ error: 'Invalid preferred date' }, { status: 400 })
      }
      preferredDate = new Date(`${body.preferredDate}T00:00:00`)
      if (Number.isNaN(preferredDate.getTime()) || preferredDate < todayStart) {
        return NextResponse.json({ error: 'Preferred date must be today or later' }, { status: 400 })
      }
    }
    let preferredTime: string | null = null
    if (typeof body.preferredTime === 'string' && body.preferredTime) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.preferredTime)) {
        return NextResponse.json({ error: 'Invalid preferred time' }, { status: 400 })
      }
      preferredTime = body.preferredTime
    }

    // Scoped to the parent's own child and organization — 404 for anything
    // else so appointment ids can't be probed.
    const appointment = await db.appointment.findFirst({
      where: { id, patientId: user.patientId, organizationId: user.organizationId },
      include: { patient: { select: { childName: true } } },
    })
    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }
    if (!UPCOMING_STATUSES.includes(appointment.status) || appointment.date < todayStart) {
      return NextResponse.json({ error: 'Only an upcoming appointment can be rescheduled' }, { status: 400 })
    }

    const pending = await db.rescheduleRequest.findFirst({
      where: { appointmentId: id, status: 'pending' },
      select: { id: true },
    })
    if (pending) {
      return NextResponse.json({ error: 'A reschedule request for this appointment is already pending' }, { status: 409 })
    }

    const created = await db.rescheduleRequest.create({
      data: {
        organizationId: user.organizationId ?? null,
        appointmentId: id,
        patientId: appointment.patientId,
        requestedBy: user.id,
        reason,
        preferredDate,
        preferredTime,
      },
    })

    const dateLabel = appointment.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    await notifyRoles(user.organizationId ?? null, ['super_admin', 'admin', 'receptionist'], {
      type: 'appointment',
      title: 'Reschedule Request',
      message: `${appointment.patient.childName}'s parent asked to reschedule the ${dateLabel} ${appointment.startTime} appointment.`,
      link: 'appointments',
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/appointments/[id]/reschedule-request error:', error)
    return NextResponse.json({ error: 'Failed to submit reschedule request' }, { status: 500 })
  }
}
