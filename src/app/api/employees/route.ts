import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { checkTherapistEmployeeLimit, checkTherapistUserLimit, checkStaffUserLimit, isTherapistEmployee, isTherapistRole, requireFeature } from '@/lib/subscription-limits'
import { getAssignableRoles, ROLE_THERAPY_TYPE } from '@/lib/role-permissions'
import { backfillEmployeesFromUsers } from '@/lib/employee-sync'
import { hashPassword } from '@/lib/password'
import { passwordWriteFields } from '@/lib/user-password'

// Shared by POST (create employee + optional login in one transaction) and
// PUT (attach a login to an existing employee). Validates the requested
// login and returns either an error response or the ready-to-insert user
// data. Creating the User INSIDE the same transaction as the Employee fixes
// the old two-request flow where the employee was created but the login
// failed with "Forbidden", leaving a half-configured employee.
async function validateLoginRequest(
  currentUser: { role: string },
  organizationId: string | null,
  employee: { name: string; email?: string | null; mobile?: string | null },
  login: { role?: string; password?: string; therapyType?: string }
): Promise<{ error: NextResponse } | { userData: { email: string; password: string; name: string; phone: string | null; role: string; therapyType: string | null; organizationId: string | null } }> {
  if (!login.role || !login.password) {
    return { error: NextResponse.json({ error: 'Login role and password are required' }, { status: 400 }) }
  }
  if (String(login.password).length < 6) {
    return { error: NextResponse.json({ error: 'Login password must be at least 6 characters' }, { status: 400 }) }
  }
  if (!employee.email || !String(employee.email).trim()) {
    return { error: NextResponse.json({ error: 'Employee email is required to create a login account' }, { status: 400 }) }
  }

  // Same assignable-role tiering as /api/users — admin can never mint
  // another admin/super_admin through the employee form either.
  const assignable = getAssignableRoles(currentUser.role)
  if (!assignable.includes(login.role)) {
    const customRole = await db.role.findFirst({ where: { slug: login.role, organizationId } })
    if (!customRole) {
      return { error: NextResponse.json({ error: `You are not allowed to assign the "${login.role}" role` }, { status: 403 }) }
    }
  }

  const existingUser = await db.user.findUnique({ where: { email: employee.email } })
  if (existingUser) {
    if (existingUser.isActive) {
      return { error: NextResponse.json({ error: 'A login with this email already exists' }, { status: 409 }) }
    }
    // Deactivated login (e.g. from a terminated employee — see DELETE
    // /api/employees) still holds this email under the User.email unique
    // constraint. It's defunct, so free the email for reuse instead of
    // blocking re-hire/re-add with the same address.
    await db.user.update({
      where: { id: existingUser.id },
      data: { email: `${existingUser.email}.deleted.${Date.now()}` },
    })
  }

  // Plan seat check for the login being created (therapist vs staff seat).
  const seatCheck = isTherapistRole(login.role)
    ? await checkTherapistUserLimit(organizationId)
    : await checkStaffUserLimit(organizationId)
  if (!seatCheck.ok) return { error: seatCheck.response }

  return {
    userData: {
      email: String(employee.email).trim(),
      ...(await passwordWriteFields(String(login.password))),
      name: employee.name,
      phone: employee.mobile || null,
      role: login.role,
      // Therapist logins default their specialization from the role so
      // session forms pre-fill the right therapy type.
      therapyType: login.therapyType || ROLE_THERAPY_TYPE[login.role] || null,
      organizationId,
    },
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const organizationId = user.organizationId

    // Self-healing: staff users created before the User↔Employee sync (or
    // via any path that skipped it) get their employee record here, so the
    // Employees list always shows everyone who's actually on staff.
    await backfillEmployeesFromUsers(organizationId ?? null)

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const department = searchParams.get('department') || ''
    const status = searchParams.get('status') || ''
    const fromDate = searchParams.get('fromDate') || ''
    const toDate = searchParams.get('toDate') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = { organizationId }
    if (search) where.OR = [
      { name: { contains: search } },
      { employeeId: { contains: search } },
      { mobile: { contains: search } },
    ]
    // SQLite doesn't support mode: 'insensitive' — emulate case-insensitive
    // matching for department / status by accepting the value plus its
    // lower / upper / Capitalized variants.
    if (department) {
      const lower = department.toLowerCase()
      const upper = department.toUpperCase()
      const capitalized = lower.charAt(0).toUpperCase() + lower.slice(1)
      where.department = { in: [department, lower, upper, capitalized] }
    }
    if (status) {
      const lower = status.toLowerCase()
      const upper = status.toUpperCase()
      const capitalized = lower.charAt(0).toUpperCase() + lower.slice(1)
      where.status = { in: [status, lower, upper, capitalized] }
    } else {
      // "Delete" (see DELETE handler above) sets status='terminated' rather
      // than removing the row, specifically to keep payroll/attendance/leave
      // history intact — but that only works if a deleted employee actually
      // disappears from the default list instead of just changing badge
      // color. Excluded here unless the caller explicitly asks for
      // terminated employees (?status=terminated) or applies no filter that
      // would conflict — an explicit filter above always wins over this.
      where.status = { notIn: ['terminated', 'Terminated', 'TERMINATED'] }
    }
    if (fromDate || toDate) {
      const dateFilter: Record<string, Date> = {}
      if (fromDate) dateFilter.gte = new Date(`${fromDate}T00:00:00.000Z`)
      if (toDate) dateFilter.lte = new Date(`${toDate}T23:59:59.999Z`)
      where.joinDate = dateFilter
    }

    const [employees, total] = await Promise.all([
      db.employee.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.employee.count({ where }),
    ])

    return NextResponse.json({ employees, total, page, limit })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const organizationId = user.organizationId

    const body = await request.json()

    // Plan seat enforcement (SaaS): employee records in a therapy
    // designation/department count against the plan's therapistLimit —
    // therapists are schedulable by name without a login, so counting only
    // User accounts would undercount.
    if (isTherapistEmployee(body.designation, body.department)) {
      const seatCheck = await checkTherapistEmployeeLimit(organizationId ?? null)
      if (!seatCheck.ok) return seatCheck.response
    }

    // Payroll Engine: PER_SESSION/HYBRID is plan-gated the same way as the
    // org-wide default in Settings (src/app/api/settings/route.ts) — setting
    // it per-employee must not be a way to bypass that paywall.
    if (body.paymentType === 'PER_SESSION' || body.paymentType === 'HYBRID') {
      const feature = body.paymentType === 'PER_SESSION' ? 'payrollPerSession' : 'payrollHybrid'
      const gate = await requireFeature(organizationId ?? null, feature)
      if (gate) return gate
    }

    // Optional login account — validated up-front, created atomically with
    // the employee below so a failure never leaves a login-less employee
    // that the UI claims has one (or vice versa).
    let userData: { email: string; password: string; name: string; phone: string | null; role: string; therapyType: string | null; organizationId: string | null } | null = null
    if (body.login) {
      const validated = await validateLoginRequest(user, organizationId ?? null,body, body.login)
      if ('error' in validated) return validated.error
      userData = validated.userData
    }

    const lastEmp = await db.employee.findFirst({ where: { organizationId }, orderBy: { createdAt: 'desc' }, select: { employeeId: true } })
    let nextNum = 1
    if (lastEmp?.employeeId) {
      const num = parseInt(lastEmp.employeeId.replace('EMP-', ''))
      if (!isNaN(num)) nextNum = num + 1
    }

    const result = await db.$transaction(async (tx) => {
      const loginUser = userData ? await tx.user.create({ data: userData }) : null
      const employee = await tx.employee.create({
        // `as never`: the generated Prisma client may predate the new
        // Employee.userId column until `prisma generate` is re-run; the
        // shape is correct against the current schema.
        data: {
          employeeId: `EMP-${String(nextNum).padStart(4, '0')}`,
          name: body.name,
          designation: body.designation,
          department: body.department ? String(body.department).toLowerCase() : body.department,
          mobile: body.mobile,
          email: body.email,
          joinDate: body.joinDate ? new Date(body.joinDate) : null,
          basicSalary: body.basicSalary || 0,
          hra: body.hra || 0,
          allowances: body.allowances || 0,
          paymentType: body.paymentType || null,
          photo: body.photo,
          aadhaar: body.aadhaar,
          pan: body.pan,
          resumeUrl: body.resumeUrl,
          address: body.address,
          bankName: body.bankName,
          bankAccount: body.bankAccount,
          bankIfsc: body.bankIfsc,
          organizationId,
          ...(loginUser ? { userId: loginUser.id } : {}),
        } as never,
      })
      return { employee, loginCreated: !!loginUser }
    })

    return NextResponse.json({ ...result.employee, loginCreated: result.loginCreated }, { status: 201 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/employees error:', error)
    // Surface the real Prisma error message — a generic "failed" hides
    // actionable causes (unknown column = db:push not run, etc.).
    const msg = error instanceof Error ? error.message.split('\n').slice(-3).join(' ').trim() : ''
    return NextResponse.json({ error: msg ? `Failed to create employee: ${msg.slice(0, 300)}` : 'Failed to create employee' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const organizationId = user.organizationId

    const body = await request.json()
    const { id, login, ...data } = body
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const owned = await db.employee.findFirst({ where: { id, organizationId } })
    if (!owned) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    // Payroll Engine: same plan gate as POST above — but only when
    // paymentType is actually CHANGING to a gated value. The Employee form
    // resends the full form (including an unchanged paymentType) on every
    // save, so gating on the sent value alone would permanently block any
    // edit to an employee whose paymentType was already set before the
    // org's plan lost the feature (or before this gate existed).
    if (
      (data.paymentType === 'PER_SESSION' || data.paymentType === 'HYBRID') &&
      data.paymentType !== owned.paymentType
    ) {
      const feature = data.paymentType === 'PER_SESSION' ? 'payrollPerSession' : 'payrollHybrid'
      const gate = await requireFeature(organizationId ?? null, feature)
      if (gate) return gate
    }

    // Attach a login account to an existing employee (edit dialog). Only if
    // they don't already have one linked.
    if (login) {
      const ownedWithUser = owned as typeof owned & { userId?: string | null }
      if (ownedWithUser.userId) {
        return NextResponse.json({ error: 'This employee already has a login account' }, { status: 409 })
      }
      const employeeForLogin = { name: (data.name as string) || owned.name, email: (data.email as string) || owned.email, mobile: (data.mobile as string) || owned.mobile }
      const validated = await validateLoginRequest(user, organizationId ?? null,employeeForLogin, login)
      if ('error' in validated) return validated.error
      const loginUser = await db.user.create({ data: validated.userData })
      ;(data as Record<string, unknown>).userId = loginUser.id
    }

    // Handle joinDate: empty string means clear the date (set to null)
    if ('joinDate' in data) {
      data.joinDate = data.joinDate ? new Date(data.joinDate) : null
    }
    // Normalize on write so status/department never drift into mixed casing
    // again (the GET handler's case-variant matching stays as a defensive
    // fallback for any pre-existing or externally-imported rows).
    if ('status' in data && data.status) data.status = String(data.status).toLowerCase()
    if ('department' in data && data.department) data.department = String(data.department).toLowerCase()

    // Keep the linked login in sync with the HR status: any non-"active"
    // status (inactive/resigned/terminated/notice_period) must also lock the
    // person out of the app, and moving back to "active" must restore their
    // access — otherwise "mark inactive" is cosmetic (they can still log in
    // and still show up in every therapist picker, which reads from User,
    // not Employee). Only acts when status actually changes, and only when a
    // login is linked (userId), same guard used at delete.
    const ownedWithUser = owned as typeof owned & { userId?: string | null }
    const newStatus = 'status' in data ? String(data.status) : undefined
    if (ownedWithUser.userId && newStatus && newStatus !== owned.status) {
      await db.user.update({ where: { id: ownedWithUser.userId }, data: { isActive: newStatus === 'active' } })
    }

    const employee = await db.employee.update({
      where: { id },
      // `as never`: generated client may predate Employee.userId (see POST).
      data: data as never,
    })
    return NextResponse.json({ ...employee, loginCreated: !!login })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to update employee' }, { status: 500 })
  }
}

// Hard delete, per explicit request — permanently removes the Employee row
// AND its linked login (User), not just a status flag. Employee has
// onDelete: Cascade from Leave/Attendance/EmployeeDocument/TherapistRate/
// TherapistEarning/PayrollRecord, so this also permanently wipes that
// person's entire payroll/attendance/leave HISTORY — there is no undo.
// The linked User is hard-deleted too (not just deactivated) so the email
// is immediately free for reuse and the login is fully gone, not lingering.
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const organizationId = user.organizationId

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
    const owned = await db.employee.findFirst({ where: { id, organizationId } })
    if (!owned) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    const ownedWithUser = owned as typeof owned & { userId?: string | null }
    await db.$transaction(async (tx) => {
      await tx.employee.delete({ where: { id } })
      if (ownedWithUser.userId) {
        await tx.user.delete({ where: { id: ownedWithUser.userId } })
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('DELETE /api/employees error:', error)
    return NextResponse.json({ error: 'Failed to delete employee' }, { status: 500 })
  }
}
