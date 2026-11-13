import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'

const ALLOWED_ROLES = ['receptionist', 'therapist_speech', 'therapist_ot', 'therapist_behavioral', 'therapist_remedial']

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId

    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden: only receptionists and therapists can self check-in' }, { status: 403 })
    }

    // Resolve employeeId — the session may not have it if the login name lookup
    // failed. Fall back to a name-based Employee lookup so self check-in works.
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

    // Today's date at midnight IST (UTC+5:30) so the attendance day matches
    // the clinic's wall clock.
    const IST_OFFSET = 5.5 * 60 * 60 * 1000
    const now = new Date()
    const ist = new Date(now.getTime() + IST_OFFSET)
    const today = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET)

    // Store the full ISO timestamp so the frontend can display it in the
    // user's local timezone with AM/PM formatting.
    const checkIn = now.toISOString()

    // Find existing record for today
    const existing = await db.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    })

    if (existing && existing.checkIn) {
      return NextResponse.json({ error: `already checked in today at ${existing.checkIn}` }, { status: 409 })
    }

    const record = await db.attendance.upsert({
      where: { employeeId_date: { employeeId, date: today } },
      create: {
        employeeId,
        date: today,
        status: 'present',
        checkIn,
        organizationId,
      },
      update: {
        checkIn,
        status: 'present',
      },
      include: { employee: { select: { id: true, name: true, employeeId: true, designation: true, department: true } } },
    })

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to check in' }, { status: 500 })
  }
}
