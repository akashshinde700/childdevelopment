import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'

// GET /api/patients/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const { id } = await params
    // findFirst (not findUnique) so the isDeleted filter can be applied —
    // every other Patient query site in the app excludes soft-deleted rows;
    // this one was the exception, leaving a deleted patient's full profile
    // (packages, invoices, payments, appointments) reachable by direct link.
    const patient = await db.patient.findFirst({ where: { id, isDeleted: false, organizationId } })
    if (!patient) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (user.role === 'parent') {
      // Parents can only access their own linked child's data
      if (!user.patientId || user.patientId !== id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else if (user.role.startsWith('therapist')) {
      const assigned = await db.appointment.findFirst({
        where: { patientId: id, therapistId: user.name, organizationId },
      })
      if (!assigned) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const [packages, appointments, sessions, assessments, payments, invoices] = await Promise.all([
      db.patientPackage.findMany({
        where: { patientId: id, organizationId },
        include: {
          package: true,
          payments: {
            where: { status: 'completed', type: 'payment' },
            select: { id: true, amount: true, date: true, paymentMode: true, paymentNo: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.appointment.findMany({
        where: { patientId: id, organizationId },
        orderBy: { date: 'desc' },
        // Latest parent reschedule request, so the parent portal can show
        // pending / declined (with the staff's reason).
        include: {
          rescheduleRequests: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, status: true, reason: true, preferredDate: true, preferredTime: true, responseNote: true, createdAt: true },
          },
        },
      }),
      db.therapySession.findMany({
        where: { patientId: id, organizationId },
        orderBy: { date: 'desc' },
      }),
      db.assessment.findMany({
        where: { patientId: id, organizationId },
        orderBy: { scheduledDate: 'desc' },
      }),
      db.payment.findMany({
        where: { patientId: id, organizationId },
        orderBy: { date: 'desc' },
      }),
      db.invoice.findMany({
        where: { patientId: id, organizationId },
        orderBy: { date: 'desc' },
        // Item types tell a package bill apart from other charges in the
        // billing breakdown below.
        include: { invoiceItems: { select: { type: true } } },
      }),
    ])

    // Per-package billing: each PatientPackage is tracked independently.
    // amountPaid = sum of payments linked to that assignment (patientPackageId).
    // dueAmount = max(0, netAmount - amountPaid).
    // paymentStatus = paid | partial | pending.
    const packagesWithBilling = packages.map((pp) => {
      const amountPaid = pp.payments.reduce((sum, p) => sum + p.amount, 0)
      const dueAmount = Math.max(0, pp.netAmount - amountPaid)
      let paymentStatus: 'paid' | 'partial' | 'pending' = 'pending'
      if (amountPaid >= pp.netAmount && pp.netAmount > 0) paymentStatus = 'paid'
      else if (amountPaid > 0) paymentStatus = 'partial'
      return {
        ...pp,
        name: pp.name ?? pp.package?.name ?? null,
        therapyType: pp.therapyType ?? pp.package?.therapyType ?? null,
        sessionDuration: pp.sessionDuration ?? pp.package?.sessionDuration ?? null,
        validityDays: pp.validityDays ?? pp.package?.validityDays ?? null,
        amountPaid,
        dueAmount,
        paymentStatus,
      }
    })

    // Prefer the actual PatientPackage assignment's own netAmount/discountAmount
    // when one exists (the more precise source — reflects that specific
    // assignment's discount). Fall back to summing the invoice(s) directly
    // when the patient has NO PatientPackage row at all — e.g. an invoice
    // created by picking a package price straight off the price list as a
    // line item, without ever going through "Assign Package" — so
    // Package Price/Discount/Final Package Amount don't silently show ₹0
    // despite a real, package-priced invoice existing (the same class of gap
    // `pendingAmount` below was already fixed for).
    const hasPackages = packagesWithBilling.length > 0
    const nonCancelledInvoices = invoices.filter((inv) => inv.status !== 'cancelled')
    const totalPackageAmount = hasPackages
      ? packagesWithBilling.reduce((sum, p) => sum + p.netAmount, 0)
      : nonCancelledInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0)
    const totalDiscount = hasPackages
      ? packagesWithBilling.reduce((sum, p) => sum + (p.discountAmount || 0), 0)
      : nonCancelledInvoices.reduce((sum, inv) => sum + (inv.discount || 0), 0)
    const totalSessionsCompleted = sessions.filter(s => s.status === 'completed').length
    const totalSessionsPurchased = packagesWithBilling.reduce((sum, p) => sum + p.sessionsPurchased, 0)

    // Total amount paid — computed from BOTH invoices and payments so the
    // Patient History reflects invoice payments even when no Payment record
    // exists (the Payments module was removed; invoices are the primary billing
    // mechanism now).
    // 1. Sum invoice amountPaid (non-cancelled invoices)
    const invoicePaid = invoices
      .filter(inv => inv.status !== 'cancelled')
      .reduce((sum, inv) => sum + (inv.amountPaid || 0), 0)
    // 2. Sum package-linked payments (completed, type=payment)
    const linkedPaid = packagesWithBilling.reduce((sum, p) => sum + p.amountPaid, 0)
    // 3. Sum completed payments not attached to a package.
    const standalonePaid = payments.filter(p => !p.patientPackageId && p.status === 'completed' && p.type === 'payment')
      .reduce((sum, p) => sum + p.amount, 0)

    const paymentBasedPaid = linkedPaid + standalonePaid

    // 4. Some invoices may carry amountPaid values even when no Payment record exists.
    //    Add only the invoice-paid amount that is not already represented by payment records
    //    to avoid both double-counting and under-counting.
    const paymentsByInvoiceId = payments.reduce<Record<string, number>>((map, p) => {
      if (p.invoiceId && p.status === 'completed' && p.type === 'payment') {
        map[p.invoiceId] = (map[p.invoiceId] || 0) + p.amount
      }
      return map
    }, {})

    const invoiceDiffPayment = invoices
      .filter(inv => inv.status !== 'cancelled')
      .reduce((sum, inv) => {
        const alreadyRecorded = paymentsByInvoiceId[inv.id] || 0
        return sum + Math.max(0, (inv.amountPaid || 0) - alreadyRecorded)
      }, 0)

    const totalAmountPaid = paymentBasedPaid + invoiceDiffPayment

    // Outstanding balance — summed directly from each invoice's own
    // totalAmount/amountPaid (mirrors the same, already-correct calculation
    // `/api/patients` (list) uses for its `invoiceSummary.balanceDue`).
    // Deliberately NOT derived from `totalPackageAmount`: a package is
    // sometimes billed as a generic type='service' line item (no
    // patientPackageId link) instead of a type='package' item, so there is
    // no reliable way to tell "this invoice bills that package" apart from
    // "this is a genuinely separate charge" — trying to combine the two
    // either double-counts (when a service item re-describes a package) or
    // ignores real debt entirely (a patient whose ONLY invoice is
    // type='service' previously always showed pendingAmount = 0, no matter
    // how much they actually owed).
    const pendingAmount = invoices
      .filter((inv) => inv.status !== 'cancelled')
      .reduce((sum, inv) => sum + Math.max(0, (inv.totalAmount || 0) - (inv.amountPaid || 0)), 0)

    // `appointments` is sorted `date: desc` (furthest-future date first, oldest
    // last) and mixes past + future appointments of every status. Naively
    // taking `.find()` / `[0]` off that array picks the FURTHEST-future
    // scheduled appointment as "next" (backwards — should be the soonest) and
    // whatever has the latest date at all (even a future one) as "last"
    // (should be the most recent appointment that already happened).
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const upcomingCandidates = appointments.filter(
      (a) => (a.status === 'scheduled' || a.status === 'confirmed') && new Date(a.date) >= todayStart
    )
    // Still desc-sorted, so the last matching entry has the smallest (soonest) date.
    const nextAppointment = upcomingCandidates.length > 0 ? upcomingCandidates[upcomingCandidates.length - 1] : null
    const lastAppointment = appointments.find((a) => new Date(a.date) < todayStart) || null

    // ── Billing breakdown: package-wise vs session-wise vs other ──
    // One patient can pay both ways (a package, plus extra sessions billed
    // one by one). The totals above blend everything; this splits it so
    // staff and parents can see what each rupee was for.
    const round = (n: number) => Math.round(n * 100) / 100
    const sumUp = <T extends { total: number; paid: number; due: number }>(rows: T[]) => ({
      total: round(rows.reduce((a, r) => a + r.total, 0)),
      paid: round(rows.reduce((a, r) => a + r.paid, 0)),
      due: round(rows.reduce((a, r) => a + r.due, 0)),
    })

    const packageRows = packagesWithBilling.map((p) => ({
      id: p.id,
      name: p.name || 'Package',
      therapyType: p.therapyType,
      sessionsUsed: p.sessionsCompleted,
      sessionsPurchased: p.sessionsPurchased,
      status: p.status,
      total: round(p.netAmount),
      paid: round(Math.min(p.amountPaid, p.netAmount)),
      due: round(p.dueAmount),
    }))

    // Session-wise: sessions charged on their own (TherapySession.fee), via
    // the invoice raised for each one.
    const invoiceById = new Map(invoices.map((inv) => [inv.id, inv]))
    const sessionInvoiceIds = new Set<string>()
    const sessionRows = sessions
      .filter((s) => s.invoiceId && (s.fee ?? 0) > 0)
      .map((s) => {
        const inv = invoiceById.get(s.invoiceId as string)
        sessionInvoiceIds.add(s.invoiceId as string)
        if (!inv || inv.status === 'cancelled') return null
        const total = inv.totalAmount || s.fee || 0
        const paid = Math.min(inv.amountPaid || 0, total)
        return {
          id: s.id,
          invoiceId: inv.id,
          invoiceNo: inv.invoiceNo,
          date: s.date,
          therapyType: s.therapyType,
          therapistName: s.therapistName,
          sessionStatus: s.status,
          total: round(total),
          paid: round(paid),
          due: round(Math.max(0, total - paid)),
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    // Everything else that was billed: not a per-session charge and not a
    // package line (package money is already counted per package above).
    const otherRows = invoices
      .filter((inv) => inv.status !== 'cancelled'
        && !sessionInvoiceIds.has(inv.id)
        && !inv.invoiceItems.some((it) => it.type === 'package'))
      .map((inv) => {
        const total = inv.totalAmount || 0
        const paid = Math.min(inv.amountPaid || 0, total)
        return {
          id: inv.id,
          invoiceNo: inv.invoiceNo,
          date: inv.date,
          notes: inv.notes,
          total: round(total),
          paid: round(paid),
          due: round(Math.max(0, total - paid)),
        }
      })

    const billingBreakdown = {
      packages: { ...sumUp(packageRows), items: packageRows },
      sessions: { ...sumUp(sessionRows), items: sessionRows },
      other: { ...sumUp(otherRows), items: otherRows },
    }

    return NextResponse.json({
      billingBreakdown,
      patient,
      packages: packagesWithBilling,
      appointments,
      sessions,
      assessments,
      payments,
      invoices,
      summary: {
        totalPackageAmount,
        totalDiscount,
        totalSessionsCompleted,
        totalSessionsPurchased,
        sessionsRemaining: totalSessionsPurchased - totalSessionsCompleted,
        totalAmountPaid,
        pendingAmount,
        nextAppointment,
        lastAppointment,
      },
    })
  } catch (error) {
    // A signed-out request is not a server failure — answer 401 like every
    // other route instead of logging it as an error.
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Patient profile error:', error)
    return NextResponse.json({ error: 'Failed to load patient profile' }, { status: 500 })
  }
}
