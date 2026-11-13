import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'

// Parse "HH:MM" to minutes
function timeStringToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// Compute derivedStatus for a single record
function computeDerivedStatus(r: { status: string; checkIn: string | null; checkOut: string | null }): string {
  if (r.status === 'present' && !r.checkIn) return 'absent'
  if (r.checkIn && !r.checkOut) return 'incomplete'
  return r.status
}

// Recompute workingHours if both checkIn and checkOut exist but workingHours is null/undefined
function recomputeWorkingHours(r: { checkIn: string | null; checkOut: string | null; workingHours: number | null }): number | null {
  if (r.checkIn && r.checkOut && (r.workingHours === null || r.workingHours === undefined)) {
    const diff = timeStringToMinutes(r.checkOut) - timeStringToMinutes(r.checkIn)
    if (diff > 0) return Math.round((diff / 60) * 100) / 100
  }
  return r.workingHours ?? null
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const { searchParams } = new URL(request.url)
    const requestedEmployeeId = searchParams.get('employeeId') || ''
    const statusFilter = searchParams.get('status') || ''
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : new Date().getMonth() + 1
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : new Date().getFullYear()

    const isAdmin = user.role === 'super_admin' || user.role === 'admin'
    const isSelfCheckinRole = user.role === 'receptionist' || user.role.startsWith('therapist') || user.role === 'psychologist'
    if (!isAdmin && !isSelfCheckinRole) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const where: Record<string, unknown> = { organizationId }
    let employeeId = requestedEmployeeId

    if (isSelfCheckinRole) {
      // Robust employee lookup: the session may not have employeeId set if the
      // login-time name lookup failed. Fall back to a name-based lookup so
      // therapists/receptionists can still fetch their own attendance.
      let resolvedEmpId = user.employeeId
      if (!resolvedEmpId && user.name) {
        const emp = await db.employee.findFirst({
          where: { name: { equals: user.name }, organizationId },
          select: { id: true },
        })
        if (!emp) {
          // Try case-insensitive / trimmed match as a last resort
          const empCI = await db.employee.findFirst({
            where: { name: { contains: user.name.trim() }, organizationId },
            select: { id: true },
          })
          resolvedEmpId = empCI?.id
        } else {
          resolvedEmpId = emp.id
        }
      }
      if (!resolvedEmpId) {
        return NextResponse.json({ error: 'Employee information required — no Employee record matches your user name. Ask an admin to create an Employee record with your exact name.' }, { status: 403 })
      }
      if (employeeId && employeeId !== resolvedEmpId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      employeeId = resolvedEmpId
    }

    if (employeeId) where.employeeId = employeeId

    // Department filter - filter by employee department
    const department = searchParams.get('department') || ''
    if (department) {
      where.employee = { department }
    }

    if (month && year) {
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0)
      where.date = { gte: startDate, lte: endDate }
    }

    const records = await db.attendance.findMany({
      where,
      include: { employee: { select: { id: true, name: true, employeeId: true, designation: true, department: true } } },
      orderBy: [{ date: 'desc' }, { employeeId: 'asc' }],
    })

    // Enrich each record with derivedStatus; recompute workingHours if missing
    const enriched = records.map((r) => {
      const derivedStatus = computeDerivedStatus(r)
      const workingHours = recomputeWorkingHours(r)
      return {
        ...r,
        derivedStatus,
        workingHours,
      }
    })

    // Apply ?status=incomplete (or other derived status) filter post-hoc
    const filtered = statusFilter
      ? enriched.filter((r) => r.derivedStatus === statusFilter)
      : enriched

    const summary = {
      present: filtered.filter((r) => r.derivedStatus === 'present').length,
      absent: filtered.filter((r) => r.derivedStatus === 'absent').length,
      halfDay: filtered.filter((r) => r.derivedStatus === 'half_day').length,
      leave: filtered.filter((r) => r.derivedStatus === 'leave').length,
      incomplete: filtered.filter((r) => r.derivedStatus === 'incomplete').length,
      totalHours: filtered.reduce((sum, r) => sum + (r.workingHours || 0), 0),
      totalOvertime: filtered.reduce((sum, r) => sum + (r.overtime || 0), 0),
    }

    return NextResponse.json({ records: filtered, summary })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const body = await request.json()
    const { employeeId, date, status, checkIn, checkOut, workingHours, overtime, notes } = body

    // Only admins may record attendance for an arbitrary employee. Every
    // other authenticated role (receptionist/therapist/psychologist) can
    // only self-check-in; anything else (e.g. parent) is forbidden outright.
    const isAdmin = user.role === 'super_admin' || user.role === 'admin'
    const isSelfCheckinRole = user.role === 'receptionist' || user.role.startsWith('therapist') || user.role === 'psychologist'
    if (!isAdmin && !isSelfCheckinRole) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Resolve the target employee ID. For self-checkin roles the session
    // may not have employeeId set (login name mismatch); fall back to a
    // name-based Employee lookup so self check-in still works.
    let resolvedEmpId = user.employeeId
    if (isSelfCheckinRole && !resolvedEmpId && user.name) {
      const emp = await db.employee.findFirst({
        where: { name: { equals: user.name }, organizationId },
        select: { id: true },
      }) || await db.employee.findFirst({
        where: { name: { contains: user.name.trim() }, organizationId },
        select: { id: true },
      })
      resolvedEmpId = emp?.id
    }

    if (isSelfCheckinRole && resolvedEmpId) {
      if (employeeId && employeeId !== resolvedEmpId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const targetEmployeeId = isSelfCheckinRole ? resolvedEmpId : employeeId

    if (!targetEmployeeId) {
      return NextResponse.json({ error: 'Employee ID required — no Employee record matches your user name. Ask an admin to create an Employee record with your exact name.' }, { status: 400 })
    }

    const record = await db.attendance.upsert({
      where: { employeeId_date: { employeeId: targetEmployeeId, date: new Date(date) } },
      create: {
        employeeId: targetEmployeeId,
        date: new Date(date),
        status: status || 'present',
        checkIn: checkIn || null,
        checkOut: checkOut || null,
        workingHours: workingHours ?? null,
        overtime: overtime ?? null,
        notes: notes || null,
        organizationId,
      },
      update: {
        status,
        checkIn: checkIn !== undefined ? (checkIn || null) : undefined,
        checkOut: checkOut !== undefined ? (checkOut || null) : undefined,
        workingHours: workingHours !== undefined ? (workingHours || null) : undefined,
        overtime: overtime !== undefined ? (overtime || null) : undefined,
        notes: notes !== undefined ? (notes || null) : undefined,
      },
    })

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to record attendance' }, { status: 500 })
  }
}

// Partial-update handler (admin/super_admin only)
// Accepts { id, status?, checkIn?, checkOut?, workingHours?, notes? } with partial-update semantics.
export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId

    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden: only admin and super_admin can edit attendance' }, { status: 403 })
    }

    const body = await request.json()
    const { id, status, checkIn, checkOut, workingHours, notes } = body as {
      id: string
      status?: string
      checkIn?: string | null
      checkOut?: string | null
      workingHours?: number | null
      notes?: string | null
    }

    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    if (status !== undefined) updateData.status = status
    if (checkIn !== undefined) updateData.checkIn = checkIn || null
    if (checkOut !== undefined) updateData.checkOut = checkOut || null
    if (workingHours !== undefined) updateData.workingHours = workingHours
    if (notes !== undefined) updateData.notes = notes || null

    const owned = await db.attendance.findFirst({ where: { id, organizationId } })
    if (!owned) return NextResponse.json({ error: 'Attendance record not found' }, { status: 404 })

    const record = await db.attendance.update({
      where: { id },
      data: updateData,
      include: { employee: { select: { id: true, name: true, employeeId: true, designation: true, department: true } } },
    })

    return NextResponse.json(record)
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to update attendance' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId

    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
    const owned = await db.attendance.findFirst({ where: { id, organizationId } })
    if (!owned) return NextResponse.json({ error: 'Attendance record not found' }, { status: 404 })
    await db.attendance.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to delete attendance' }, { status: 500 })
  }
}
