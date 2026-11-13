'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  CalendarCheck,
  BookOpen,
  FileBarChart,
  CreditCard,
  Package,
  Clock,
  AlertCircle,
  CheckCircle2,
  FileText,
  IndianRupee,
  ArrowRight,
  Baby,
  Activity,
  Stethoscope,
  AlertTriangle,
  Home,
} from 'lucide-react'
import { format } from 'date-fns'
import { useAppStore } from '@/store/app-store'
import { authFetch } from '@/lib/api-client'
import { SessionReviewDialog, StarRating, type ReviewableAppointment } from './SessionReviewDialog'
import { RescheduleRequestDialog, type ReschedulableAppointment, type RescheduleRequestInfo } from './RescheduleRequestDialog'

interface PatientData {
  id: string
  patientId: string
  childName: string
  gender: string
  dateOfBirth: string
  diagnosis?: string
  status: string
}

interface AppointmentData {
  id: string
  date: string
  startTime: string
  endTime: string
  status: string
  title: string
  type?: string
  parentRating?: number | null
  parentReview?: string | null
  // Latest parent reschedule request only (API sends at most one).
  rescheduleRequests?: RescheduleRequestInfo[]
}

interface SessionData {
  id: string
  date: string
  therapistName?: string
  therapyType?: string
  status: string
  subjective?: string
  objective?: string
  assessment?: string
  plan?: string
  notes?: string
}

interface AssessmentData {
  id: string
  type: string
  scheduledDate: string
  completedDate?: string
  status: string
  therapistName?: string
  findings?: string
  recommendations?: string
}

interface PaymentData {
  id: string
  paymentNo: string
  amount: number
  paymentMode: string
  date: string
  type: string
  status: string
  invoiceNo?: string
  invoiceId?: string
  source?: 'payment' | 'invoice'
}

interface PackageData {
  id: string
  netAmount: number
  sessionsPurchased: number
  sessionsCompleted: number
  startDate: string
  endDate: string
  status: string
  name?: string | null
  therapyType?: string | null
  package: { name: string; therapyType: string }
}

// Map currentPage from store to the active tab
function pageToTab(page: string): string {
  if (page === 'parent-appointments') return 'appointments'
  if (page === 'parent-sessions') return 'sessions'
  if (page === 'parent-assessments') return 'assessments'
  if (page === 'parent-payments') return 'payments'
  return 'dashboard' // parent-dashboard
}

