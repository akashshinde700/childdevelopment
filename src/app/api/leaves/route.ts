import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { format } from 'date-fns'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { notifyEmployeeByName, notifyRoles } from '@/lib/notifications'
import { ensureDefaultLeavePolicies, resolveLeavePolicy } from '@/lib/leave-policy'
import { toIST } from '@/lib/timezone'

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const { searchParams } = new URL(request.url)
    const requestedEmployeeId = searchParams.get('employeeId') || ''
    const status = searchParams.get('status') || ''
    const leaveType = searchParams.get('leaveType') || ''
    const fromDate = searchParams.get('fromDate') || ''
    const toDate = searchParams.get('toDate') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const isAdmin = user.role === 'super_admin' || user.role === 'admin'
    const isSelfScopedRole = user.role === 'receptionist' || user.role.startsWith('therapist') || user.role === 'psychologist'
    if (!isAdmin && !isSelfScopedRole) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const where: Record<string, unknown> = { organizationId }
    let employeeId = requestedEmployeeId

    if (isSelfScopedRole) {
      if (!user.employeeId) {
        return NextResponse.json({ error: 'Employee information required' }, { status: 403 })
      }
      if (employeeId && employeeId !== user.employeeId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      employeeId = user.employeeId
    }

    if (employeeId) where.employeeId = employeeId
    if (status) where.status = status
    if (leaveType) where.leaveType = leaveType
    // Overlap filter: include any leave whose [startDate, endDate] window
    // intersects the requested [fromDate, toDate] range.
    if (fromDate) where.endDate = { gte: new Date(`${fromDate}T00:00:00.000Z`) }
    if (toDate) where.startDate = { lte: new Date(`${toDate}T23:59:59.999Z`) }

    const [leaves, total] = await Promise.all([
      db.leave.findMany({
        where,
        include: { employee: { select: { id: true, name: true, employeeId: true, designation: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.leave.count({ where }),
    ])

    return NextResponse.json({ leaves, total, page, limit })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch leaves' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const body = await request.json()

    // Required-field validation
    const { leaveType, startDate, endDate, reason } = body
    if (!leaveType || !startDate || !endDate || !reason || !String(reason).trim()) {
      return NextResponse.json({ error: 'Please fill all required fields' }, { status: 400 })
    }

    const start = new Date(startDate)
    const end = new Date(endDate)

    // end >= start validation
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end.getTime() < start.getTime()) {
      return NextResponse.json({ error: 'Invalid date selection' }, { status: 400 })
    }

    let employeeId = body.employeeId
    if ((user.role === 'receptionist' || user.role.startsWith('therapist')) && user.employeeId) {
      if (employeeId && employeeId !== user.employeeId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      employeeId = user.employeeId
    }

    if (!employeeId) {
      return NextResponse.json({ error: 'Employee ID required' }, { status: 400 })
    }

    // Duplicate leave prevention — check overlapping pending/approved leaves for the same employee
    const overlapping = await db.leave.findFirst({
      where: {
        employeeId,
        organizationId,
        status: { in: ['pending', 'approved'] },
        AND: [
          { startDate: { lte: end } },
          { endDate: { gte: start } },
        ],
      },
    })

    if (overlapping) {
      return NextResponse.json({ error: 'A leave request already exists for the selected date range' }, { status: 409 })
    }

    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    const totalDays = body.totalDays || days

    // Resolve the Super Admin-configured policy for this leave type (falling
    // back to the employee's branch override, else the global default) and
    // enforce its annual/monthly caps — null limit means unlimited (e.g.
    // unpaid/government leave don't deduct from any balance).
    await ensureDefaultLeavePolicies(db, organizationId ?? null)
    const employee = await db.employee.findFirst({ where: { id: employeeId, organizationId }, select: { branchId: true } })
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }
    const policy = await resolveLeavePolicy(db, organizationId ?? null, leaveType, employee?.branchId)

    if (policy) {
      const ist = toIST(start)
      const year = ist.getUTCFullYear()
      const month = ist.getUTCMonth()

      if (policy.annualLimit !== null || policy.monthlyLimit !== null) {
        const existingSameType = await db.leave.findMany({
          where: { employeeId, leaveType, organizationId, status: { in: ['pending', 'approved'] } },
          select: { totalDays: true, startDate: true },
        })

        if (policy.annualLimit !== null) {
          const usedThisYear = existingSameType
            .filter((l) => toIST(l.startDate).getUTCFullYear() === year)
            .reduce((sum, l) => sum + l.totalDays, 0)
          if (usedThisYear + totalDays > policy.annualLimit) {
            return NextResponse.json(
              { error: `Annual ${leaveType} leave limit of ${policy.annualLimit} day(s) would be exceeded (already used ${usedThisYear})` },
              { status: 400 }
            )
          }
        }

        if (policy.monthlyLimit !== null) {
          const usedThisMonth = existingSameType
            .filter((l) => toIST(l.startDate).getUTCFullYear() === year && toIST(l.startDate).getUTCMonth() === month)
            .reduce((sum, l) => sum + l.totalDays, 0)
          if (usedThisMonth + totalDays > policy.monthlyLimit) {
            return NextResponse.json(
              { error: `Monthly ${leaveType} leave limit of ${policy.monthlyLimit} day(s) would be exceeded (already used ${usedThisMonth})` },
              { status: 400 }
            )
          }
        }
      }
    }

    const leave = await db.leave.create({
      data: {
        employeeId,
        leaveType,
        startDate: start,
        endDate: end,
        totalDays,
        reason: String(reason).trim(),
        status: body.status || (policy && !policy.requiresApproval ? 'approved' : 'pending'),
        organizationId,
      },
    })
    return NextResponse.json(leave, { status: 201 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to create leave' }, { status: 500 })
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
    const { id, status, startDate, endDate, ...rest } = body
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    // Build update data carefully - only allow specific fields
    const updateData: Record<string, unknown> = { ...rest }

    // Handle date fields
    if (startDate !== undefined) {
      updateData.startDate = startDate ? new Date(startDate) : undefined
    }
    if (endDate !== undefined) {
      updateData.endDate = endDate ? new Date(endDate) : undefined
    }

    // Fetch the existing leave BEFORE updating so we know its date range + employee
    const existingLeave = await db.leave.findFirst({ where: { id, organizationId } })
    if (!existingLeave) {
      return NextResponse.json({ error: 'Leave not found' }, { status: 404 })
    }

    // When status changes to approved or rejected, set approvedBy and approvedAt
    if (status === 'approved' || status === 'rejected') {
      updateData.status = status
      updateData.approvedBy = user.name || user.id
      updateData.approvedAt = new Date()
    } else if (status !== undefined) {
      updateData.status = status
    }

    // Remove fields that shouldn't be updated directly
    delete updateData.employeeId
    delete updateData.id

    const leave = await db.leave.update({
      where: { id },
      data: updateData as Prisma.LeaveUpdateInput,
    })

    // When status is 'approved', upsert Attendance records with status='leave'
    // for each day from startDate to endDate (inclusive) for the leave's employee.
    // Prisma has no bulk-upsert primitive, so this batches all day-upserts into
    // a single transaction (one round trip) instead of awaiting each day
    // sequentially in a loop.
    if (status === 'approved') {
      const start = new Date(existingLeave.startDate)
      const end = new Date(existingLeave.endDate)
      const dayStarts: Date[] = []
      for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
        dayStarts.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())))
      }
      if (dayStarts.length > 0) {
        await db.$transaction(
          dayStarts.map((dayStart) =>
            db.attendance.upsert({
              where: { employeeId_date: { employeeId: existingLeave.employeeId, date: dayStart } },
              create: {
                employeeId: existingLeave.employeeId,
                date: dayStart,
                status: 'leave',
                notes: `Approved leave (${existingLeave.leaveType})`,
                organizationId,
              },
              update: {
                status: 'leave',
                notes: `Approved leave (${existingLeave.leaveType})`,
              },
            })
          )
        )
      }
    }

    // Cancelling a previously-approved leave should release the attendance
    // days it claimed — otherwise the employee stays marked 'leave' on dates
    // they're no longer actually off.
    if (status === 'cancelled' && existingLeave.status === 'approved') {
      const start = new Date(existingLeave.startDate)
      const end = new Date(existingLeave.endDate)
      const dayStarts: Date[] = []
      for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
        dayStarts.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())))
      }
      if (dayStarts.length > 0) {
        await db.attendance.deleteMany({
          where: { employeeId: existingLeave.employeeId, date: { in: dayStarts }, status: 'leave', organizationId },
        })
      }
    }

    if (status === 'approved' || status === 'rejected') {
      const employee = await db.employee.findFirst({ where: { id: existingLeave.employeeId, organizationId }, select: { name: true } })
      await notifyEmployeeByName(organizationId ?? null, employee?.name, {
        type: 'hr',
        title: `Leave ${status === 'approved' ? 'Approved' : 'Rejected'}`,
        message: `Your ${existingLeave.leaveType} leave request (${format(new Date(existingLeave.startDate), 'dd MMM')} – ${format(new Date(existingLeave.endDate), 'dd MMM')}) has been ${status}.`,
        link: 'leaves',
      })

      // On approval, flag any appointments this employee (as therapist) already
      // has scheduled during the leave window so admin/reception can reschedule
      // them — appointments are keyed by therapist NAME, not a user/employee id.
      if (status === 'approved' && employee?.name) {
        const leaveStart = new Date(existingLeave.startDate)
        const leaveEnd = new Date(existingLeave.endDate)
        const conflicting = await db.appointment.findMany({
          where: {
            therapistId: employee.name,
            status: { in: ['scheduled', 'confirmed'] },
            date: { gte: leaveStart, lte: leaveEnd },
            organizationId,
          },
          select: { date: true, patient: { select: { childName: true } } },
          orderBy: { date: 'asc' },
        })
        if (conflicting.length > 0) {
          const preview = conflicting
            .slice(0, 5)
            .map((a) => `${a.patient?.childName || 'Patient'} (${format(new Date(a.date), 'dd MMM')})`)
            .join(', ')
          await notifyRoles(organizationId ?? null, ['admin', 'super_admin', 'receptionist'], {
            type: 'hr',
            title: 'Appointment conflict with approved leave',
            message: `${employee.name} has ${conflicting.length} appointment(s) during approved leave (${format(leaveStart, 'dd MMM')} – ${format(leaveEnd, 'dd MMM')}): ${preview}${conflicting.length > 5 ? ', …' : ''}. Please reschedule.`,
            link: 'appointments',
          })
        }
      }
    }

    return NextResponse.json(leave)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to update leave' }, { status: 500 })
  }
}

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
    const owned = await db.leave.findFirst({ where: { id, organizationId } })
    if (!owned) return NextResponse.json({ error: 'Leave record not found' }, { status: 404 })
    await db.leave.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to delete leave' }, { status: 500 })
  }
}
