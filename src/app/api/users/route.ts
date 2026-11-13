import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { getAssignableRoles, ROLE_THERAPY_TYPE } from '@/lib/role-permissions'
import { linkOrCreateEmployeeForUser } from '@/lib/employee-sync'
import { checkTherapistUserLimit, checkStaffUserLimit, isTherapistRole } from '@/lib/subscription-limits'
import { passwordWriteFields } from '@/lib/user-password'
import { hashPassword } from '@/lib/password'

// Roles that can appear as a "Therapist" column/assignee across the app
// (schedule grid, appointment forms, WhatsApp reminders, etc).
import { THERAPIST_ROLES } from '@/lib/therapists'

// GET - List users with optional branch filter
// A secondary role is a job title, not access: it must be a role this user
// could assign anyway, and never the same as the account's own role.
// Permissions are read from `role` alone, everywhere.
async function resolveSecondaryRole(
  raw: unknown,
  primaryRole: string,
  currentUserRole: string,
  organizationId: string | null | undefined,
): Promise<{ value: string | null } | { error: string }> {
  if (raw === null || raw === '' || raw === undefined) return { value: null }
  if (typeof raw !== 'string') return { error: 'Invalid second role' }
  if (raw === primaryRole) return { error: 'The second role must be different from the account’s role' }
  if (raw === 'parent') return { error: 'Parent cannot be used as a second role' }
  if (getAssignableRoles(currentUserRole).includes(raw)) return { value: raw }
  const custom = await db.role.findFirst({ where: { slug: raw, organizationId } })
  if (!custom) return { error: `You are not allowed to assign the "${raw}" role` }
  return { value: raw }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const isAdmin = user.role === 'admin' || user.role === 'super_admin'

    // Non-admin roles (therapist, receptionist, etc.) can't see the full user
    // directory (emails, phone numbers, branch assignments of every account),
    // but they DO need the therapist name list to populate the schedule
    // grid/assignment dropdowns — return just that minimal, safe subset
    // instead of a blanket 403 (which broke the "My Appointments" grid for
    // every therapist login).
    if (!isAdmin) {
      const therapistUsers = await db.user.findMany({
        where: { organizationId, OR: [{ role: { in: THERAPIST_ROLES } }, { takesSessions: true }] },
        select: { id: true, name: true, role: true, secondaryRole: true, takesSessions: true, therapyType: true, isActive: true },
        orderBy: { name: 'asc' },
      })
      const names = therapistUsers.map((u) => u.name).filter(Boolean)
      const designationByName = new Map<string, string>()
      if (names.length > 0) {
        const employees = await db.employee.findMany({
          where: { name: { in: names }, organizationId },
          select: { name: true, designation: true },
        })
        for (const e of employees) {
          if (e.designation) designationByName.set(e.name, e.designation)
        }
      }
      const minimalTherapists = therapistUsers.map((u) => ({
        ...u,
        designation: designationByName.get(u.name) || null,
      }))
      return NextResponse.json(minimalTherapists)
    }

    const { searchParams } = new URL(request.url)
    const branchId = searchParams.get('branchId')
    const role = searchParams.get('role')
    const search = searchParams.get('search') || ''
    const fromDate = searchParams.get('fromDate') || ''
    const toDate = searchParams.get('toDate') || ''

    const where: Record<string, unknown> = { organizationId }
    if (branchId) where.branchId = branchId
    if (role) where.role = role
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
      ]
    }
    if (fromDate || toDate) {
      const dateFilter: Record<string, Date> = {}
      if (fromDate) dateFilter.gte = new Date(`${fromDate}T00:00:00.000Z`)
      if (toDate) dateFilter.lte = new Date(`${toDate}T23:59:59.999Z`)
      where.createdAt = dateFilter
    }

    const users = await db.user.findMany({
      where,
      include: {
        branch: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const safeUsers = users.map(({ password: _, ...user }) => user)

    // Enrich therapist/staff users with their real job designation from the
    // Employee record. There's no direct Employee<->User foreign key (same
    // fuzzy name-match pattern used at login and in notifyEmployeeByName), so
    // look up by name — this is what lets the UI show an actual designation
    // (e.g. "Senior Speech Therapist") instead of just the system role.
    const names = safeUsers.map((u) => u.name).filter(Boolean)
    const designationByName = new Map<string, string>()
    if (names.length > 0) {
      const employees = await db.employee.findMany({
        where: { name: { in: names }, organizationId },
        select: { name: true, designation: true },
      })
      for (const e of employees) {
        if (e.designation) designationByName.set(e.name, e.designation)
      }
    }
    const enrichedUsers = safeUsers.map((u) => ({
      ...u,
      designation: designationByName.get(u.name) || null,
    }))

    return NextResponse.json(enrichedUsers)
  } catch (error) {
    console.error('User list error:', error)
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

// POST - Create a new user
export async function POST(request: NextRequest) {
  try {
    const currentUser = await requireSessionUser(request)
    const organizationId = currentUser.organizationId
    // admin can create staff logins too (the Employees page offers it) —
    // WHICH roles they may assign is enforced below, not by locking the
    // whole endpoint to super_admin. That lock was the source of the
    // "Login account creation failed: Forbidden" bug when an admin added
    // an employee with a login.
    if (currentUser.role !== 'super_admin' && currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { email, password, name, phone, role, branchId, patientId } = body
    let { therapyType } = body
    // Only meaningful for accounts that aren't already a therapist role.
    let takesSessions = body.takesSessions === true && !THERAPIST_ROLES.includes(role) && role !== 'parent'
    const secondary = await resolveSecondaryRole(body.secondaryRole, role, currentUser.role, organizationId)
    if ('error' in secondary) return NextResponse.json({ error: secondary.error }, { status: 403 })
    // Holding a therapy job role is exactly what "also takes sessions" means.
    if (secondary.value) takesSessions = true

    if (!email || !password || !name || !role) {
      return NextResponse.json(
        { error: 'Email, password, name, and role are required' },
        { status: 400 }
      )
    }

    // Server-side assignable-role enforcement: built-in roles per the same
    // tiering the UI uses, plus this organization's custom roles. An admin
    // can never mint another admin/super_admin via the API.
    const assignable = getAssignableRoles(currentUser.role)
    if (!assignable.includes(role)) {
      const customRole = await db.role.findFirst({ where: { slug: role, organizationId } })
      if (!customRole) {
        return NextResponse.json(
          { error: `You are not allowed to assign the "${role}" role` },
          { status: 403 }
        )
      }
    }

    // Therapist logins default their therapyType from the role so sessions
    // pre-fill correctly (see /api/sessions falling back to user.therapyType).
    if (!therapyType && ROLE_THERAPY_TYPE[role]) {
      therapyType = ROLE_THERAPY_TYPE[role]
    }

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
    }

    // Plan seat enforcement (SaaS): therapist roles count against the plan's
    // therapistLimit, other staff against userLimit. Parent portal accounts
    // are unlimited — they're patients' guardians, not seats.
    if (role !== 'parent') {
      const seatCheck = isTherapistRole(role)
        ? await checkTherapistUserLimit(organizationId ?? null)
        : await checkStaffUserLimit(organizationId ?? null)
      if (!seatCheck.ok) return seatCheck.response
    }

    // Staff logins are staff: they get paid, so they must exist in the
    // Employees module too (salary/payroll/attendance). Created in the SAME
    // transaction — an existing employee with this email is linked instead
    // of duplicated. Parents are portal guests and get no employee record.
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          ...(await passwordWriteFields(password)),
          name,
          phone,
          role,
          branchId: branchId || null,
          patientId: patientId || null,
          therapyType: therapyType || null,
          takesSessions,
          secondaryRole: secondary.value,
          organizationId,
        },
        include: {
          branch: {
            select: { id: true, name: true, code: true },
          },
        },
      })
      await linkOrCreateEmployeeForUser(tx as never, organizationId ?? null, created)
      return created
    })

    await db.activityLog.create({
      data: {
        userId: user.id,
        action: 'user_created',
        module: 'user_management',
        details: `User ${name} (${role}) created`,
        organizationId,
      },
    })

    const { password: _, ...safeUser } = user
    return NextResponse.json(safeUser, { status: 201 })
  } catch (error) {
    console.error('User create error:', error)
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}

