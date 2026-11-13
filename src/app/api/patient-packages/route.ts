import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'

// GET /api/patient-packages?patientId=xxx — list packages for a patient
// Returns per-package billing: amountPaid, dueAmount, paymentStatus
export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const { searchParams } = new URL(request.url)
    const patientId = searchParams.get('patientId') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '100')))

    const where: Record<string, unknown> = { organizationId }
    if (patientId) where.patientId = patientId
    // Parents can only ever see their own child's packages/billing —
    // regardless of what patientId (if any) was requested.
    if (user.role === 'parent') where.patientId = user.patientId || '__none__'

    const total = await db.patientPackage.count({ where })
    const packages = await db.patientPackage.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        package: true,
        payments: {
          where: { status: 'completed', type: 'payment' },
          select: { amount: true },
        },
        // Real, derived session counts — the canonical source of truth for
        // "how many sessions actually exist," independent of the static
        // `sessionsPurchased`/`sessionsCompleted` snapshot fields (which can
        // silently diverge from reality if some sessions failed to schedule
        // — see handleAssign's conflict-retry logic in PackagesPage.tsx).
        appointments: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Compute per-package billing fields + real (derived) session counts.
    const enriched = packages.map((pp) => {
      const amountPaid = pp.payments.reduce((sum, p) => sum + p.amount, 0)
      const dueAmount = Math.max(0, pp.netAmount - amountPaid)
      let paymentStatus: 'paid' | 'partial' | 'pending' = 'pending'
      if (amountPaid >= pp.netAmount && pp.netAmount > 0) paymentStatus = 'paid'
      else if (amountPaid > 0) paymentStatus = 'partial'

      const appts = pp.appointments
      // "Scheduled" excludes Cancelled — a cancelled session was never
      // actually delivered and shouldn't count against "is this session on
      // the calendar" any more than it counts toward Used. Previously this
      // counted every linked appointment regardless of status, which under-
      // counted `sessionsUnscheduled` (a cancelled slot was wrongly treated
      // as "already scheduled", hiding sessions that genuinely still need
      // to be booked).
      const sessionsScheduled = appts.filter((a) => a.status !== 'cancelled').length
      // "Used Sessions" — deliberately `pp.sessionsCompleted` (a counter
      // maintained by PUT /api/appointments at the moment each session is
      // marked complete), NOT `appts.filter(status==='completed').length`.
      // `appts` here only contains appointments with a DIRECT
      // Appointment.patientPackageId link, which many appointments never
      // get (manually created before a package picker existed, or created
      // by any flow that doesn't set it) — deriving purely from that
      // relation silently showed 0 used even after a real completed
      // session, which was the exact reported bug. `sessionsCompleted` is
      // reliable because its increment/decrement (undo) already resolves
      // legacy/unlinked appointments via a therapy-type match against the
      // patient's active packages (see PUT /api/appointments), so it stays
      // correct regardless of whether the FK was ever set.
      const sessionsCompletedActual = pp.sessionsCompleted
      const sessionsUpcoming = appts.filter((a) => a.status === 'scheduled' || a.status === 'confirmed' || a.status === 'rescheduled').length
      const sessionsMissed = appts.filter((a) => a.status === 'no_show').length
      const sessionsCancelled = appts.filter((a) => a.status === 'cancelled').length
      // Sessions purchased but never successfully placed on the calendar at
      // all (the exact gap that caused the "24 purchased vs 20 shown" bug).
      // Note: unlike sessionsCompletedActual above, this IS still derived
      // purely from the direct FK link, so it under-reports for legacy
      // appointments created without patientPackageId — new appointments
      // (via the Assign Package wizard, or the Create Appointment form's
      // package picker) always set it, so this gap does not grow further.
      const sessionsUnscheduled = Math.max(0, pp.sessionsPurchased - sessionsScheduled)
      // Canonical "how many of the purchased sessions are left to use" — the
      // single source of truth every screen (Package Info panel, Packages
      // list, Patient Profile/History) should read instead of each
      // recomputing its own (previously divergent) version of this number.
      const sessionsRemaining = Math.max(0, pp.sessionsPurchased - sessionsCompletedActual)

      // Hide raw payments/appointments arrays from response
      const { payments: _payments, appointments: _appointments, ...rest } = pp
      void _payments
      void _appointments
      return {
        ...rest,
        amountPaid,
        dueAmount,
        paymentStatus,
        sessionsScheduled,
        sessionsCompletedActual,
        sessionsUpcoming,
        sessionsMissed,
        sessionsCancelled,
        sessionsUnscheduled,
        sessionsRemaining,
      }
    })

    return NextResponse.json({ packages: enriched, total, page, limit })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch patient packages' }, { status: 500 })
  }
}
