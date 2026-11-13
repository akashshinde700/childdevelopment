import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'

// POST /api/payroll/unlock
//   Body: { payrollRecordId }
//   Super-admin only. Nulls payrollRecordId on every TherapistEarning row
//   locked to this record (so their source Appointment/Assessment can be
//   edited/un-completed again) and deletes the PayrollRecord so it can be
//   cleanly regenerated. Blocked once status is 'paid' — a paid payroll is
//   not casually reversible, protecting financial record integrity.
export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    if (user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden — only Super Admin can unlock a payroll' }, { status: 403 })
    }
    const organizationId = user.organizationId
    const body = await request.json()
    const { payrollRecordId } = body
    if (!payrollRecordId) {
      return NextResponse.json({ error: 'payrollRecordId is required' }, { status: 400 })
    }

    const record = await db.payrollRecord.findFirst({ where: { id: payrollRecordId, organizationId } })
    if (!record) {
      return NextResponse.json({ error: 'Payroll record not found' }, { status: 404 })
    }
    if (record.status === 'paid') {
      return NextResponse.json({ error: 'A paid payroll cannot be unlocked.' }, { status: 409 })
    }

    await db.$transaction(async (tx) => {
      await tx.therapistEarning.updateMany({
        where: { payrollRecordId, organizationId },
        data: { payrollRecordId: null },
      })
      await tx.payrollRecord.delete({ where: { id: payrollRecordId } })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/payroll/unlock error:', error)
    return NextResponse.json({ error: 'Failed to unlock payroll' }, { status: 500 })
  }
}
