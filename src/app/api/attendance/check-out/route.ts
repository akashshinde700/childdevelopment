import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'

const ALLOWED_ROLES = ['receptionist', 'therapist_speech', 'therapist_ot', 'therapist_behavioral', 'therapist_remedial']

// Parse a "HH:MM" string into total minutes
function timeStringToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId

    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden: only receptionists and therapists can self check-out' }, { status: 403 })
    }

    // Resolve employeeId — fall back to a name-based Employee lookup if the
    // session doesn't have it (login name mismatch).
    let employeeId = user.employeeId
    if (!employeeId && user.name) {
      const emp = await db.employee.findFirst({
        where: { name: { equals: user.name }, organizationId },
        select: { id: true },
      }) || await db.employee.findFirst({
        where: { name: { contains: user.name.trim() }, organizationId },
        select: { id: true },
      })
      employeeId = emp?.id
    }

    if (!employeeId) {
      return NextResponse.json({ error: 'Employee information required — no Employee record matches your user name. Ask an admin to create an Employee record with your exact name.' }, { status: 403 })
    }

    // Today's date at midnight IST (UTC+5:30)
    const IST_OFFSET = 5.5 * 60 * 60 * 1000
    const now = new Date()
    const ist = new Date(now.getTime() + IST_OFFSET)
    const today = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET)

    // Find today's record
    const existing = await db.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    })

    if (!existing || !existing.checkIn) {
      return NextResponse.json({ error: 'must check in before checking out' }, { status: 400 })
    }

    if (existing.checkOut) {
      return NextResponse.json({ error: 'already checked out' }, { status: 409 })
    }

    const checkOut = now.toISOString()

    // Calculate working hours from the full ISO timestamps
    const checkInDate = new Date(existing.checkIn)
    const diffMs = now.getTime() - checkInDate.getTime()
    const workingHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100

    const record = await db.attendance.update({
      where: { id: existing.id },
      data: { checkOut, workingHours },
      include: { employee: { select: { id: true, name: true, employeeId: true, designation: true, department: true } } },
    })

    return NextResponse.json(record, { status: 200 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to check out' }, { status: 500 })
  }
}
