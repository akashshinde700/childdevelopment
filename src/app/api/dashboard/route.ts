import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { istStartOfToday, istStartOfMonth, istStartOfYear, istDaysAgo, istStartOfDateString, istEndOfDateString, toIST } from '@/lib/timezone'
import { syncAllPatientStatuses } from '@/lib/patient-status'
import { reconcileAllPackageUsage } from '@/lib/package-usage'
import { getCached, setCached } from '@/lib/cache'

/** "yyyy-MM-dd" for the given moment, in IST. */
function istDateString(d: Date = new Date()): string {
  const ist = toIST(d)
  const yyyy = ist.getUTCFullYear()
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(ist.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Types generic enough that a per-appointment "therapy" label isn't
// meaningful on its own — falls back to the appointment's plain `type`.
const GENERIC_THERAPY_TYPES = new Set(['therapy', 'consultation', ''])

// Dashboard aggregates run a couple dozen queries every load — cache the
// computed response for a short window per viewer (role + therapist name,
// the only two things this route's data is scoped by) so repeated visits
// within the window are instant instead of re-running every query. 30s is
// short enough that nobody notices the staleness, but long enough to absorb
// the common "switch tabs and come back" / "refresh" pattern.
const DASHBOARD_CACHE_TTL_MS = 30_000

// GET /api/dashboard
export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role === 'parent') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // ── Selected-period filter (Dashboard date picker) ──
    // ?date=yyyy-MM-dd for a single day, or ?from=&to= for a range. Neither
    // given -> today. This only drives the new `period` block below; every
    // other field (today/weekly/monthly/yearly) keeps its original always-
    // "right now" meaning so the PDF export and existing widgets are
    // unaffected by whatever date the user has selected.
    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')
    const periodMode: 'single' | 'range' = fromParam && toParam ? 'range' : 'single'
    const todayDateStr = istDateString()
    const periodFrom = periodMode === 'range' ? fromParam! : (dateParam || todayDateStr)
    const periodTo = periodMode === 'range' ? toParam! : periodFrom
    const isTodaySingle = periodMode === 'single' && periodFrom === todayDateStr

    const cacheKey = `dashboard:${user.role}:${user.role.startsWith('therapist') ? user.name : ''}:${periodMode}:${periodFrom}:${periodTo}`
    const cached = getCached<Record<string, unknown>>(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    // All "today" / "this month" / "this year" bounds are computed in IST
    // (UTC+5:30) so dashboard KPIs match the clinic's wall clock regardless
    // of the server's timezone. The returned Date objects are UTC moments
    // that Prisma can query directly.
    const today = istStartOfToday()
    const startOfMonth = istStartOfMonth()
    const startOfYear = istStartOfYear()
    const weekAgo = istDaysAgo(7)

    // Selected-period bounds + the immediately preceding period of the same
    // length (for the comparison card — e.g. a 7-day range compares against
    // the 7 days before it, a single day compares against the day before).
    const periodStart = istStartOfDateString(periodFrom)
    const periodEnd = istEndOfDateString(periodTo)
    const periodDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000) + 1
    const prevPeriodEnd = new Date(periodStart.getTime() - 1)
    const prevPeriodStart = new Date(periodStart.getTime() - periodDays * 86_400_000)

    // Self-heal Active/Inactive before counting, so the KPI cards reflect
    // packages that quietly expired since the last visit (no cron needed).
    await reconcileAllPackageUsage()
    await syncAllPatientStatuses()

    const therapistOnly = user.role.startsWith('therapist')
    let assignedPatientIds: string[] = []

    if (therapistOnly) {
      const assignments = await db.appointment.findMany({
        where: { therapistId: user.name, organizationId },
        select: { patientId: true },
      })
      assignedPatientIds = [...new Set(assignments.map((item) => item.patientId))]
    }

    const patientWhere = therapistOnly
      ? { id: { in: assignedPatientIds }, isDeleted: false, organizationId }
      : { isDeleted: false, organizationId }
    const appointmentWhere = therapistOnly
      ? { therapistId: user.name, organizationId }
      : { organizationId }
    const therapySessionWhere = therapistOnly
      ? { therapistName: user.name, organizationId }
      : { organizationId }
    const revenueWhere = therapistOnly
      ? { patientId: { in: assignedPatientIds }, organizationId }
      : { organizationId }
    const invoiceWhere = therapistOnly
      ? { patientId: { in: assignedPatientIds }, organizationId }
      : { organizationId }

    const [
      totalPatients,
      activePatients,
      newPatientsThisMonth,
      todaysAppointments,
      weeklyAppointmentsRaw,
      completedSessionsRaw,
      cancelledAppointmentsRaw,
      totalAppointments,
      monthlyAppointments,
      todayPayments,
      monthPaymentsRaw,
      yearPaymentsRaw,
      pendingPaymentsRaw,
      totalEmployees,
      presentTodayRaw,
      onLeaveTodayRaw,
      monthExpensesRaw,
    ] = await Promise.all([
      therapistOnly
        ? db.patient.count({ where: patientWhere })
        : db.patient.count({ where: patientWhere }),
      therapistOnly
        ? db.patient.count({ where: { ...patientWhere, status: 'active' } })
        : db.patient.count({ where: { ...patientWhere, status: 'active' } }),
      therapistOnly
        ? assignedPatientIds.length > 0
          ? db.patient.count({ where: { ...patientWhere, createdAt: { gte: startOfMonth } } })
          : Promise.resolve(0)
        : db.patient.count({ where: { ...patientWhere, createdAt: { gte: startOfMonth } } }),
      db.appointment.count({ where: { ...appointmentWhere, date: { gte: today, lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) } } }),
      db.appointment.count({ where: { ...appointmentWhere, date: { gte: weekAgo } } }),
      db.therapySession.count({ where: { ...therapySessionWhere, status: 'completed', date: { gte: startOfMonth } } }),
      db.appointment.count({ where: { ...appointmentWhere, status: { in: ['cancelled', 'no_show'] }, date: { gte: startOfMonth } } }),
      db.appointment.count({ where: appointmentWhere }),
      db.appointment.count({ where: { ...appointmentWhere, date: { gte: startOfMonth } } }),
      db.payment.aggregate({ where: { ...revenueWhere, date: { gte: today, lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) } }, _sum: { amount: true } }),
      db.payment.aggregate({ where: { ...revenueWhere, date: { gte: startOfMonth } }, _sum: { amount: true } }),
      db.payment.aggregate({ where: { ...revenueWhere, date: { gte: startOfYear } }, _sum: { amount: true } }),
      db.invoice.aggregate({ where: { ...invoiceWhere, status: { in: ['pending', 'partially_paid'] } }, _sum: { balanceDue: true } }),
      db.employee.count({ where: { status: 'active', organizationId } }),
      db.attendance.count({ where: { date: today, status: 'present', organizationId } }),
      db.attendance.count({ where: { date: today, status: { in: ['leave', 'absent'] }, organizationId } }),
      db.expense.aggregate({ where: { date: { gte: startOfMonth }, organizationId }, _sum: { totalAmount: true } }),
    ])

    const weeklyPayments = await db.payment.aggregate({
      where: { ...revenueWhere, date: { gte: weekAgo } },
      _sum: { amount: true },
    })

    const recentPatients = await db.patient.findMany({
      where: patientWhere,
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    const upcomingAppointments = await db.appointment.findMany({
      where: {
        ...appointmentWhere,
        date: { gte: today },
        status: { in: ['scheduled', 'confirmed'] },
      },
      include: { patient: true },
      orderBy: { date: 'asc' },
      take: 5,
    })

    // Recently completed therapy sessions — used by the dashboard to compute
    // per-therapist utilization (replaces the previous random mock values).
    const recentCompletedSessions = await db.therapySession.findMany({
      where: { ...therapySessionWhere, status: 'completed', date: { gte: startOfMonth } },
      select: { id: true, therapistName: true, therapyType: true, date: true },
      orderBy: { date: 'desc' },
      take: 100,
    })

    const monthRevenue = monthPaymentsRaw._sum.amount || 0
    const monthExpenses = monthExpensesRaw._sum.totalAmount || 0

    // ── Selected-period panel (Dashboard date picker) ──
    // Everything above keeps its original "right now" meaning; this block is
    // the only thing that moves with the date/range the user picks.
    const [
      periodAppointments,
      prevPeriodAppointments,
      periodSessions,
      prevPeriodSessions,
      periodRevenueRaw,
      prevPeriodRevenueRaw,
      periodCompletedSessions,
      periodSchedule,
      therapyGroups,
    ] = await Promise.all([
      db.appointment.count({ where: { ...appointmentWhere, date: { gte: periodStart, lte: periodEnd } } }),
      db.appointment.count({ where: { ...appointmentWhere, date: { gte: prevPeriodStart, lte: prevPeriodEnd } } }),
      db.therapySession.count({ where: { ...therapySessionWhere, status: 'completed', date: { gte: periodStart, lte: periodEnd } } }),
      db.therapySession.count({ where: { ...therapySessionWhere, status: 'completed', date: { gte: prevPeriodStart, lte: prevPeriodEnd } } }),
      db.payment.aggregate({ where: { ...revenueWhere, date: { gte: periodStart, lte: periodEnd } }, _sum: { amount: true } }),
      db.payment.aggregate({ where: { ...revenueWhere, date: { gte: prevPeriodStart, lte: prevPeriodEnd } }, _sum: { amount: true } }),
      db.therapySession.findMany({
        where: { ...therapySessionWhere, status: 'completed', date: { gte: periodStart, lte: periodEnd } },
        select: { id: true, therapistName: true, therapyType: true, date: true },
        orderBy: { date: 'desc' },
        take: 200,
      }),
      db.appointment.findMany({
        where: { ...appointmentWhere, date: { gte: periodStart, lte: periodEnd } },
        include: { patient: true },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        take: 30,
      }),
      db.appointment.groupBy({
        by: ['therapyType', 'type'],
        where: { ...appointmentWhere, date: { gte: periodStart, lte: periodEnd } },
        _count: { _all: true },
      }),
    ])

    // Merge groupBy rows into one label -> count map. therapyType (free text,
    // e.g. "Speech Therapy") wins when it's set and isn't one of the generic
    // placeholder values; otherwise fall back to the appointment's plain type.
    const therapyBreakdownMap = new Map<string, number>()
    for (const g of therapyGroups) {
      const raw = (g.therapyType || '').trim()
      const label = raw && !GENERIC_THERAPY_TYPES.has(raw.toLowerCase()) ? raw : (g.type || 'Other')
      therapyBreakdownMap.set(label, (therapyBreakdownMap.get(label) || 0) + g._count._all)
    }
    const therapyBreakdown = Array.from(therapyBreakdownMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)

    const payload = {
      patients: {
        total: totalPatients,
        active: activePatients,
        newThisMonth: newPatientsThisMonth,
      },
      appointments: {
        today: todaysAppointments,
        weekly: weeklyAppointmentsRaw,
        completedThisMonth: completedSessionsRaw,
        cancelledThisMonth: cancelledAppointmentsRaw,
        total: totalAppointments,
        monthly: monthlyAppointments,
      },
      revenue: {
        today: todayPayments._sum.amount || 0,
        weekly: weeklyPayments._sum.amount || 0,
        monthly: monthRevenue,
        yearly: yearPaymentsRaw._sum.amount || 0,
      },
      payments: {
        pending: pendingPaymentsRaw._sum.balanceDue || 0,
      },
      hr: {
        total: totalEmployees,
        presentToday: presentTodayRaw,
        onLeaveToday: onLeaveTodayRaw,
      },
      expenses: {
        monthly: monthExpenses,
        netProfit: monthRevenue - monthExpenses,
      },
      recentPatients,
      upcomingAppointments,
      period: {
        mode: periodMode,
        from: periodFrom,
        to: periodTo,
        isToday: isTodaySingle,
        appointments: periodAppointments,
        sessions: periodSessions,
        revenue: periodRevenueRaw._sum.amount || 0,
        previous: {
          appointments: prevPeriodAppointments,
          sessions: prevPeriodSessions,
          revenue: prevPeriodRevenueRaw._sum.amount || 0,
        },
        therapyBreakdown,
        schedule: periodSchedule,
        completedSessions: periodCompletedSessions,
      },
    }

    setCached(cacheKey, payload, DASHBOARD_CACHE_TTL_MS)
    return NextResponse.json(payload)
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Dashboard error:', error)
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 })
  }
}
