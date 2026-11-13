import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { generatePayrollForEmployee } from '@/app/api/payroll/route'
import { resolveEffectivePaymentType } from '@/lib/payroll-accrual'

const ALLOWED_ROLES = ['admin', 'super_admin']

// POST /api/payroll/generate-month
//   Body: { month, year, onlyPaymentType? }
//   Bulk "Generate Payroll" — runs the same per-employee generate logic as
//   POST /api/payroll for every active employee in the org, auto-filling
//   basicSalary/hra/allowances from the Employee record (no manual entry).
//   Additive alongside the existing single-employee flow in PayrollPage —
//   admins can still fine-tune an individual record afterward via PUT.
//
//   onlyPaymentType: 'PER_SESSION' | 'HYBRID' restricts the run to employees
//   whose EFFECTIVE payment type (Employee.paymentType, falling back to
//   CenterSettings.payrollSalaryMode) matches — used by the separate
//   "Generate Session Payroll" / "Generate Hybrid Payroll" actions so they
//   never touch Monthly-salary staff. Default (unset) is unchanged: every
//   active employee, exactly as before.
export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const organizationId = user.organizationId
    const body = await request.json()
    const month = parseInt(body.month)
    const year = parseInt(body.year)
    const onlyPaymentType: 'PER_SESSION' | 'HYBRID' | undefined =
      body.onlyPaymentType === 'PER_SESSION' || body.onlyPaymentType === 'HYBRID' ? body.onlyPaymentType : undefined
    if (!month || !year) {
      return NextResponse.json({ error: 'month and year are required' }, { status: 400 })
    }

    let employees = await db.employee.findMany({
      where: { organizationId, status: 'active' },
      select: { id: true, name: true, basicSalary: true, hra: true, allowances: true, paymentType: true },
    })

    if (onlyPaymentType) {
      const centerSettings = await db.centerSettings.findFirst({
        where: { organizationId },
        select: { payrollSalaryMode: true },
      })
      employees = employees.filter(
        (emp) => resolveEffectivePaymentType(emp.paymentType, centerSettings?.payrollSalaryMode) === onlyPaymentType
      )
    }

    let generated = 0
    const skipped: { employeeId: string; employeeName: string; reason: string }[] = []
    // Employees whose completed-session count for this month exceeds how many
    // actually got an earning row — i.e. some of their sessions have no
    // configured rate, so their session earnings are understated. Surfaced
    // to the admin instead of only a server-side console.warn (see
    // generatePayrollForEmployee's unratedSessionCount comment).
    const unratedEmployees: { employeeId: string; employeeName: string; count: number }[] = []

    for (const emp of employees) {
      const result = await generatePayrollForEmployee(
        organizationId,
        emp.id,
        month,
        year,
        { basicSalary: emp.basicSalary, hra: emp.hra, allowances: emp.allowances },
        0
      )
      if (!result.ok) {
        skipped.push({ employeeId: emp.id, employeeName: emp.name, reason: result.error })
      } else {
        generated += 1
        if (result.record.unratedSessionCount > 0) {
          unratedEmployees.push({ employeeId: emp.id, employeeName: emp.name, count: result.record.unratedSessionCount })
        }
      }
    }

    return NextResponse.json({ generated, skipped, unratedEmployees })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/payroll/generate-month error:', error)
    return NextResponse.json({ error: 'Failed to generate payroll for the month' }, { status: 500 })
  }
}
