import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { requireFeature } from '@/lib/subscription-limits'

// Constants per spec
const ASSESSMENT_FEE = 2000
const CONSULTATION_FEE = 1000

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface ProjectionRow {
  id: string
  childName: string
  patientId?: string
  package: string
  amount: number
  projectedAmount: number
  receivedAmount: number
  balanceAmount: number
  date: string
}

interface LeadRow {
  id: string
  childName: string
  parentName: string
  contactNumber: string
  address: string
  remark: string
  date: string
}

interface MonthlySummaryRow {
  category: string
  projected: number
  received: number
  pending: number
}

interface PendingPayment {
  childName: string
  category: string
  pendingAmount: number
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId

    // RBAC: only super_admin and admin can access projection report
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Plan gate (SaaS): financial projection is an advanced-analytics
    // feature — enforced at the API, not just hidden in the nav.
    const featureGate = await requireFeature(user.organizationId ?? null, 'advancedReports')
    if (featureGate) return featureGate

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const month = parseInt(searchParams.get('month') || String(now.getUTCMonth() + 1))
    const year = parseInt(searchParams.get('year') || String(now.getUTCFullYear()))

    // Branch scoping
    // - super_admin: optional branchId query param; blank = all branches
    // - admin: forced to own branch
    let branchId = searchParams.get('branchId') || ''
    if (user.role === 'admin') {
      branchId = user.branchId || ''
    }

    // Compute UTC month range (start = YYYY-MM-01T00:00:00.000Z, end = last day T23:59:59.999Z)
    const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const monthEnd = new Date(Date.UTC(year, month - 1, lastDay, 23, 59, 59, 999))

    // Branch filters — direct (Payment, Lead have branchId) vs patient-linked (PatientPackage, Assessment, Appointment)
    const branchFilterDirect = branchId ? { branchId } : {}
    const branchFilterPatient = branchId ? { patient: { branchId } } : {}

    // Fetch center settings + branch info in parallel
    const [centerSettings, branch] = await Promise.all([
      db.centerSettings.findFirst({ where: { organizationId } }),
      branchId
        ? db.branch.findFirst({ where: { id: branchId, organizationId }, select: { name: true } })
        : Promise.resolve(null),
    ])

    const centerName = centerSettings?.centerName || 'Your Clinic Name'
    const branchName = branchId ? branch?.name || 'Unknown Branch' : 'All Branches'

    // Fetch all source data in parallel
    const [enrollmentPackages, renewalPackages, assessments, appointments, leads, payments, invoices] = await Promise.all([
      // Enrollments: PatientPackage where startDate in range
      db.patientPackage.findMany({
        where: {
          startDate: { gte: monthStart, lte: monthEnd },
          organizationId,
          ...branchFilterPatient,
        },
        include: {
          patient: { select: { childName: true, patientId: true, branchId: true } },
          package: { select: { name: true, therapyType: true } },
        },
        orderBy: { startDate: 'asc' },
      }),
      // Renewals: PatientPackage where updatedAt in range — filter sessionsCompleted >= sessionsPurchased in code
      db.patientPackage.findMany({
        where: {
          updatedAt: { gte: monthStart, lte: monthEnd },
          organizationId,
          ...branchFilterPatient,
        },
        include: {
          patient: { select: { childName: true, patientId: true, branchId: true } },
          package: { select: { name: true, therapyType: true } },
        },
        orderBy: { updatedAt: 'asc' },
      }),
      // Assessments where scheduledDate in range
      db.assessment.findMany({
        where: {
          scheduledDate: { gte: monthStart, lte: monthEnd },
          organizationId,
          ...branchFilterPatient,
        },
        include: {
          patient: { select: { childName: true, patientId: true, branchId: true } },
        },
        orderBy: { scheduledDate: 'asc' },
      }),
      // Appointments where date in range AND type='consultation'
      db.appointment.findMany({
        where: {
          date: { gte: monthStart, lte: monthEnd },
          type: 'consultation',
          organizationId,
          ...branchFilterPatient,
        },
        include: {
          patient: { select: { childName: true, patientId: true, branchId: true } },
        },
        orderBy: { date: 'asc' },
      }),
      // Leads where createdAt in range
      db.lead.findMany({
        where: {
          createdAt: { gte: monthStart, lte: monthEnd },
          organizationId,
          ...branchFilterDirect,
        },
        orderBy: { createdAt: 'asc' },
      }),
      // Payments where date in range — used to compute received totals per patient.
      // Excludes rows already linked to an Invoice (invoiceId set) so they aren't
      // double-counted against that invoice's own amountPaid below — invoices are
      // the primary billing mechanism now (Payments module retired from the sidebar).
      db.payment.findMany({
        where: {
          date: { gte: monthStart, lte: monthEnd },
          status: 'completed',
          invoiceId: null,
          organizationId,
          ...branchFilterDirect,
        },
        select: { patientId: true, amount: true },
      }),
      // Invoices where date in range — amountPaid is the primary "received"
      // source now that billing runs through Invoices, not standalone Payments.
      db.invoice.findMany({
        where: {
          date: { gte: monthStart, lte: monthEnd },
          status: { not: 'cancelled' },
          organizationId,
          ...branchFilterDirect,
        },
        select: { patientId: true, amountPaid: true },
      }),
    ])