export function ParentPortal() {
  const { user, currentPage, navigate } = useAppStore()
  // Local tab state that initializes from currentPage and syncs when currentPage changes
  const [localTab, setLocalTab] = useState(() => pageToTab(currentPage))

  // Sync local tab when currentPage changes (from sidebar navigation)
  useEffect(() => {
    setLocalTab(pageToTab(currentPage))
  }, [currentPage])
  const [patientData, setPatientData] = useState<PatientData | null>(null)
  const [appointments, setAppointments] = useState<AppointmentData[]>([])
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [assessments, setAssessments] = useState<AssessmentData[]>([])
  const [payments, setPayments] = useState<PaymentData[]>([])
  const [packages, setPackages] = useState<PackageData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviewTarget, setReviewTarget] = useState<ReviewableAppointment | null>(null)
  const [rescheduleTarget, setRescheduleTarget] = useState<ReschedulableAppointment | null>(null)

  const fetchData = useCallback(async () => {
    if (!user?.patientId) {
      setError('No child patient linked to your account. Please contact the administrator.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      // Fetch the SPECIFIC patient linked to this parent via user.patientId
      const profileRes = await authFetch(`/api/patients/${user.patientId}`)
      if (!profileRes.ok) {
        throw new Error('Failed to load child data')
      }
      const profile = await profileRes.json()

      setPatientData(profile.patient)
      setAppointments(profile.appointments || [])
      setSessions(profile.sessions || [])
      setAssessments(profile.assessments || [])
      setPackages(profile.packages || [])
      setSummaryData(profile.summary || null)

      // Build a UNIFIED payment history from BOTH Payment records and Invoice
      // payments. The Payments module was removed from the staff sidebar, so
      // invoices are now the primary billing mechanism — but legacy Payment
      // records (and package-scoped payments) still exist. Showing only one
      // source would hide real money the parent paid. (unifiedPayments fix)
      const rawPayments: PaymentData[] = (profile.payments || []).map((p: PaymentData) => ({
        ...p,
        source: 'payment' as const,
      }))
      const invoicePayments: PaymentData[] = (profile.invoices || [])
        .filter((inv: { status?: string; amountPaid?: number }) => inv.status !== 'cancelled' && (inv.amountPaid || 0) > 0)
        .map((inv: { id: string; invoiceNo: string; amountPaid: number; paymentMode?: string; date: string; type?: string; status?: string }) => ({
          id: `inv-${inv.id}`,
          paymentNo: inv.invoiceNo,
          amount: inv.amountPaid,
          paymentMode: inv.paymentMode || 'invoice',
          date: inv.date,
          type: inv.type || 'invoice',
          status: 'completed',
          invoiceNo: inv.invoiceNo,
          source: 'invoice' as const,
        }))
      // Merge + sort by date desc. De-duplicate: if a Payment record already
      // references an invoiceId, skip the synthetic invoice row to avoid
      // double-counting (the Payment record IS the invoice's payment).
      const invoiceIdsWithPaymentRow = new Set(
        (profile.payments || []).map((p: { invoiceId?: string }) => p.invoiceId).filter(Boolean) as string[]
      )
      const dedupedInvoices = invoicePayments.filter((ip) => {
        const invId = ip.id.replace('inv-', '')
        return !invoiceIdsWithPaymentRow.has(invId)
      })
      const unified = [...rawPayments, ...dedupedInvoices].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      setPayments(unified)
    } catch (err) {
      console.error('Failed to fetch parent data:', err)
      setError('Failed to load your child\'s data. Please try again later.')
    } finally {
      setLoading(false)
    }
  }, [user?.patientId])

  useEffect(() => {
    if (user?.role === 'parent') {
      fetchData()
    }
  }, [user, fetchData])

  const calculateAge = (dob: string) => {
    const birthDate = new Date(dob)
    const now = new Date()
    let years = now.getFullYear() - birthDate.getFullYear()
    let months = now.getMonth() - birthDate.getMonth()
    if (months < 0) { years--; months += 12 }
    return `${years}y ${months}m`
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
  }

  const statusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: 'bg-blue-100 text-blue-800',
      confirmed: 'bg-teal-100 text-teal-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      pending: 'bg-yellow-100 text-yellow-800',
      paid: 'bg-green-100 text-green-800',
      active: 'bg-teal-100 text-teal-800',
      expired: 'bg-gray-100 text-gray-800',
      in_progress: 'bg-orange-100 text-orange-800',
      partially_paid: 'bg-orange-100 text-orange-800',
      overdue: 'bg-red-100 text-red-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  // `appointments` comes from /api/patients/[id] sorted `date: desc`
  // (furthest-future first, mixing past + future). Filtering that directly
  // and taking the first 3 would show the 3 FURTHEST-future appointments
  // (and could include stale past ones still marked "scheduled") instead of
  // the soonest upcoming ones — so filter to today-or-later, then reverse to
  // ascending (soonest first) before slicing.
  const upcomingAppointments = useMemo(() => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    return appointments
      .filter(a => (a.status === 'scheduled' || a.status === 'confirmed') && new Date(a.date) >= todayStart)
      .slice()
      .reverse()
      .slice(0, 3)
  }, [appointments])
  // Appointments tab: upcoming first (soonest at the top, so the one a parent
  // may want to reschedule is visible), then past ones newest first. The raw
  // list is date-desc, which put the FURTHEST-future sessions on top and
  // pushed a near appointment past the visible slice.
  const appointmentList = useMemo(() => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const upcoming = appointments.filter((a) => new Date(a.date) >= todayStart).slice().reverse()
    const past = appointments.filter((a) => new Date(a.date) < todayStart)
    return [...upcoming, ...past]
  }, [appointments])
  const completedSessions = useMemo(() =>
    sessions.filter(s => s.status === 'completed'),
    [sessions]
  )
  const totalSessionsPurchased = useMemo(() =>
    packages.reduce((sum, p) => sum + p.sessionsPurchased, 0),
    [packages]
  )
  const totalSessionsCompleted = useMemo(() =>
    packages.reduce((sum, p) => sum + p.sessionsCompleted, 0),
    [packages]
  )
  // Use the API-computed summary.totalAmountPaid (which includes BOTH invoice
  // amountPaid AND payment records) so the parent dashboard matches the Super
  // Admin Patient History. Falls back to local payment sum if summary is missing.
  const [summaryData, setSummaryData] = useState<{ totalAmountPaid?: number; pendingAmount?: number; totalPackageAmount?: number } | null>(null)
  const totalAmountPaid = useMemo(() =>
    summaryData?.totalAmountPaid ?? payments.reduce((sum, p) => sum + p.amount, 0),
    [summaryData, payments]
  )
  const nextAppointment = upcomingAppointments[0]

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
          <AlertTriangle className="h-8 w-8 text-amber-600" />
        </div>
        <h2 className="text-xl font-bold">Unable to Load Portal</h2>
        <p className="text-sm text-muted-foreground max-w-md text-center">{error}</p>
        <Button variant="outline" onClick={fetchData}>Try Again</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SessionReviewDialog
        appointment={reviewTarget}
        onClose={() => setReviewTarget(null)}
        onSaved={(saved) => {
          setAppointments((prev) => prev.map((a) => (a.id === saved.id
            ? { ...a, parentRating: saved.parentRating, parentReview: saved.parentReview }
            : a)))
          setReviewTarget(null)
        }}
      />
      <RescheduleRequestDialog
        appointment={rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        onSubmitted={(appointmentId, req) => {
          setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? { ...a, rescheduleRequests: [req] } : a)))
          setRescheduleTarget(null)
        }}
      />
      {/* Premium Healthcare Banner (PARENT-PORTAL-PREMIUM-REDESIGN) */}
      {patientData && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 via-emerald-600 to-cyan-700 text-white shadow-lg">
          {/* Decorative blurred circles */}
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="relative p-5 md:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Avatar className="h-16 w-16 border-2 border-white/40 shadow-md">
              <AvatarFallback className="bg-white/20 text-white text-xl font-bold backdrop-blur">
                {patientData.childName.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-bold tracking-tight">{patientData.childName}</h2>
                <span className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold backdrop-blur">{patientData.status}</span>
                <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium border border-white/20">{patientData.patientId}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-white/90">
                <span className="inline-flex items-center gap-1"><Baby className="h-3.5 w-3.5" /> {patientData.gender}</span>
                <span>{calculateAge(patientData.dateOfBirth)}</span>
              </div>
              <p className="text-xs text-white/80 mt-1.5 flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
                Welcome back, {user?.name?.split(' ')[0] || 'Parent'} — here is your child's latest progress.
              </p>
            </div>
            <div className="hidden sm:flex flex-col items-end gap-1 text-xs text-white/90">
              <span className="inline-flex items-center gap-1"><Baby className="h-4 w-4" /> Parent Portal</span>
              <span className="text-white/70">Child Development Center</span>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Next Appointment</p>
                <p className="text-sm font-bold mt-1">
                  {nextAppointment ? format(new Date(nextAppointment.date), 'dd MMM, hh:mm a') : 'No upcoming'}
                </p>
                {nextAppointment && (
                  <p className="text-xs text-muted-foreground mt-0.5">{nextAppointment.title}</p>
                )}
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
                <CalendarCheck className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Package Progress</p>
                <p className="text-sm font-bold mt-1">
                  {totalSessionsCompleted} / {totalSessionsPurchased}
                </p>
                <Progress value={totalSessionsPurchased ? (totalSessionsCompleted / totalSessionsPurchased) * 100 : 0} className="h-1.5 mt-2" />
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100">
                <Activity className="h-5 w-5 text-teal-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Assessments</p>
                <p className="text-sm font-bold mt-1">{assessments.length} Total</p>
                <p className="text-xs text-muted-foreground mt-0.5">{assessments.filter(a => a.status === 'completed').length} Completed</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100">
                <FileBarChart className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total Paid</p>
                <p className="text-sm font-bold mt-1">{formatCurrency(totalAmountPaid)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{payments.length} Payments</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100">
                <CreditCard className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Billing summary — Total Invoice Amount + Pending Balance */}
      <div className="grid gap-4 grid-cols-2">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total Invoice Amount</p>
                <p className="text-sm font-bold mt-1">{formatCurrency(summaryData?.totalPackageAmount || 0)}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
                <FileText className="h-5 w-5 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Pending Balance</p>
                <p className={`text-sm font-bold mt-1 ${(summaryData?.pendingAmount || 0) > 0 ? 'text-orange-600' : ''}`}>
                  {formatCurrency(summaryData?.pendingAmount || 0)}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100">
                <AlertCircle className="h-5 w-5 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Content - synced with sidebar navigation */}
      <Tabs value={localTab} onValueChange={(tab) => {
        // Update local tab immediately for responsive UI
        setLocalTab(tab)
        // Also update the store's currentPage for header/sidebar sync
        const tabPageMap: Record<string, string> = {
          dashboard: 'parent-dashboard',
          appointments: 'parent-appointments',
          sessions: 'parent-sessions',
          assessments: 'parent-assessments',
          payments: 'parent-payments',
        }
        const targetPage = tabPageMap[tab]
        if (targetPage) navigate(targetPage as any)
      }} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 h-auto">
          <TabsTrigger value="dashboard" className="text-xs sm:text-sm py-2">
            <Home className="h-4 w-4 mr-1.5 hidden sm:inline" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="appointments" className="text-xs sm:text-sm py-2">
            <CalendarCheck className="h-4 w-4 mr-1.5 hidden sm:inline" />
            Appointments
          </TabsTrigger>
          <TabsTrigger value="sessions" className="text-xs sm:text-sm py-2">
            <BookOpen className="h-4 w-4 mr-1.5 hidden sm:inline" />
            Therapy Notes
          </TabsTrigger>
          <TabsTrigger value="assessments" className="text-xs sm:text-sm py-2">
            <FileBarChart className="h-4 w-4 mr-1.5 hidden sm:inline" />
            Assessments
          </TabsTrigger>
          <TabsTrigger value="payments" className="text-xs sm:text-sm py-2">
            <CreditCard className="h-4 w-4 mr-1.5 hidden sm:inline" />
            Payments
          </TabsTrigger>
        </TabsList>

        {/* Dashboard/Overview Tab */}
        <TabsContent value="dashboard">
          <div className="space-y-4">
            {/* Upcoming Appointments Summary */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Upcoming Appointments</CardTitle>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate('parent-appointments' as any)}>
                    View All <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {upcomingAppointments.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <CalendarCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No upcoming appointments</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {upcomingAppointments.map((apt) => (
                      <div key={apt.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                          <CalendarCheck className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{apt.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(apt.date), 'dd MMM yyyy')} · {apt.startTime} - {apt.endTime}
                          </p>
                        </div>
                        <Badge className={statusColor(apt.status)}>{apt.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Sessions Summary */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Recent Therapy Sessions</CardTitle>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate('parent-sessions' as any)}>
                    View All <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {completedSessions.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No therapy notes available yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {completedSessions.slice(0, 3).map((session) => (
                      <div key={session.id} className="flex items-center gap-3 p-3 rounded-lg border">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 shrink-0">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{session.therapyType || 'Therapy Session'}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(session.date), 'dd MMM yyyy')} · {session.therapistName || 'Therapist'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Package Progress */}
            {packages.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Package Progress</CardTitle>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate('parent-payments' as any)}>
                      View All <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {packages.slice(0, 2).map((pkg) => (
                      <div key={pkg.id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="text-sm font-medium">{pkg.name ?? pkg.package.name}</p>
                            <p className="text-xs text-muted-foreground">{pkg.therapyType ?? pkg.package.therapyType}</p>
                          </div>
                          <Badge className={statusColor(pkg.status)}>{pkg.status}</Badge>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <Progress
                              value={pkg.sessionsPurchased ? (pkg.sessionsCompleted / pkg.sessionsPurchased) * 100 : 0}
                              className="h-2"
                            />
                          </div>
                          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                            {pkg.sessionsCompleted}/{pkg.sessionsPurchased} sessions
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Appointments Tab */}
        <TabsContent value="appointments">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upcoming & Past Appointments</CardTitle>
            </CardHeader>
            <CardContent>
              {appointments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CalendarCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No appointments found</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {appointmentList.slice(0, 30).map((apt) => {
                    const todayStart = new Date()
                    todayStart.setHours(0, 0, 0, 0)
                    const isUpcoming = (apt.status === 'scheduled' || apt.status === 'confirmed') && new Date(apt.date) >= todayStart
                    const lastRequest = apt.rescheduleRequests?.[0]
                    const requestPending = lastRequest?.status === 'pending'
                    return (
                    <div key={apt.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                        <CalendarCheck className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{apt.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(apt.date), 'dd MMM yyyy')} · {apt.startTime} - {apt.endTime}
                        </p>
                        {apt.parentRating ? (
                          <button
                            type="button"
                            onClick={() => setReviewTarget(apt)}
                            className="mt-1 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                            title="Edit your review"
                          >
                            <StarRating value={apt.parentRating} className="h-3.5 w-3.5" />
                            {apt.parentReview && <span className="truncate max-w-[220px]">{apt.parentReview}</span>}
                          </button>
                        ) : null}
                        {isUpcoming && requestPending && (
                          <p className="mt-1 text-xs text-amber-700">Reschedule requested — waiting for the clinic to confirm</p>
                        )}
                        {isUpcoming && lastRequest?.status === 'declined' && (
                          <p className="mt-1 text-xs text-red-600">
                            Reschedule request declined{lastRequest.responseNote ? `: ${lastRequest.responseNote}` : ''}
                          </p>
                        )}
                      </div>
                      {isUpcoming && !requestPending && (
                        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => setRescheduleTarget(apt)}>
                          Reschedule
                        </Button>
                      )}
                      {apt.status === 'completed' && !apt.parentRating && (
                        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => setReviewTarget(apt)}>
                          Rate session
                        </Button>
                      )}
                      <Badge className={statusColor(apt.status)}>{apt.status}</Badge>
                    </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sessions/Therapy Notes Tab */}
        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Therapy Session Notes</CardTitle>
              <CardDescription>View your child&apos;s therapy progress notes from each session</CardDescription>
            </CardHeader>
            <CardContent>
              {completedSessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No therapy notes available yet</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[500px] overflow-y-auto">
                  {completedSessions.slice(0, 8).map((session) => (
                    <div key={session.id} className="rounded-lg border bg-card overflow-hidden">
                      <div className="flex items-center gap-3 p-3 bg-muted/30 border-b">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                          <Stethoscope className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {session.therapyType || 'Therapy Session'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(session.date), 'dd MMM yyyy')} · {session.therapistName || 'Therapist'}
                          </p>
                        </div>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      </div>
                      <div className="p-3 space-y-2.5">
                        {session.subjective && (
                          <div>
                            <p className="text-xs font-semibold text-primary mb-0.5">Subjective</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">{session.subjective}</p>
                          </div>
                        )}
                        {session.objective && (
                          <div>
                            <p className="text-xs font-semibold text-primary mb-0.5">Objective</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">{session.objective}</p>
                          </div>
                        )}
                        {session.assessment && (
                          <div>
                            <p className="text-xs font-semibold text-primary mb-0.5">Assessment</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">{session.assessment}</p>
                          </div>
                        )}
                        {session.plan && (
                          <div>
                            <p className="text-xs font-semibold text-primary mb-0.5">Plan</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">{session.plan}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Assessments Tab */}
        <TabsContent value="assessments">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assessment Reports</CardTitle>
              <CardDescription>View completed assessments and reports for your child</CardDescription>
            </CardHeader>
            <CardContent>
              {assessments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileBarChart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No assessments found</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {assessments.map((assessment) => (
                    <div key={assessment.id} className="rounded-lg border p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary" />
                          <p className="text-sm font-medium capitalize">{assessment.type.replace(/_/g, ' ')} Assessment</p>
                        </div>
                        <Badge className={statusColor(assessment.status)}>{assessment.status}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <p>Scheduled: {format(new Date(assessment.scheduledDate), 'dd MMM yyyy')}</p>
                        <p>Therapist: {assessment.therapistName || 'N/A'}</p>
                      </div>
                      {assessment.findings && (
                        <>
                          <Separator className="my-2" />
                          <div>
                            <p className="text-xs font-semibold text-primary mb-1">Findings</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">{assessment.findings}</p>
                          </div>
                        </>
                      )}
                      {assessment.recommendations && (
                        <div className="mt-2">
                          <p className="text-xs font-semibold text-primary mb-1">Recommendations</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">{assessment.recommendations}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments">
          <div className="space-y-4">
            {/* Package Summary */}
            {packages.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Active Packages
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {packages.map((pkg) => (
                      <div key={pkg.id} className="rounded-lg border p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="text-sm font-medium">{pkg.name ?? pkg.package.name}</p>
                            <p className="text-xs text-muted-foreground">{pkg.therapyType ?? pkg.package.therapyType}</p>
                          </div>
                          <Badge className={statusColor(pkg.status)}>{pkg.status}</Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="rounded bg-muted/50 p-2">
                            <p className="text-lg font-bold">{pkg.sessionsPurchased}</p>
                            <p className="text-[10px] text-muted-foreground">Purchased</p>
                          </div>
                          <div className="rounded bg-green-50 dark:bg-green-950 p-2">
                            <p className="text-lg font-bold text-green-600">{pkg.sessionsCompleted}</p>
                            <p className="text-[10px] text-muted-foreground">Completed</p>
                          </div>
                          <div className="rounded bg-orange-50 dark:bg-orange-950 p-2">
                            <p className="text-lg font-bold text-orange-600">{pkg.sessionsPurchased - pkg.sessionsCompleted}</p>
                            <p className="text-[10px] text-muted-foreground">Remaining</p>
                          </div>
                        </div>
                        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                          <span>Amount: {formatCurrency(pkg.netAmount)}</span>
                          <span>Valid: {format(new Date(pkg.startDate), 'dd MMM')} - {format(new Date(pkg.endDate), 'dd MMM yyyy')}</span>
                        </div>
                        <Progress
                          value={pkg.sessionsPurchased ? (pkg.sessionsCompleted / pkg.sessionsPurchased) * 100 : 0}
                          className="h-2 mt-2"
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Payment History */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payment History</CardTitle>
              </CardHeader>
              <CardContent>
                {payments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No payment records found</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {payments.map((payment) => (
                      <div key={payment.id} className="flex items-center gap-3 p-3 rounded-lg border">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 shrink-0">
                          <IndianRupee className="h-4 w-4 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{formatCurrency(payment.amount)}</p>
                          <p className="text-xs text-muted-foreground">
                            {payment.paymentNo} · {format(new Date(payment.date), 'dd MMM yyyy')} · {payment.paymentMode}
                          </p>
                        </div>
                        <Badge className={statusColor(payment.status)}>{payment.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