// PUT - Update a user
export async function PUT(request: NextRequest) {
  try {
    const currentUser = await requireSessionUser(request)
    const organizationId = currentUser.organizationId
    if (currentUser.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { id, email, name, phone, role, branchId, patientId, therapyType, isActive, password, takesSessions } = body

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const targetUser = await db.user.findFirst({ where: { id, organizationId } })
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    const finalRole = role ?? targetUser.role

    if (email) {
      const existing = await db.user.findUnique({ where: { email } })
      if (existing && existing.id !== id) {
        return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
      }
    }

    // A changed role must be one this user may assign (same rule as POST).
    const roleChanged = role !== undefined && role !== targetUser.role
    if (roleChanged) {
      const assignable = getAssignableRoles(currentUser.role)
      if (!assignable.includes(role)) {
        const customRole = await db.role.findFirst({ where: { slug: role, organizationId } })
        if (!customRole) {
          return NextResponse.json({ error: `You are not allowed to assign the "${role}" role` }, { status: 403 })
        }
      }
    }

    // Never leave a clinic without an Org Admin: demoting or deactivating the
    // last active super_admin locks everyone out of Settings/staff/billing
    // and breaks Platform Admin "Login as". (Happened: the only admin changed
    // their own role to a therapist role.)
    const losesAdmin = targetUser.role === 'super_admin' && targetUser.isActive &&
      (roleChanged || isActive === false)
    if (losesAdmin) {
      const otherAdmins = await db.user.count({
        where: { organizationId, role: 'super_admin', isActive: true, id: { not: id } },
      })
      if (otherAdmins === 0) {
        return NextResponse.json(
          { error: 'This is the clinic\'s only Org Admin account — its role can\'t be changed and it can\'t be deactivated, or nobody could manage the clinic. To show what they treat, turn on "Also takes therapy sessions" and pick a specialization.' },
          { status: 400 }
        )
      }
    }

    const updateData: Record<string, unknown> = {}
    if (email !== undefined) updateData.email = email
    if (name !== undefined) updateData.name = name
    if (phone !== undefined) updateData.phone = phone
    if (role !== undefined) updateData.role = role
    if (branchId !== undefined) updateData.branchId = branchId || null
    if (patientId !== undefined) updateData.patientId = patientId || null
    if (therapyType !== undefined) updateData.therapyType = therapyType || null
    if (isActive !== undefined) updateData.isActive = isActive
    if (typeof takesSessions === 'boolean') {
      updateData.takesSessions = takesSessions && !THERAPIST_ROLES.includes(finalRole) && finalRole !== 'parent'
    }
    if (body.secondaryRole !== undefined) {
      const secondary = await resolveSecondaryRole(body.secondaryRole, finalRole, currentUser.role, organizationId)
      if ('error' in secondary) return NextResponse.json({ error: secondary.error }, { status: 403 })
      updateData.secondaryRole = secondary.value
      if (secondary.value) updateData.takesSessions = true
    }
    if (password !== undefined && password.length > 0) {
      Object.assign(updateData, await passwordWriteFields(password))
    }

    const user = await db.user.update({
      where: { id },
      data: updateData,
      include: {
        branch: {
          select: { id: true, name: true, code: true },
        },
      },
    })

    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'user_updated',
        module: 'user_management',
        details: `User ${user.name} (${user.role}) updated`,
        organizationId,
      },
    })

    const { password: _, ...safeUser } = user
    return NextResponse.json(safeUser)
  } catch (error) {
    console.error('User update error:', error)
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

// DELETE - Delete a user
export async function DELETE(request: NextRequest) {
  try {
    const currentUser = await requireSessionUser(request)
    const organizationId = currentUser.organizationId
    if (currentUser.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const user = await db.user.findFirst({ where: { id, organizationId } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    if (user.role === 'super_admin') {
      return NextResponse.json({ error: 'Cannot delete Super Admin account' }, { status: 400 })
    }

    await db.user.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('User delete error:', error)
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
