import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { recalcPatientStatus } from '@/lib/patient-status'
import { notifyPatientParent } from '@/lib/notifications'

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const type = searchParams.get('type') || 'templates' // 'templates' or 'assignments'
    const patientId = searchParams.get('patientId') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    // Fetch patient package assignments.
    // Each assignment is independent — includes assignment-level fields
    // (name, therapyType, sessionDuration, validityDays) with fallback to the
    // template, plus per-package billing (amountPaid, dueAmount, paymentStatus).
    if (type === 'assignments') {
      const where: Record<string, unknown> = { organizationId }
      if (patientId) where.patientId = patientId
      // Parents can only ever see their own child's packages/billing.
      if (user.role === 'parent') where.patientId = user.patientId || '__none__'
      if (search) {
        where.OR = [
          { patient: { childName: { contains: search } } },
          { patient: { patientId: { contains: search } } },
          { package: { name: { contains: search } } },
          { name: { contains: search } },
        ]
      }

      const [rows, total] = await Promise.all([
        db.patientPackage.findMany({
          where,
          include: {
            patient: { select: { id: true, patientId: true, childName: true, mobile: true, dateOfBirth: true, gender: true } },
            package: true,
            payments: {
              where: { status: 'completed', type: 'payment' },
              select: { amount: true },
            },
            appointments: { select: { status: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.patientPackage.count({ where }),
      ])

      // Compute per-package billing fields + merge assignment/template fields.
      const assignments = rows.map((pp) => {
        const amountPaid = pp.payments.reduce((sum, p) => sum + p.amount, 0)
        const dueAmount = Math.max(0, pp.netAmount - amountPaid)
        let paymentStatus: 'paid' | 'partial' | 'pending' = 'pending'
        if (amountPaid >= pp.netAmount && pp.netAmount > 0) paymentStatus = 'paid'
        else if (amountPaid > 0) paymentStatus = 'partial'
        // Sessions purchased but never placed on the calendar at all — same
        // derivation as GET /api/patient-packages; this is the endpoint the
        // Packages assignments UI actually calls, so it needs the field too.
        const sessionsScheduled = pp.appointments.length
        const sessionsUnscheduled = Math.max(0, pp.sessionsPurchased - sessionsScheduled)
        const { payments: _payments, appointments: _appointments, ...rest } = pp
        void _payments
        void _appointments
        // Resolve effective fields with fallback to template (for back-compat with
        // assignments created before the snapshot fields existed).
        const pkg = pp.package
        return {
          ...rest,
          name: pp.name ?? pkg?.name ?? null,
          therapyType: pp.therapyType ?? pkg?.therapyType ?? null,
          sessionDuration: pp.sessionDuration ?? pkg?.sessionDuration ?? null,
          validityDays: pp.validityDays ?? pkg?.validityDays ?? null,
          amountPaid,
          dueAmount,
          paymentStatus,
          sessionsScheduled,
          sessionsUnscheduled,
        }
      })

      return NextResponse.json({ assignments, total, page, limit })
    }

    // Default: fetch package templates
    const where: Record<string, unknown> = { organizationId }
    if (search) where.name = { contains: search }
    // Only show active packages by default, unless explicitly requested
    const showAll = searchParams.get('showAll') === 'true'
    if (!showAll) where.isActive = true

    const [packages, total] = await Promise.all([
      db.package.findMany({ where, include: { therapyTypes: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      db.package.count({ where }),
    ])

    // Also compute assignment stats (all counts are of PatientPackage ASSIGNMENTS,
    // so Total >= Active >= Expiring Soon is always logical).
    const [totalAssignments, activeCount, expiringCount, expiredCount] = await Promise.all([
      db.patientPackage.count({ where: { organizationId } }),
      db.patientPackage.count({ where: { status: 'active', organizationId } }),
      db.patientPackage.count({
        where: {
          status: 'active',
          endDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // within 15 days
          },
          organizationId,
        },
      }),
      db.patientPackage.count({ where: { status: 'expired', organizationId } }),
    ])

    return NextResponse.json({ packages, total, page, limit, stats: { totalAssignments, activeCount, expiringCount, expiredCount } })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch packages' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()

    // Multi-therapy-type bundle (e.g. Speech x10, OT x5, ABA x8): each entry
    // becomes a PackageTherapyType row. The legacy therapyType/sessionCount
    // fields on Package still get set (to a summary) so any older UI/report
    // that reads them directly keeps working.
    const therapyTypesInput: Array<{ therapyType: string; sessionCount: number; sessionDuration?: number }> =
      Array.isArray(body.therapyTypes)
        ? body.therapyTypes.filter((t: { therapyType?: string; sessionCount?: number }) => t?.therapyType && Number(t.sessionCount) > 0)
        : []

    if (therapyTypesInput.length > 0) {
      const totalSessions = therapyTypesInput.reduce((sum, t) => sum + Number(t.sessionCount), 0)
      const pkg = await db.$transaction(async (tx) => {
        const created = await tx.package.create({
          data: {
            name: body.name,
            therapyType: therapyTypesInput.length > 1 ? 'Multiple Therapies' : therapyTypesInput[0].therapyType,
            sessionCount: totalSessions,
            sessionDuration: body.sessionDuration || therapyTypesInput[0].sessionDuration || 30,
            amount: body.amount,
            discount: body.discount || 0,
            validityDays: body.validityDays || 30,
            organizationId,
          },
        })
        await tx.packageTherapyType.createMany({
          data: therapyTypesInput.map((t) => ({
            packageId: created.id,
            therapyType: t.therapyType,
            sessionCount: Number(t.sessionCount),
            sessionDuration: t.sessionDuration ? Number(t.sessionDuration) : null,
            organizationId,
          })),
        })
        return created
      })
      const withTypes = await db.package.findFirst({ where: { id: pkg.id, organizationId }, include: { therapyTypes: true } })
      return NextResponse.json(withTypes, { status: 201 })
    }

    // Legacy single-type package (unchanged)
    const pkg = await db.package.create({
      data: {
        name: body.name,
        therapyType: body.therapyType,
        sessionCount: body.sessionCount,
        sessionDuration: body.sessionDuration,
        amount: body.amount,
        discount: body.discount || 0,
        validityDays: body.validityDays || 30,
        organizationId,
      },
    })

    return NextResponse.json(pkg, { status: 201 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to create package' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { id, ...data } = body
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    // Allowlist — only Package template fields. The template is the shared
    // definition; editing it does NOT touch any PatientPackage assignment
    // (assignments snapshot their own copy of these fields at assignment time).
    const allowed: Record<string, unknown> = {}
    const allowFields = ['name', 'therapyType', 'sessionCount', 'sessionDuration', 'amount', 'discount', 'validityDays', 'isActive', 'branchId']
    for (const f of allowFields) {
      if (f in data) allowed[f] = data[f]
    }

    // therapyType/sessionCount/sessionDuration are only a legacy mirror of
    // the FIRST therapyTypes[] block for bundle packages — the real
    // per-type breakdown. Editing them directly on a bundle would silently
    // drift them from that breakdown, so block it for bundles specifically.
    const existing = await db.package.findFirst({ where: { id, organizationId }, select: { therapyTypes: { select: { id: true } } } })
    if (!existing) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 })
    }
    if (existing.therapyTypes.length > 0) {
      const bundleOnlyFields = ['therapyType', 'sessionCount', 'sessionDuration'] as const
      const blocked = bundleOnlyFields.filter((f) => f in allowed)
      if (blocked.length > 0) {
        return NextResponse.json({
          error: `Cannot edit ${blocked.join(', ')} directly on a multi-therapy bundle package — these fields only mirror its first therapy-type block. Edit the bundle's therapy types instead.`,
        }, { status: 409 })
      }
    }

    const pkg = await db.package.update({ where: { id }, data: allowed as Prisma.PackageUpdateInput })
    return NextResponse.json(pkg)
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to update package' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const owned = await db.package.findFirst({ where: { id, organizationId } })
    if (!owned) return NextResponse.json({ error: 'Package not found' }, { status: 404 })

    // Check if any PatientPackage assignments still reference this template.
    // If so, refuse to delete — editing/deleting an assignment should happen
    // via /api/patient-packages/[id] (scoped to a single assignment).
    const assignmentCount = await db.patientPackage.count({ where: { packageId: id, organizationId } })
    if (assignmentCount > 0) {
      return NextResponse.json({
        error: `Cannot delete this package template because ${assignmentCount} patient assignment(s) still reference it. Remove the assignments individually first (via the Packages > Assignments tab).`,
      }, { status: 409 })
    }

    await db.package.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Package delete error:', error)
    return NextResponse.json({ error: 'Failed to delete package' }, { status: 500 })
  }
}

// PATCH - Assign package to patient
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { patientId, packageId, startDate, discountAmount } = body

    const pkg = await db.package.findFirst({ where: { id: packageId, organizationId }, include: { therapyTypes: true } })
    if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })

    const start = new Date(startDate || new Date())
    const end = new Date(start)
    end.setDate(end.getDate() + pkg.validityDays)

    const isBundle = pkg.therapyTypes.length > 0
    const totalSessions = isBundle ? pkg.therapyTypes.reduce((sum, t) => sum + t.sessionCount, 0) : pkg.sessionCount

    const patientPackageId = await db.$transaction(async (tx) => {
      const created = await tx.patientPackage.create({
        data: {
          patientId,
          packageId,
          // Snapshot template fields onto the assignment so it is fully independent.
          name: pkg.name,
          therapyType: isBundle ? 'Multiple Therapies' : pkg.therapyType,
          sessionDuration: pkg.sessionDuration,
          validityDays: pkg.validityDays,
          sessionsPurchased: totalSessions,
          totalAmount: pkg.amount,
          discountAmount: discountAmount || 0,
          netAmount: pkg.amount - (discountAmount || 0),
          startDate: start,
          endDate: end,
          organizationId,
        },
      })

      // Snapshot each bundle line onto the assignment so per-type session
      // counts stay independent (completing a Speech session never touches
      // the OT block's count, etc).
      if (isBundle) {
        await tx.patientPackageTherapyType.createMany({
          data: pkg.therapyTypes.map((t) => ({
            patientPackageId: created.id,
            therapyType: t.therapyType,
            sessionsPurchased: t.sessionCount,
            sessionDuration: t.sessionDuration ?? pkg.sessionDuration,
            organizationId,
          })),
        })
      }

      return created.id
    })

    const patientPackage = await db.patientPackage.findFirst({
      where: { id: patientPackageId, organizationId },
      include: { therapyTypeBlocks: true },
    })

    // This is the endpoint the "Assign Package" UI actually calls — recalc
    // here so a newly-assigned package reactivates the patient immediately
    // instead of waiting for the next lazy self-heal on Patients/Dashboard load.
    await recalcPatientStatus(patientId)

    await notifyPatientParent(organizationId ?? null, patientId, {
      type: 'package',
      title: 'Package Assigned',
      message: `A new package "${pkg.name}" with ${totalSessions} session(s) has been assigned.`,
      link: 'parent-dashboard',
    })

    return NextResponse.json(patientPackage, { status: 201 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to assign package' }, { status: 500 })
  }
}
