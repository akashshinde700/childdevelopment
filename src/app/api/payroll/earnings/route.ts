import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'

const ADMIN_ROLES = ['admin', 'super_admin']
const THERAPIST_ROLES = ['therapist_speech', 'therapist_ot', 'therapist_behavioral', 'therapist_remedial', 'psychologist']

// GET /api/payroll/earnings?month=&year=&employeeId=
//   Admin/super_admin with no employeeId -> list of every therapist who has
//   TherapistEarning rows that month (Therapist Earnings page).
//   Admin/super_admin with employeeId, or any therapist role (always
//   self-scoped, ignoring employeeId) -> single-therapist detail with a
//   per-serviceType breakdown (drives the therapist dashboard card and the
//   salary-slip view).
export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const isAdmin = ADMIN_ROLES.includes(user.role)
    const isTherapist = THERAPIST_ROLES.includes(user.role)
    if (!isAdmin && !isTherapist) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const month = parseInt(searchParams.get('month') || String(now.getMonth() + 1))
    const year = parseInt(searchParams.get('year') || String(now.getFullYear()))

    let employeeId = searchParams.get('employeeId') || ''

    // Therapists can only ever see their own earnings — resolve "self"
    // exactly like the attendance self check-in route does.
    if (!isAdmin || employeeId === 'self') {
      let selfEmployeeId = user.employeeId
      if (!selfEmployeeId && user.name) {
        const emp = await db.employee.findFirst({
          where: { name: { equals: user.name }, organizationId },
          select: { id: true },
        }) || await db.employee.findFirst({
          where: { name: { contains: user.name.trim() }, organizationId },
          select: { id: true },
        })
        selfEmployeeId = emp?.id
      }
      if (!selfEmployeeId) {
        return NextResponse.json({ error: 'No Employee record matches your user name.' }, { status: 404 })
      }
      employeeId = selfEmployeeId
    }

    if (!employeeId) {
      // Admin list view — every therapist with earnings this month.
      const earnings = await db.therapistEarning.findMany({
        where: { organizationId, month, year },
        include: { employee: { select: { id: true, name: true, employeeId: true } } },
      })
      const byEmployee = new Map<string, { employeeId: string; employeeName: string; sessions: number; amount: number; locked: number; pending: number }>()
      for (const e of earnings) {
        const key = e.employeeId
        const row = byEmployee.get(key) || {
          employeeId: e.employeeId,
          employeeName: e.employee.name,
          sessions: 0, amount: 0, locked: 0, pending: 0,
        }
        row.sessions += 1
        row.amount += e.amount
        if (e.payrollRecordId) row.locked += 1
        else row.pending += 1
        byEmployee.set(key, row)
      }
      return NextResponse.json({ employees: Array.from(byEmployee.values()) })
    }

    // Single-therapist detail with a per-serviceType breakdown. Grouped by
    // [serviceType, rateType] (not just serviceType) so a mid-month rate-mode
    // change (Fixed -> Percentage) shows as two distinct, honest line items
    // rather than averaging them into a meaningless blended rate.
    const earnings = await db.therapistEarning.findMany({
      where: { organizationId, month, year, employeeId },
    })
    const breakdownMap = new Map<string, {
      serviceType: string; rateType: string; sessions: number; amount: number; totalRate: number
    }>()
    let amount = 0
    let locked = 0
    let pending = 0
    for (const e of earnings) {
      amount += e.amount
      if (e.payrollRecordId) locked += 1
      else pending += 1
      const key = `${e.serviceType}::${e.rateType}`
      const row = breakdownMap.get(key) || { serviceType: e.serviceType, rateType: e.rateType, sessions: 0, amount: 0, totalRate: 0 }
      row.sessions += 1
      row.amount += e.amount
      row.totalRate += e.rate
      breakdownMap.set(key, row)
    }
    const breakdown = Array.from(breakdownMap.values()).map((row) => ({
      serviceType: row.serviceType,
      rateType: row.rateType,
      sessions: row.sessions,
      amount: row.amount,
      // Average rate/percentage across this group's sessions — display only.
      avgRate: row.totalRate / row.sessions,
    }))

    return NextResponse.json({
      employeeId,
      sessions: earnings.length,
      amount,
      locked,
      pending,
      breakdown,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/payroll/earnings error:', error)
    return NextResponse.json({ error: 'Failed to fetch earnings' }, { status: 500 })
  }
}