    // Build received-per-patient map (sum of non-invoice-linked payments PLUS
    // invoice amountPaid for that patient in month) — see comments above.
    const receivedByPatient = new Map<string, number>()
    for (const p of payments) {
      receivedByPatient.set(p.patientId, (receivedByPatient.get(p.patientId) || 0) + p.amount)
    }
    for (const inv of invoices) {
      receivedByPatient.set(inv.patientId, (receivedByPatient.get(inv.patientId) || 0) + inv.amountPaid)
    }
    const totalReceived = payments.reduce((s, p) => s + p.amount, 0) + invoices.reduce((s, inv) => s + inv.amountPaid, 0)
    const getReceived = (patientId: string) => receivedByPatient.get(patientId) || 0

    // Enrollments
    const enrollments: ProjectionRow[] = enrollmentPackages.map((pp) => {
      const projected = pp.netAmount
      const received = getReceived(pp.patientId)
      return {
        id: pp.id,
        childName: pp.patient.childName,
        patientId: pp.patient.patientId,
        package: pp.package?.name || pp.package?.therapyType || 'Package',
        amount: pp.netAmount,
        projectedAmount: projected,
        receivedAmount: received,
        balanceAmount: projected - received,
        date: pp.startDate.toISOString(),
      }
    })

    // Assessments
    const assessmentsRows: ProjectionRow[] = assessments.map((a) => {
      const projected = ASSESSMENT_FEE
      const received = getReceived(a.patientId)
      return {
        id: a.id,
        childName: a.patient.childName,
        patientId: a.patient.patientId,
        package: a.type,
        amount: ASSESSMENT_FEE,
        projectedAmount: projected,
        receivedAmount: received,
        balanceAmount: projected - received,
        date: a.scheduledDate.toISOString(),
      }
    })

    // Consultations
    const consultationsRows: ProjectionRow[] = appointments.map((appt) => {
      const projected = CONSULTATION_FEE
      const received = getReceived(appt.patientId)
      return {
        id: appt.id,
        childName: appt.patient.childName,
        patientId: appt.patient.patientId,
        package: 'Consultation',
        amount: CONSULTATION_FEE,
        projectedAmount: projected,
        receivedAmount: received,
        balanceAmount: projected - received,
        date: appt.date.toISOString(),
      }
    })

    // Renewals — filter sessionsCompleted >= sessionsPurchased (cannot be done in Prisma directly)
    const renewalsRows: ProjectionRow[] = renewalPackages
      .filter((pp) => pp.sessionsCompleted >= pp.sessionsPurchased)
      .map((pp) => {
        const projected = pp.netAmount
        const received = getReceived(pp.patientId)
        return {
          id: pp.id,
          childName: pp.patient.childName,
          patientId: pp.patient.patientId,
          package: `Renewal - ${pp.package?.therapyType || 'Package'}`,
          amount: pp.netAmount,
          projectedAmount: projected,
          receivedAmount: received,
          balanceAmount: projected - received,
          date: pp.updatedAt.toISOString(),
        }
      })

