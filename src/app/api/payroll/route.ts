import { NextRequest, NextResponse } from 'next/server'
import { format } from 'date-fns'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { notifyEmployeeByName } from '@/lib/notifications'
import { resolveEffectivePaymentType, getOrgSalaryMode } from '@/lib/payroll-accrual'

const ALLOWED_ROLES = ['admin', 'super_admin']

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const organizationId = user.organizationId

    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId') || ''
    const fromDate = searchParams.get('fromDate') || ''
    const toDate = searchParams.get('toDate') || ''
    const status = searchParams.get('status') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100000, Math.max(1, parseInt(searchParams.get('limit') || '100')))

    const where: Record<string, unknown> = { organizationId }
    if (fromDate || toDate) {
      // PayrollRecord has no single date field (only month/year ints), so a
      // fromDate/toDate range is translated into an OR of every {month, year}
      // pair the range spans, rather than filtering on month/year exactly.
      const start = fromDate ? new Date(`${fromDate}T00:00:00.000Z`) : new Date(2000, 0, 1)
      const end = toDate ? new Date(`${toDate}T00:00:00.000Z`) : new Date()
      const periods: { month: number; year: number }[] = []
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
      const endCursor = new Date(end.getFullYear(), end.getMonth(), 1)
      while (cursor <= endCursor && periods.length < 600) {
        periods.push({ month: cursor.getMonth() + 1, year: cursor.getFullYear() })
        cursor.setMonth(cursor.getMonth() + 1)
      }
      where.OR = periods.map((p) => ({ month: p.month, year: p.year }))
    } else {
      const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : new Date().getMonth() + 1
      const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : new Date().getFullYear()
      where.month = month
      where.year = year
    }
    if (employeeId) where.employeeId = employeeId
    if (status) where.status = status

    // Department filter - filter by employee department
    const department = searchParams.get('department') || ''
    if (department) {
      where.employee = { department }
    }

    const [records, total] = await Promise.all([
      db.payrollRecord.findMany({
        where,
        include: { employee: { select: { id: true, name: true, employeeId: true, designation: true, department: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.payrollRecord.count({ where }),
    ])

    const summary = await db.payrollRecord.aggregate({
      where,
      _sum: { totalEarnings: true, totalDeductions: true, netSalary: true },
    })

    return NextResponse.json({
      records,
      total,
      summary: {
        totalEarnings: summary._sum.totalEarnings || 0,
        totalDeductions: summary._sum.totalDeductions || 0,
        totalNetSalary: summary._sum.netSalary || 0,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch payroll' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const organizationId = user.organizationId

    const body = await request.json()
    const { employeeId, month, year, ...salaryData } = body

    const employeeOwned = await db.employee.findFirst({ where: { id: employeeId, organizationId } })
    if (!employeeOwned) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    // Validate TDS: numeric, non-negative (decimals allowed).
    const tds = Number(salaryData.tds) || 0
    if (tds < 0) {
      return NextResponse.json({ error: 'TDS cannot be negative.' }, { status: 400 })
    }

    const result = await generatePayrollForEmployee(organizationId, employeeId, month, year, salaryData, tds)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result.record, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Payroll generate error:', error)
    return NextResponse.json({ error: 'Failed to process payroll' }, { status: 500 })
  }
}

// ── Payroll Engine ──────────────────────────────────────────────────────────
// Shared "generate one employee's payroll for one month" core, used by both
// the single-employee POST above and the bulk generate-month route. Folds
// TherapistEarning rows (Payroll Engine accrual ledger — see
// src/lib/payroll-accrual.ts) into the existing manual basicSalary/hra/
// allowances/incentives/bonus totals as `sessionEarnings`, and locks every
// earning row it includes by stamping `payrollRecordId`. Always 0 for
// employees who never accrue anything (pure MONTHLY payment type) — zero
// behavior change for clinics that only use manual monthly payroll.
export async function generatePayrollForEmployee(
  organizationId: string | null | undefined,
  employeeId: string,
  month: number,
  year: number,
  salaryData: Record<string, unknown>,
  tds: number
) {
  return db.$transaction(async (tx) => {
    // Only 'paid' locks a record — Unpaid stays freely regeneratable so
    // Generate can be clicked as many times as needed through the month as
    // more sessions complete (see generate-month's unratedSessionCount).
    const existingRecord = await tx.payrollRecord.findFirst({ where: { employeeId, month, year, organizationId } })
    if (existingRecord && existingRecord.status === 'paid') {
      return { ok: false as const, error: 'This payroll has already been marked paid — mark it unpaid (or unlock it) first to make changes.', status: 409 }
    }

    // Unlocked earnings for this employee/month, PLUS any earnings already
    // locked to THIS record (so re-generating a still-draft record recomputes
    // cleanly instead of double-counting on repeated calls).
    const earnings = await tx.therapistEarning.findMany({
      where: {
        employeeId, month, year, organizationId,
        OR: [{ payrollRecordId: null }, ...(existingRecord ? [{ payrollRecordId: existingRecord.id }] : [])],
      },
    })
    const sessionEarnings = earnings.reduce((sum, e) => sum + e.amount, 0)

    // Diagnostic only (not persisted) — a completed session with NO rate
    // configured for its service type accrues nothing (see accrueEarning's
    // console.warn in payroll-accrual.ts), which used to be silent: an admin
    // staring at ₹0 session earnings after clicking Generate had no way to
    // tell "no sessions happened" apart from "sessions happened but nobody
    // configured a rate for them." Count completed sessions this employee
    // should have earned FROM in this period and compare against how many
    // actually got an earning row — the gap is exactly the unrated ones.
    let unratedSessionCount = 0
    const employeeRow = await tx.employee.findUnique({ where: { id: employeeId }, select: { userId: true, paymentType: true } })
    if (employeeRow?.userId) {
      const orgMode = await getOrgSalaryMode(tx, organizationId ?? null)
      const effectiveType = resolveEffectivePaymentType(employeeRow.paymentType, orgMode)
      if (effectiveType !== 'MONTHLY') {
        const user = await tx.user.findUnique({ where: { id: employeeRow.userId }, select: { name: true } })
        if (user?.name) {
          const periodStart = new Date(year, month - 1, 1)
          const periodEnd = new Date(year, month, 1)
          const [completedAppointments, completedAssessments] = await Promise.all([
            tx.appointment.count({
              where: { organizationId, therapistId: user.name, status: 'completed', date: { gte: periodStart, lt: periodEnd } },
            }),
            tx.assessment.count({
              where: { organizationId, therapistName: user.name, status: 'completed', completedDate: { gte: periodStart, lt: periodEnd } },
            }),
          ])
          unratedSessionCount = Math.max(0, completedAppointments + completedAssessments - earnings.length)
        }
      }
    }

    const totalEarnings = (Number(salaryData.basicSalary) || 0) + (Number(salaryData.hra) || 0) + (Number(salaryData.allowances) || 0) + (Number(salaryData.incentives) || 0) + (Number(salaryData.bonus) || 0) + sessionEarnings
    const totalDeductions = (Number(salaryData.leaveDeduction) || 0) + (Number(salaryData.pf) || 0) + (Number(salaryData.esi) || 0) + (Number(salaryData.professionalTax) || 0) + (Number(salaryData.advanceRecovery) || 0) + tds
    const netSalary = totalEarnings - totalDeductions

    const record = await tx.payrollRecord.upsert({
      where: { employeeId_month_year: { employeeId, month, year } },
      create: {
        employeeId, month, year,
        basicSalary: Number(salaryData.basicSalary) || 0,
        hra: Number(salaryData.hra) || 0,
        allowances: Number(salaryData.allowances) || 0,
        incentives: Number(salaryData.incentives) || 0,
        bonus: Number(salaryData.bonus) || 0,
        sessionEarnings,
        totalEarnings,
        leaveDeduction: Number(salaryData.leaveDeduction) || 0,
        pf: Number(salaryData.pf) || 0,
        esi: Number(salaryData.esi) || 0,
        professionalTax: Number(salaryData.professionalTax) || 0,
        advanceRecovery: Number(salaryData.advanceRecovery) || 0,
        tds,
        totalDeductions,
        netSalary,
        status: (salaryData.status as string) || 'unpaid',
        organizationId,
      },
      update: {
        basicSalary: Number(salaryData.basicSalary) || 0,
        hra: Number(salaryData.hra) || 0,
        allowances: Number(salaryData.allowances) || 0,
        incentives: Number(salaryData.incentives) || 0,
        bonus: Number(salaryData.bonus) || 0,
        sessionEarnings,
        totalEarnings,
        leaveDeduction: Number(salaryData.leaveDeduction) || 0,
        pf: Number(salaryData.pf) || 0,
        esi: Number(salaryData.esi) || 0,
        professionalTax: Number(salaryData.professionalTax) || 0,
        advanceRecovery: Number(salaryData.advanceRecovery) || 0,
        tds,
        totalDeductions,
        netSalary,
        // Don't reset status on update - only allow progression via PUT
      },
    })

    if (earnings.length > 0) {
      await tx.therapistEarning.updateMany({
        where: { id: { in: earnings.map((e) => e.id) }, organizationId },
        data: { payrollRecordId: record.id },
      })
    }

    return { ok: true as const, record: { ...record, unratedSessionCount } }
  })
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const organizationId = user.organizationId

    const body = await request.json()
    const { id, ...data } = body
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    // Fetch existing record — doubles as the ownership check and (when salary
    // fields are present) the merge source for recalculating totals.
    const existing = await db.payrollRecord.findFirst({ where: { id, organizationId } })
    if (!existing) return NextResponse.json({ error: 'Record not found' }, { status: 404 })

    // When marking as paid, set paidDate automatically; reverting to unpaid
    // clears it — it would otherwise keep showing a stale "paid on" date.
    if (data.status === 'paid' && !data.paidDate) {
      data.paidDate = new Date()
    } else if (data.status === 'unpaid') {
      data.paidDate = null
    }

    // If salary components are being updated, recalculate totals
    const hasSalaryFields = ['basicSalary', 'hra', 'allowances', 'incentives', 'bonus',
      'leaveDeduction', 'pf', 'esi', 'professionalTax', 'advanceRecovery', 'tds'].some(f => f in data)

    if (hasSalaryFields) {
      const basicSalary = data.basicSalary ?? existing.basicSalary
      const hra = data.hra ?? existing.hra
      const allowances = data.allowances ?? existing.allowances
      const incentives = data.incentives ?? existing.incentives
      const bonus = data.bonus ?? existing.bonus
      const leaveDeduction = data.leaveDeduction ?? existing.leaveDeduction
      const pf = data.pf ?? existing.pf
      const esi = data.esi ?? existing.esi
      const professionalTax = data.professionalTax ?? existing.professionalTax
      const advanceRecovery = data.advanceRecovery ?? existing.advanceRecovery
      const tds = data.tds ?? existing.tds

      if (Number(tds) < 0) {
        return NextResponse.json({ error: 'TDS cannot be negative.' }, { status: 400 })
      }

      data.basicSalary = basicSalary
      data.hra = hra
      data.allowances = allowances
      data.incentives = incentives
      data.bonus = bonus
      data.leaveDeduction = leaveDeduction
      data.pf = pf
      data.esi = esi
      data.professionalTax = professionalTax
      data.advanceRecovery = advanceRecovery
      data.tds = tds
      // sessionEarnings is system-computed by the Payroll Engine (Generate
      // Payroll) — never user-editable here, just carried forward.
      data.totalEarnings = basicSalary + hra + allowances + incentives + bonus + existing.sessionEarnings
      data.totalDeductions = leaveDeduction + pf + esi + professionalTax + advanceRecovery + tds
      data.netSalary = data.totalEarnings - data.totalDeductions
    }

    const record = await db.payrollRecord.update({ where: { id }, data, include: { employee: { select: { name: true } } } })

    if (data.status === 'paid') {
      const monthLabel = format(new Date(record.year, record.month - 1, 1), 'MMMM yyyy')
      await notifyEmployeeByName(organizationId ?? null, record.employee?.name, {
        type: 'hr',
        title: 'Payroll Processed',
        message: `Your salary for ${monthLabel} (₹${record.netSalary.toLocaleString('en-IN')}) has been processed.`,
        link: 'payroll',
      })
    }

    return NextResponse.json(record)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to update payroll' }, { status: 500 })
  }
}

// DELETE /api/payroll?id=<id>
//   Unpaid only — a 'paid' record is a settled financial record, not casually
//   discardable (same rule /api/payroll/unlock already enforces). Frees any
//   TherapistEarning rows this record had locked FIRST (payrollRecordId has
//   no real FK — deleting the record without this would leave those rows
//   permanently orphaned, silently excluded from every future generate since
//   generatePayrollForEmployee only picks up payrollRecordId: null rows).
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const organizationId = user.organizationId
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const record = await db.payrollRecord.findFirst({ where: { id, organizationId } })
    if (!record) return NextResponse.json({ error: 'Payroll record not found' }, { status: 404 })
    if (record.status === 'paid') {
      return NextResponse.json({ error: 'Paid payroll cannot be deleted. Mark it as Unpaid before deleting.' }, { status: 409 })
    }

    await db.$transaction(async (tx) => {
      await tx.therapistEarning.updateMany({
        where: { payrollRecordId: id, organizationId },
        data: { payrollRecordId: null },
      })
      await tx.payrollRecord.delete({ where: { id } })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('DELETE /api/payroll error:', error)
    return NextResponse.json({ error: 'Failed to delete payroll' }, { status: 500 })
  }
}
