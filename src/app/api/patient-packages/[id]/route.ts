import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { recalcPatientStatus } from '@/lib/patient-status'
import { syncPackageUsage } from '@/lib/package-usage'

// PUT /api/patient-packages/[id] — edit ONE patient's package assignment.
// Scoped to this single assignment only — never touches the shared Package
// template or any other patient's assignment (see PackagesPage.tsx openEditAssignment).
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    const body = await request.json()

    const existing = await db.patientPackage.findFirst({ where: { id, organizationId } })
    if (!existing) {
      return NextResponse.json({ error: 'Package assignment not found' }, { status: 404 })
    }

    const totalAmount = body.totalAmount ?? existing.totalAmount
    const discountAmount = body.discountAmount ?? existing.discountAmount
    const netAmount = Math.max(0, totalAmount - discountAmount)
    const validityDays = body.validityDays ?? existing.validityDays ?? 30
    // Re-derive the end date from the (possibly just-edited) validity so
    // changing "Validity Days" actually moves the expiry instead of leaving
    // the assignment's original endDate silently stale.
    const endDate = new Date(existing.startDate.getTime() + validityDays * 24 * 60 * 60 * 1000)

    const updated = await db.patientPackage.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        therapyType: body.therapyType ?? existing.therapyType,
        sessionDuration: body.sessionDuration ?? existing.sessionDuration,
        sessionsPurchased: body.sessionsPurchased ?? existing.sessionsPurchased,
        totalAmount,
        discountAmount,
        netAmount,
        validityDays,
        endDate,
      },
      include: { package: true },
    })

    // Sessions purchased may have changed: re-derive used/complete from the
    // linked appointments before the patient's status is recalculated.
    await db.$transaction((tx) => syncPackageUsage(tx, updated.organizationId, updated.id))
    await recalcPatientStatus(updated.patientId)

    return NextResponse.json(updated)
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Patient package update error:', error)
    return NextResponse.json(
      { error: 'Failed to update package assignment', detail: (error as Error).message },
      { status: 500 }
    )
  }
}

// DELETE /api/patient-packages/[id] — remove ONE patient's package
// assignment. Super Admin only, matching the confirmation dialog's copy
// ("Only Super Admin can delete") in PackagesPage.tsx.
//
// Per that same confirmation dialog's promise — "All appointments and
// sessions generated from this package will be cancelled and removed from
// the scheduler too" — this also deletes every Appointment (and its linked
// TherapySession) generated from this assignment, whether it's a plain
// single-type assignment (Appointment.patientPackageId) or a bundle (linked
// via one of the assignment's PatientPackageTherapyType blocks instead).
// Payments stay untouched (Payment.patientPackageId is onDelete: SetNull) —
// financial history is never deleted, only detached from the removed
// assignment, same as every other delete flow in this app.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only Super Admin can delete packages.' }, { status: 403 })
    }
    const { id } = await params

    const patientPackage = await db.patientPackage.findFirst({
      where: { id, organizationId },
      include: { therapyTypeBlocks: { select: { id: true } } },
    })
    if (!patientPackage) {
      return NextResponse.json({ error: 'Package assignment not found' }, { status: 404 })
    }

    const blockIds = patientPackage.therapyTypeBlocks.map((b) => b.id)

    await db.$transaction(async (tx) => {
      const appointmentWhere = {
        organizationId,
        OR: [
          { patientPackageId: id },
          ...(blockIds.length > 0 ? [{ patientPackageTherapyTypeId: { in: blockIds } }] : []),
        ],
      }
      const appointments = await tx.appointment.findMany({ where: appointmentWhere, select: { id: true } })
      const appointmentIds = appointments.map((a) => a.id)

      if (appointmentIds.length > 0) {
        // TherapySession has no Prisma relation to Appointment (just a loose
        // appointmentId string), so it isn't cleaned up by any FK cascade —
        // remove it explicitly before the appointments themselves.
        await tx.therapySession.deleteMany({ where: { appointmentId: { in: appointmentIds }, organizationId } })
        await tx.appointment.deleteMany({ where: { id: { in: appointmentIds }, organizationId } })
      }

      // therapyTypeBlocks cascade-delete automatically (onDelete: Cascade);
      // Payments on this assignment get patientPackageId set to null
      // automatically (onDelete: SetNull) — never deleted.
      await tx.patientPackage.delete({ where: { id } })
    })

    await recalcPatientStatus(patientPackage.patientId)

    return NextResponse.json({ success: true })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Patient package delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete package assignment', detail: (error as Error).message },
      { status: 500 }
    )
  }
}