    // Leads
    const leadsRows: LeadRow[] = leads.map((l) => ({
      id: l.id,
      childName: l.childName || '-',
      parentName: l.name,
      contactNumber: l.mobile,
      address: l.concern || '-',
      remark: l.status,
      date: l.createdAt.toISOString(),
    }))

    // Aggregate helpers
    const sumProjected = (rows: ProjectionRow[]) => rows.reduce((s, r) => s + r.projectedAmount, 0)
    const sumReceived = (rows: ProjectionRow[]) => rows.reduce((s, r) => s + r.receivedAmount, 0)

    const summary = {
      totalEnrollments: { count: enrollments.length, amount: sumProjected(enrollments) },
      totalAssessments: { count: assessmentsRows.length, amount: sumProjected(assessmentsRows) },
      totalConsultations: { count: consultationsRows.length, amount: sumProjected(consultationsRows) },
      totalRenewals: { count: renewalsRows.length, amount: sumProjected(renewalsRows) },
      totalLeads: { count: leadsRows.length },
      totalReceived: { amount: totalReceived },
    }

    // Monthly summary — 5 rows (one per category)
    const monthlySummary: MonthlySummaryRow[] = [
      {
        category: 'New Enrollments',
        projected: sumProjected(enrollments),
        received: sumReceived(enrollments),
        pending: sumProjected(enrollments) - sumReceived(enrollments),
      },
      {
        category: 'New Assessments',
        projected: sumProjected(assessmentsRows),
        received: sumReceived(assessmentsRows),
        pending: sumProjected(assessmentsRows) - sumReceived(assessmentsRows),
      },
      {
        category: 'New Consultations',
        projected: sumProjected(consultationsRows),
        received: sumReceived(consultationsRows),
        pending: sumProjected(consultationsRows) - sumReceived(consultationsRows),
      },
      {
        category: 'New Renewals',
        projected: sumProjected(renewalsRows),
        received: sumReceived(renewalsRows),
        pending: sumProjected(renewalsRows) - sumReceived(renewalsRows),
      },
      // Leads have no financial projection
      { category: 'New Leads', projected: 0, received: 0, pending: 0 },
    ]

    const grandTotals = {
      projected: monthlySummary.reduce((s, m) => s + m.projected, 0),
      received: monthlySummary.reduce((s, m) => s + m.received, 0),
      pending: monthlySummary.reduce((s, m) => s + m.pending, 0),
    }

    // Pending payments — flatten the 4 financial categories where balanceAmount > 0
    const pendingPayments: PendingPayment[] = [
      ...enrollments.map((r) => ({ childName: r.childName, category: 'Enrollment', pendingAmount: r.balanceAmount })),
      ...assessmentsRows.map((r) => ({ childName: r.childName, category: 'Assessment', pendingAmount: r.balanceAmount })),
      ...consultationsRows.map((r) => ({ childName: r.childName, category: 'Consultation', pendingAmount: r.balanceAmount })),
      ...renewalsRows.map((r) => ({ childName: r.childName, category: 'Renewal', pendingAmount: r.balanceAmount })),
    ].filter((r) => r.pendingAmount > 0)

    return NextResponse.json({
      centerName,
      branchName,
      month,
      year,
      monthLabel: `${MONTH_NAMES[month - 1]} ${year}`,
      currentDate: new Date().toISOString(),
      preparedBy: user.name,
      summary,
      enrollments,
      assessments: assessmentsRows,
      consultations: consultationsRows,
      renewals: renewalsRows,
      leads: leadsRows,
      monthlySummary,
      grandTotals,
      pendingPayments,
    })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Projection API error:', error)
    return NextResponse.json({ error: 'Failed to fetch projection data' }, { status: 500 })
  }
}
