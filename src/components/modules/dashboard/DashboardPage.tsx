import React, { useState, useEffect, useRef, useCallback } from 'react'
import { format } from 'date-fns'
import {
  Users,
  CalendarDays,
  IndianRupee,
  Activity,
  CreditCard,
  Package,
  Search,
  MessageCircle,
  ChevronRight,
  UserPlus,
  ClipboardList,
  CalendarPlus,
  Wallet,
  BarChart2,
  Clock,
  FileText,
  Loader2,
  UserCog,
  PhoneCall,
  X,
  Download,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppStore, getRoleLabel } from '@/store/app-store'
import { authFetch } from '@/lib/api-client'
import { usePrintSettings } from '@/components/print/PrintSettingsDialog'
import { createLetterheadPDF, letterheadMargins, letterheadDidDrawPage, stampLetterheadOnAllPages, formatCurrencyForPdf } from '@/lib/letterhead-pdf'
import AttendanceCheckCard from '@/components/modules/dashboard/AttendanceCheckCard'
import { DashboardDateFilter, type DashboardPeriod } from '@/components/modules/dashboard/DashboardDateFilter'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
interface DashboardData {
  patients: { total: number; active: number; newThisMonth: number }
  appointments: {
    today: number
    weekly: number
    completedThisMonth: number
    cancelledThisMonth: number
    total?: number
    monthly?: number
  }
  revenue: { today: number; weekly: number; monthly: number; yearly: number }
  payments: { pending: number }
  hr: { total: number; presentToday: number; onLeaveToday: number }
  expenses: { monthly: number; netProfit: number }
  recentPatients: {
    id: string
    patientId: string
    childName: string
    gender: string
    dateOfBirth: string
    mobile: string
    diagnosis: string
    status: string
    createdAt: string
  }[]
  upcomingAppointments: {
    id: string
    date: string
    startTime: string
    endTime: string
    status: string
    title: string
    patient: { childName: string; patientId: string }
  }[]
  // Recently completed therapy sessions (used for therapist utilization %).
  recentCompletedSessions?: {
    id: string
    therapistName?: string | null
    therapyType?: string | null
    date: string
  }[]
  // Selected-period panel (Dashboard date picker) — the only part of this
  // payload that moves with the date/range the user picks. Everything above
  // always means "right now" (today/this month/this year), unaffected by it.
  period: {
    mode: 'single' | 'range'
    from: string
    to: string
    isToday: boolean
    appointments: number
    sessions: number
    revenue: number
    previous: { appointments: number; sessions: number; revenue: number }
    therapyBreakdown: { name: string; value: number }[]
    schedule: {
      id: string
      date: string
      startTime: string
      endTime: string
      title: string
      status: string
      therapistId: string | null
      therapyType: string | null
      patient?: { childName: string; patientId: string }
    }[]
    completedSessions: { id: string; therapistName: string | null; therapyType: string | null; date: string }[]
  }
}

// ─────────────────────────────────────────────
// DATA — all data is fetched from the API; no hardcoded demo data.
// Empty arrays used as defaults so the UI shows empty states.
// ─────────────────────────────────────────────
const therapistColors = ['#22C55E', '#3B82F6', '#A855F7', '#F97316', '#EC4899', '#14B8A6']

const scheduleData: { time: string; therapy: string; therapist: string; status: string; statusColor: string }[] = []

const sessionSummarySparklines = {
  total: [] as number[],
  completed: [] as number[],
  cancelled: [] as number[],
  noShow: [] as number[],
}

const recentPaymentsData: { name: string; therapy: string; date: string; amount: string; status: string; initials: string }[] = []

const expiringPackagesData: { name: string; packageName: string; daysLeft: number; progress: number; initials: string; tagColor: string; progressColor: string }[] = []

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// Mini sparkline SVG
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const w = 80
  const h = 32
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w
      const y = h - ((v - min) / (max - min || 1)) * h
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Avatar circle
function Avatar({ initials, size = 'md' }: { initials: string; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  const colors = ['bg-blue-100 text-blue-700', 'bg-purple-100 text-purple-700', 'bg-green-100 text-green-700', 'bg-orange-100 text-orange-700', 'bg-pink-100 text-pink-700']
  const colorIdx = initials.charCodeAt(0) % colors.length
  return (
    <div className={`${sz} ${colors[colorIdx]} rounded-full flex items-center justify-center font-semibold flex-shrink-0`}>
      {initials}
    </div>
  )
}

// ─────────────────────────────────────────────
// KPI HERO CARD
// ─────────────────────────────────────────────
function KpiCard({
  title,
  value,
  icon: Icon,
  gradient,
  linkLabel,
  onClick,
  delta,
}: {
  title: string
  value: string
  icon: React.ElementType
  gradient: string
  linkLabel: string
  onClick?: () => void
  // Comparison vs the previous equivalent period (e.g. "+20% vs previous day").
  delta?: { text: string; positive: boolean } | null
}) {
  return (
    <div onClick={onClick} className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-md ${gradient} flex flex-col justify-between min-h-[130px] cursor-pointer group transition-transform hover:scale-105 active:scale-95`}>
      {/* decorative circles */}
      <div className="absolute -right-5 -top-5 w-24 h-24 rounded-full bg-white/10 pointer-events-none" />
      <div className="absolute right-4 -bottom-8 w-20 h-20 rounded-full bg-white/5 pointer-events-none" />

      <div className="flex items-start justify-between relative z-10">
        <p className="text-sm font-medium text-white/90 leading-snug max-w-[120px]">{title}</p>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>

      <p className="text-3xl font-bold tracking-tight relative z-10 mt-1">{value}</p>
      {delta && (
        <span className={`inline-flex w-fit items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold relative z-10 mt-0.5 ${delta.positive ? 'bg-white/25 text-white' : 'bg-black/15 text-white/90'}`}>
          {delta.text}
        </span>
      )}

      <div className="flex items-center gap-1 text-xs text-white/80 font-medium relative z-10 group-hover:text-white transition-colors mt-1">
        <span>{linkLabel}</span>
        <ChevronRight className="h-3 w-3" />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// CUSTOM DONUT LABEL
// ─────────────────────────────────────────────
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-sm">
        <p className="font-semibold text-gray-800">{payload[0].name}</p>
        <p className="text-gray-500">{payload[0].value} sessions</p>
      </div>
    )
  }
  return null
}

// ─────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────
export default function DashboardPage() {
  const { user, navigate, setSearchQuery } = useAppStore()
  const { choosePrintMode, PrintSettingsDialog } = usePrintSettings()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [periodLoading, setPeriodLoading] = useState(false)
  const [currentDate] = useState(new Date())
  // Dashboard date filter — defaults to today. Only the super_admin/admin
  // view's "Period" panel (KPIs, charts, utilization, schedule) moves with
  // this; other widgets keep their original always-"right now" meaning.
  const [period, setPeriod] = useState<DashboardPeriod>({ mode: 'single', date: format(new Date(), 'yyyy-MM-dd') })
  const [employees, setEmployees] = useState<any[]>([])
  // Name → system role (e.g. "therapist_speech") looked up from /api/users,
  // so the Therapist Utilization widget can show the same specific role
  // label ("Speech Therapist", "Occupational Therapist", ...) as User
  // Management, instead of the Employee record's often-generic "Therapist"
  // designation field.
  const [therapistRoleByName, setTherapistRoleByName] = useState<Record<string, string>>({})
  const [recentPayments, setRecentPayments] = useState<any[]>([])
  const [expiringPackages, setExpiringPackages] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [packageAssignments, setPackageAssignments] = useState<any[]>([])
  const [packageStats, setPackageStats] = useState({ total: 0, active: 0, expiring: 0, expired: 0 })

  // Payroll Engine — this-month earnings summary. Therapists see their own
  // (via employeeId=self, resolved server-side); admin/super_admin see the
  // whole clinic's totals across every therapist. Always 0 for orgs that
  // never touch payroll modes (no TherapistEarning rows exist).
  const [therapistEarnings, setTherapistEarnings] = useState({ sessions: 0, amount: 0 })
  const [orgPayrollSummary, setOrgPayrollSummary] = useState({ totalSalary: 0, sessions: 0, pendingPayroll: 0, paidPayroll: 0 })

  // Smart search state
  const [searchQuery, setLocalSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Record<string, any[]>>({})
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    async function fetchDashboard() {
      const isFirstLoad = !data
      if (isFirstLoad) setLoading(true)
      else setPeriodLoading(true)
      try {
        const params = period.mode === 'single'
          ? `date=${period.date}`
          : `from=${period.from}&to=${period.to}`
        const res = await authFetch(`/api/dashboard?${params}`)
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
      } catch (err) {
        console.error('Failed to fetch dashboard:', err)
      } finally {
        setLoading(false)
        setPeriodLoading(false)
      }
    }
    fetchDashboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  // Fetch additional data for enhanced functionality
  useEffect(() => {
    async function fetchAdditionalData() {
      try {
        const [empRes, payRes, sessRes, pkgRes, usersRes] = await Promise.all([
          authFetch('/api/employees?limit=100&department=Therapist'),
          authFetch('/api/payments?limit=5'),
          authFetch('/api/sessions?limit=100&status=completed'),
          authFetch('/api/packages?type=assignments&limit=100'),
          authFetch('/api/users'),
        ])

        if (empRes.ok) {
          const empData = await empRes.json()
          setEmployees(empData.employees || [])
        }

        if (usersRes.ok) {
          const usersData = await usersRes.json()
          const usersList = Array.isArray(usersData) ? usersData : []
          const roleByName: Record<string, string> = {}
          for (const u of usersList) {
            if (u?.name && u?.role) roleByName[u.name] = u.role
          }
          setTherapistRoleByName(roleByName)
        }

        if (payRes.ok) {
          const payData = await payRes.json()
          setRecentPayments(payData.payments || [])
        }

        if (sessRes.ok) {
          const sessData = await sessRes.json()
          setSessions(sessData.sessions || [])
        }

        if (pkgRes.ok) {
          const pkgData = await pkgRes.json()
          const assignments = pkgData.assignments || []
          setPackageAssignments(assignments)
          // Compute package stats
          const now = new Date()
          const fifteenDaysLater = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)
          const active = assignments.filter((a: any) => a.status === 'active').length
          const expiring = assignments.filter((a: any) => {
            if (a.status !== 'active' || !a.endDate) return false
            const end = new Date(a.endDate)
            return end >= now && end <= fifteenDaysLater
          }).length
          const expired = assignments.filter((a: any) => a.status === 'expired').length
          setPackageStats({ total: assignments.length, active, expiring, expired })
        }
      } catch (err) {
        console.error('Failed to fetch additional data:', err)
      }
    }
    
    if (!loading) {
      fetchAdditionalData()
    }
  }, [loading])

  // Smart search: debounce and fetch results
  const performSearch = useCallback(async (query: string) => {
    if (!query || query.trim().length < 1) {
      setSearchResults({})
      setSearchOpen(false)
      return
    }
    setSearchLoading(true)
    try {
      const res = await authFetch(`/api/search?q=${encodeURIComponent(query.trim())}`)
      if (res.ok) {
        const json = await res.json()
        const results = json.results || {}
        setSearchResults(results)
        setSearchOpen(Object.keys(results).length > 0)
      }
    } catch {
      setSearchResults({})
    } finally {
      setSearchLoading(false)
    }
  }, [])

  const handleSearchChange = useCallback((value: string) => {
    setLocalSearchQuery(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (!value.trim()) {
      setSearchResults({})
      setSearchOpen(false)
      return
    }
    searchTimeoutRef.current = setTimeout(() => performSearch(value), 300)
  }, [performSearch])

  // Clear any pending debounced search on unmount so it can't call
  // setState after the component is gone.
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [])

  const handleSearchClear = useCallback(() => {
    setLocalSearchQuery('')
    setSearchResults({})
    setSearchOpen(false)
  }, [])

  const handleResultClick = useCallback((type: string, item: any) => {
    setSearchOpen(false)
    switch (type) {
      case 'patients':
        setSearchQuery(item.childName || item.patientId)
        navigate('patients')
        break
      case 'invoices':
        setSearchQuery(item.invoiceNo)
        navigate('billing')
        break
      case 'payments':
        setSearchQuery(item.paymentNo)
        navigate('billing')
        break
      case 'employees':
        setSearchQuery(item.name || item.employeeId)
        navigate('employees')
        break
      case 'leads':
        setSearchQuery(item.name || item.mobile)
        navigate('leads')
        break
    }
  }, [navigate, setSearchQuery])

  const handleExportDashboard = useCallback(async () => {
    if (!data) return
    const rows: [string, string][] = [
      ['Total Patients', String(data.patients.total)],
      ['Active Patients', String(data.patients.active)],
      ['New Patients This Month', String(data.patients.newThisMonth)],
      ["Today's Appointments", String(data.appointments.today)],
      ['Weekly Appointments', String(data.appointments.weekly)],
      ['Completed This Month', String(data.appointments.completedThisMonth)],
      ['Cancelled This Month', String(data.appointments.cancelledThisMonth)],
      ["Today's Revenue", formatCurrencyForPdf(data.revenue.today)],
      ['Weekly Revenue', formatCurrencyForPdf(data.revenue.weekly)],
      ['Monthly Revenue', formatCurrencyForPdf(data.revenue.monthly)],
      ['Yearly Revenue', formatCurrencyForPdf(data.revenue.yearly)],
      ['Pending Payments', formatCurrencyForPdf(data.payments.pending)],
      ['Total Staff', String(data.hr.total)],
      ['Present Today', String(data.hr.presentToday)],
      ['On Leave Today', String(data.hr.onLeaveToday)],
      ['Monthly Expenses', formatCurrencyForPdf(data.expenses.monthly)],
      ['Net Profit', formatCurrencyForPdf(data.expenses.netProfit)],
    ]

    const choice = await choosePrintMode()
    if (!choice) return
    const doc = await createLetterheadPDF({ orientation: 'portrait', mode: choice.mode, branding: choice.branding })
    const autoTable = (await import('jspdf-autotable')).default
    doc.setFontSize(16)
    doc.setTextColor(15, 118, 110)
    doc.text('Dashboard Summary', doc.contentLeftX, doc.contentTopY - 10)
    doc.setFontSize(9)
    doc.setTextColor(80, 80, 80)
    doc.text(`Generated ${format(new Date(), 'dd MMM yyyy')}`, doc.contentLeftX, doc.contentTopY + 6)

    autoTable(doc, {
      startY: doc.contentTopY + 25,
      head: [['Metric', 'Value']],
      body: rows,
      styles: { fontSize: 9.5, cellPadding: 6, valign: 'middle' },
      headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold', halign: 'left' },
      alternateRowStyles: { fillColor: [246, 250, 249] },
      columnStyles: { 0: { cellWidth: 260 }, 1: { halign: 'right' } },
      margin: letterheadMargins(doc),
      didDrawPage: letterheadDidDrawPage(doc),
    })
    stampLetterheadOnAllPages(doc)
    doc.save(`dashboard-summary-${format(new Date(), 'yyyy-MM-dd')}.pdf`)
  }, [data, choosePrintMode])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const dashboardData = data || {
    patients: { total: 0, active: 0, newThisMonth: 0 },
    appointments: { today: 0, weekly: 0, completedThisMonth: 0, cancelledThisMonth: 0, total: 0, monthly: 0 },
    revenue: { today: 0, weekly: 0, monthly: 0, yearly: 0 },
    payments: { pending: 0 },
    hr: { total: 0, presentToday: 0, onLeaveToday: 0 },
    expenses: { monthly: 0, netProfit: 0 },
    recentPatients: [],
    upcomingAppointments: [],
    recentCompletedSessions: [],
    period: {
      mode: 'single' as const,
      from: format(new Date(), 'yyyy-MM-dd'),
      to: format(new Date(), 'yyyy-MM-dd'),
      isToday: true,
      appointments: 0,
      sessions: 0,
      revenue: 0,
      previous: { appointments: 0, sessions: 0, revenue: 0 },
      therapyBreakdown: [],
      schedule: [],
      completedSessions: [],
    },
  }

const isReceptionist = user?.role === 'receptionist'

const isSuperAdmin = user?.role === 'super_admin'

const therapistRoles = [
  'psychologist',
  'clinical_psychologist',
]

const isTherapist =
  user?.role?.startsWith('therapist') ||
  therapistRoles.includes(user?.role ?? '')

  // Payroll Engine — earnings for the selected month. Payroll records don't
  // have daily granularity, so the super_admin's cards follow the MONTH the
  // dashboard date picker's selection falls in (single date, or the start
  // of a range) rather than the literal selected day. The therapist's own
  // "self" earnings card isn't part of that picker — always current month.
  useEffect(() => {
    if (!user) return
    const now = new Date()

    if (isTherapist) {
      const month = now.getMonth() + 1
      const year = now.getFullYear()
      authFetch(`/api/payroll/earnings?month=${month}&year=${year}&employeeId=self`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => { if (json) setTherapistEarnings({ sessions: json.sessions || 0, amount: json.amount || 0 }) })
        .catch(() => {})
    } else if (isSuperAdmin) {
      const reference = new Date(`${period.mode === 'single' ? period.date : period.from}T00:00:00`)
      const month = reference.getMonth() + 1
      const year = reference.getFullYear()
      Promise.all([
        authFetch(`/api/payroll/earnings?month=${month}&year=${year}`).then((res) => (res.ok ? res.json() : null)),
        authFetch(`/api/payroll?month=${month}&year=${year}&limit=500`).then((res) => (res.ok ? res.json() : null)),
      ]).then(([earnings, payroll]) => {
        const sessions = ((earnings?.employees || []) as { sessions: number }[]).reduce((sum, e) => sum + e.sessions, 0)
        const records = (payroll?.records || []) as { status: string }[]
        setOrgPayrollSummary({
          totalSalary: payroll?.summary?.totalNetSalary || 0,
          sessions,
          pendingPayroll: records.filter((r) => r.status !== 'paid').length,
          paidPayroll: records.filter((r) => r.status === 'paid').length,
        })
      }).catch(() => {})
    }
  }, [user, isTherapist, isSuperAdmin, period])

  const roleLabel = user ? getRoleLabel(user.role) : ''

  const totalAppointments = dashboardData.appointments.total ??
    dashboardData.appointments.completedThisMonth + dashboardData.appointments.cancelledThisMonth

  const monthlyAppointments = dashboardData.appointments.monthly ??
    dashboardData.appointments.completedThisMonth + dashboardData.appointments.cancelledThisMonth

  // ── Selected-period panel (Dashboard date picker) ──
  const periodBlock = dashboardData.period
  const periodIsRange = periodBlock?.mode === 'range'
  const periodDateLabel = periodBlock
    ? periodIsRange
      ? `${format(new Date(`${periodBlock.from}T00:00:00`), 'dd MMM')} – ${format(new Date(`${periodBlock.to}T00:00:00`), 'dd MMM yyyy')}`
      : format(new Date(`${periodBlock.from}T00:00:00`), 'dd MMM yyyy')
    : ''
  const periodTitle = (base: string) => {
    if (!periodBlock) return `Today's ${base}`
    if (!periodIsRange && periodBlock.isToday) return `Today's ${base}`
    return `${base} (${periodDateLabel})`
  }
  const comparisonSuffix = periodIsRange ? 'vs previous period' : 'vs previous day'
  const countDelta = (current: number, previous: number): { text: string; positive: boolean } | null => {
    if (current === 0 && previous === 0) return null
    const diff = current - previous
    const pct = previous === 0 ? 100 : Math.round((diff / previous) * 100)
    return { text: `${diff >= 0 ? '+' : ''}${pct}% ${comparisonSuffix}`, positive: diff >= 0 }
  }
  const appointmentsDelta = periodBlock ? countDelta(periodBlock.appointments, periodBlock.previous.appointments) : null
  const sessionsDelta = periodBlock ? countDelta(periodBlock.sessions, periodBlock.previous.sessions) : null
  const collectionDelta = periodBlock && (periodBlock.revenue !== 0 || periodBlock.previous.revenue !== 0)
    ? (() => {
        const diff = periodBlock.revenue - periodBlock.previous.revenue
        return { text: `${diff >= 0 ? '+' : '-'}${formatCurrency(Math.abs(diff))} ${comparisonSuffix}`, positive: diff >= 0 }
      })()
    : null

  // "Appointments by Therapy" donut — built from the period's therapy
  // breakdown (grouped server-side); colors assigned by rank.
  const therapyDonutData = (periodBlock?.therapyBreakdown || []).map((t, idx) => ({
    name: t.name,
    value: t.value,
    color: therapistColors[idx % therapistColors.length],
    percent: '',
  }))
  const totalDonut = therapyDonutData.reduce((s, d) => s + d.value, 0)
  therapyDonutData.forEach((d) => { d.percent = totalDonut > 0 ? `${Math.round((d.value / totalDonut) * 100)}%` : '0%' })

  // Get therapist utilization from employees data (real data only).
  // Utilization is derived from each therapist's completed-session count
  // within the selected period — no random/mock values.
  const periodCompletedSessions = periodBlock?.completedSessions || []
  const therapistUtilization = employees.length > 0
    ? employees.slice(0, 4).map((emp, idx) => {
        const completedByTherapist = periodCompletedSessions.filter(
          (s) => s?.therapistName === emp.name
        ).length
        const totalSessions = periodCompletedSessions.length || 1
        const util = Math.round((completedByTherapist / totalSessions) * 100)
        // Prefer the actual system role (matches User Management's label —
        // e.g. "Speech Therapist") over the Employee record's designation
        // field, which is often just the generic "Therapist" dropdown value.
        const matchedRole = therapistRoleByName[emp.name]
        return {
          name: emp.name,
          role: (matchedRole ? getRoleLabel(matchedRole) : '') || emp.designation || 'Therapist',
          sessions: completedByTherapist,
          utilization: Math.min(100, util),
          color: therapistColors[idx % therapistColors.length],
          initials: emp.name?.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() || 'TH',
        }
      })
    : []

  // Selected period's schedule (real data only) — every appointment in the
  // period, not just "upcoming from now", so past dates show their full day.
  const periodSchedule = periodBlock?.schedule || []
  const todaySchedule = periodSchedule.length > 0
    ? periodSchedule.slice(0, periodIsRange ? 8 : 6).map((apt) => ({
        time: apt.startTime || '—',
        date: periodIsRange ? format(new Date(`${apt.date.slice(0, 10)}T00:00:00`), 'dd MMM') : '',
        therapy: apt.therapyType || apt.title || 'Appointment',
        therapist: apt.therapistId || 'TBD',
        status: apt.status === 'completed' ? 'Completed'
          : apt.status === 'confirmed' ? 'Confirmed'
          : apt.status === 'cancelled' ? 'Cancelled'
          : apt.status === 'no_show' ? 'No Show'
          : 'Pending',
        statusColor: apt.status === 'completed' ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
          : apt.status === 'confirmed' ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
          : apt.status === 'cancelled' || apt.status === 'no_show' ? 'text-red-600 bg-red-50 border-red-200'
          : 'text-amber-600 bg-amber-50 border-amber-200',
      }))
    : []

  // Get recent payments from API data (real data only)
  const recentPaymentsDisplay = recentPayments.length > 0
    ? recentPayments.slice(0, 3).map((p: any) => ({
        name: p.patient?.childName || 'Unknown',
        therapy: p.type === 'payment' ? 'Payment Received' : p.type,
        date: format(new Date(p.date), 'dd MMM yyyy'),
        amount: formatCurrency(p.amount),
        status: 'Paid',
        initials: p.patient?.childName?.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() || 'P',
      }))
    : []

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
        </div>
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  if (isReceptionist) {
    return (
      <div className="min-h-screen bg-gray-50/60">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.name}</h1>
              <p className="text-sm text-gray-500 mt-1">
                Your receptionist dashboard shows patient and appointment summaries plus your attendance tools.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-white border border-gray-200 px-4 py-2 shadow-sm">
              <CalendarDays className="h-4 w-4 text-[#0F7A87]" />
              <span className="text-sm font-medium text-gray-700">{format(currentDate, 'dd MMMM yyyy, EEEE')}</span>
            </div>
          </div>

          {/* Self-service check-in / check-out card */}
          <AttendanceCheckCard />

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              title="Total Patients"
              value={dashboardData.patients.total.toString()}
              icon={Users}
              gradient="bg-gradient-to-br from-cyan-500 to-teal-600"
              linkLabel="View patients"
              onClick={() => navigate('patients')}
            />
            <KpiCard
              title="Total Appointments"
              value={totalAppointments.toString()}
              icon={CalendarDays}
              gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
              linkLabel="View appointments"
              onClick={() => navigate('appointments')}
            />
            <KpiCard
              title="Monthly Appointments"
              value={monthlyAppointments.toString()}
              icon={CalendarDays}
              gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
              linkLabel="View monthly schedule"
              onClick={() => navigate('appointments')}
            />
            <KpiCard
              title="Mark Attendance"
              value="Ready"
              icon={Clock}
              gradient="bg-gradient-to-br from-slate-500 to-slate-700"
              linkLabel="Open attendance"
              onClick={() => navigate('attendance')}
            />
            <KpiCard
              title="Apply Leave"
              value="Open"
              icon={FileText}
              gradient="bg-gradient-to-br from-yellow-500 to-orange-600"
              linkLabel="Request leave"
              onClick={() => navigate('leaves')}
            />
            <KpiCard
              title="Recent Patients"
              value={`${dashboardData.recentPatients.length}`}
              icon={Users}
              gradient="bg-gradient-to-br from-violet-500 to-fuchsia-600"
              linkLabel="See recent"
              onClick={() => navigate('patients')}
            />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Recent Patients</h2>
                <p className="text-sm text-gray-500">Latest patients available to your desk.</p>
              </div>
              <button onClick={() => navigate('patients')} className="text-sm font-medium text-[#0F7A87] hover:text-[#0B5A64]">
                View all
              </button>
            </div>
            <div className="space-y-3">
              {dashboardData.recentPatients.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                  No recent patients available.
                </div>
              ) : (
                <div className="grid gap-3">
                  {dashboardData.recentPatients.map((patient) => (
                    <div key={patient.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{patient.childName}</p>
                        <p className="text-xs text-gray-500">{patient.patientId} • {patient.gender} • {patient.dateOfBirth}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Diagnosis</p>
                        <p className="text-sm font-medium text-gray-800">{patient.diagnosis}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isTherapist) {
    return (
      <div className="min-h-screen bg-gray-50/60">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.name}</h1>
              <p className="text-sm text-gray-500 mt-1">
                {roleLabel} dashboard with your assigned patients, appointments, attendance, and leave.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-white border border-gray-200 px-4 py-2 shadow-sm">
              <CalendarDays className="h-4 w-4 text-[#0F7A87]" />
              <span className="text-sm font-medium text-gray-700">{format(currentDate, 'dd MMMM yyyy, EEEE')}</span>
            </div>
          </div>

          {/* Self-service check-in / check-out card */}
          <AttendanceCheckCard />

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              title="Total Patients"
              value={dashboardData.patients.total.toString()}
              icon={Users}
              gradient="bg-gradient-to-br from-cyan-500 to-teal-600"
              linkLabel="View patients"
              onClick={() => navigate('patients')}
            />
            <KpiCard
              title="Total Appointments"
              value={totalAppointments.toString()}
              icon={CalendarDays}
              gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
              linkLabel="View appointments"
              onClick={() => navigate('appointments')}
            />
            <KpiCard
              title="Monthly Appointments"
              value={monthlyAppointments.toString()}
              icon={CalendarDays}
              gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
              linkLabel="View monthly schedule"
              onClick={() => navigate('appointments')}
            />
            <KpiCard
              title="My Earnings This Month"
              value={formatCurrency(therapistEarnings.amount)}
              icon={Wallet}
              gradient="bg-gradient-to-br from-amber-500 to-orange-600"
              linkLabel={`${therapistEarnings.sessions} session${therapistEarnings.sessions === 1 ? '' : 's'} counted`}
            />
            <KpiCard
              title="Mark Attendance"
              value="Ready"
              icon={Clock}
              gradient="bg-gradient-to-br from-slate-500 to-slate-700"
              linkLabel="Open attendance"
              onClick={() => navigate('attendance')}
            />
            <KpiCard
              title="Apply Leave"
              value="Open"
              icon={FileText}
              gradient="bg-gradient-to-br from-yellow-500 to-orange-600"
              linkLabel="Request leave"
              onClick={() => navigate('leaves')}
            />
            <KpiCard
              title="Recent Patients"
              value={`${dashboardData.recentPatients.length}`}
              icon={Users}
              gradient="bg-gradient-to-br from-violet-500 to-fuchsia-600"
              linkLabel="See recent"
              onClick={() => navigate('patients')}
            />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Recent Patients</h2>
                <p className="text-sm text-gray-500">Patients assigned to you.</p>
              </div>
              <button onClick={() => navigate('patients')} className="text-sm font-medium text-[#0F7A87] hover:text-[#0B5A64]">
                View all
              </button>
            </div>
            <div className="space-y-3">
              {dashboardData.recentPatients.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                  No recent patients assigned.
                </div>
              ) : (
                <div className="grid gap-3">
                  {dashboardData.recentPatients.map((patient) => (
                    <div key={patient.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{patient.childName}</p>
                        <p className="text-xs text-gray-500">{patient.patientId} • {patient.gender} • {patient.dateOfBirth}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Diagnosis</p>
                        <p className="text-sm font-medium text-gray-800">{patient.diagnosis}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50/60">
      {PrintSettingsDialog}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ══════════════════════════════════════════
            HEADER
        ══════════════════════════════════════════ */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: greeting */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              Welcome back, {user?.name || 'Admin'}! <span>👋</span>
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Here&apos;s what&apos;s happening today.
            </p>
          </div>

          {/* Right: search + actions + date */}
          <div className="flex flex-col gap-3 sm:items-end">
            <div className="flex items-center gap-3">
              {/* Smart Search */}
              <div ref={searchRef} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
                <input
                  type="text"
                  role="combobox"
                  aria-label="Search child, parent, invoice"
                  aria-expanded={searchOpen}
                  aria-controls="dashboard-search-results"
                  placeholder="Search child, parent, invoice..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => { if (Object.keys(searchResults).length > 0) setSearchOpen(true) }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSearchOpen(false)
                      ;(e.target as HTMLInputElement).blur()
                    }
                  }}
                  className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 w-64 placeholder:text-gray-400"
                />
                {searchLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
                )}
                {!searchLoading && searchQuery && (
                  <button onClick={handleSearchClear} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {/* Search Results Dropdown */}
                {searchOpen && (
                  <div id="dashboard-search-results" role="listbox" aria-label="Search results" className="absolute top-full mt-2 left-0 w-80 max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl z-50">
                    {/* Patients */}
                    {searchResults.patients && searchResults.patients.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                          <Users className="h-3.5 w-3.5 text-blue-500" />
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Patients</span>
                          <span className="text-[10px] text-gray-400 ml-auto">{searchResults.patients.length} found</span>
                        </div>
                        {searchResults.patients.map((p: any) => (
                          <button
                            key={p.id}
                            onClick={() => handleResultClick('patients', p)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50/50 transition-colors text-left border-b border-gray-50"
                          >
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {p.childName?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800 truncate">{p.childName}</p>
                              <p className="text-xs text-gray-500">{p.patientId} • {p.mobile}</p>
                            </div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${p.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                              {p.status}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Invoices */}
                    {searchResults.invoices && searchResults.invoices.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                          <FileText className="h-3.5 w-3.5 text-orange-500" />
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Invoices</span>
                          <span className="text-[10px] text-gray-400 ml-auto">{searchResults.invoices.length} found</span>
                        </div>
                        {searchResults.invoices.map((inv: any) => (
                          <button
                            key={inv.id}
                            onClick={() => handleResultClick('invoices', inv)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-orange-50/50 transition-colors text-left border-b border-gray-50"
                          >
                            <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              INV
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800">{inv.invoiceNo}</p>
                              <p className="text-xs text-gray-500">{inv.patient?.childName || 'N/A'} • ₹{inv.totalAmount?.toLocaleString('en-IN')}</p>
                            </div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${inv.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : inv.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                              {inv.status?.replace('_', ' ')}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Payments */}
                    {searchResults.payments && searchResults.payments.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                          <CreditCard className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Payments</span>
                          <span className="text-[10px] text-gray-400 ml-auto">{searchResults.payments.length} found</span>
                        </div>
                        {searchResults.payments.map((pay: any) => (
                          <button
                            key={pay.id}
                            onClick={() => handleResultClick('payments', pay)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-emerald-50/50 transition-colors text-left border-b border-gray-50"
                          >
                            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              PAY
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800">{pay.paymentNo}</p>
                              <p className="text-xs text-gray-500">{pay.patient?.childName || 'N/A'} • ₹{pay.amount?.toLocaleString('en-IN')}</p>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600 capitalize">
                              {pay.paymentMode}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Employees */}
                    {searchResults.employees && searchResults.employees.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                          <UserCog className="h-3.5 w-3.5 text-purple-500" />
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Employees</span>
                          <span className="text-[10px] text-gray-400 ml-auto">{searchResults.employees.length} found</span>
                        </div>
                        {searchResults.employees.map((emp: any) => (
                          <button
                            key={emp.id}
                            onClick={() => handleResultClick('employees', emp)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-purple-50/50 transition-colors text-left border-b border-gray-50"
                          >
                            <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {emp.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800 truncate">{emp.name}</p>
                              <p className="text-xs text-gray-500">{emp.employeeId} • {emp.designation || 'N/A'}</p>
                            </div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${emp.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                              {emp.status}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Leads */}
                    {searchResults.leads && searchResults.leads.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                          <PhoneCall className="h-3.5 w-3.5 text-pink-500" />
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Leads</span>
                          <span className="text-[10px] text-gray-400 ml-auto">{searchResults.leads.length} found</span>
                        </div>
                        {searchResults.leads.map((lead: any) => (
                          <button
                            key={lead.id}
                            onClick={() => handleResultClick('leads', lead)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-pink-50/50 transition-colors text-left border-b border-gray-50"
                          >
                            <div className="w-8 h-8 rounded-full bg-pink-100 text-pink-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {lead.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800 truncate">{lead.name}</p>
                              <p className="text-xs text-gray-500">{lead.mobile} • {lead.childName || 'N/A'}</p>
                            </div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${lead.status === 'new' ? 'bg-blue-100 text-blue-700' : lead.status === 'contacted' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {lead.status}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {/* No results */}
                    {Object.keys(searchResults).length === 0 && !searchLoading && searchQuery && (
                      <div className="px-4 py-8 text-center">
                        <Search className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">No results found for &ldquo;{searchQuery}&rdquo;</p>
                        <p className="text-xs text-gray-400 mt-1">Try searching by name, ID, or mobile number</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* Export */}
              <button onClick={handleExportDashboard} className="flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors" title="Export dashboard summary">
                <Download className="h-4 w-4 text-gray-600" />
              </button>
              {/* WhatsApp icon */}
              <button onClick={() => navigate('whatsapp-logs')} className="flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-gray-200 shadow-sm hover:bg-green-50 transition-colors" title="WhatsApp logs">
                <MessageCircle className="h-4 w-4 text-green-600" />
              </button>
            </div>

            {/* Date selector */}
            <div className="flex items-center gap-2 self-end">
              {periodLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0F7A87]" />}
              <DashboardDateFilter period={period} onChange={setPeriod} />
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            KPI CARDS ROW
        ══════════════════════════════════════════ */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard
            title={periodTitle('Appointments')}
            value={(periodBlock?.appointments ?? 0).toString()}
            icon={CalendarDays}
            gradient="bg-gradient-to-br from-[#12909F] to-[#0B5A64]"
            linkLabel="View all appointments"
            onClick={() => navigate('appointments')}
            delta={appointmentsDelta}
          />
          <KpiCard
            title={periodTitle('Sessions')}
            value={(periodBlock?.sessions ?? 0).toString()}
            icon={Activity}
            gradient="bg-gradient-to-br from-[#7A4D6E] to-[#5C2A4D]"
            linkLabel="View all sessions"
            onClick={() => navigate('sessions')}
            delta={sessionsDelta}
          />
          {isSuperAdmin && (
            <KpiCard
              title={periodTitle('Collection')}
              value={formatCurrency(periodBlock?.revenue ?? 0)}
              icon={IndianRupee}
              gradient="bg-gradient-to-br from-[#F2673D] to-[#D9502A]"
              linkLabel="View collection"
              onClick={() => navigate('billing')}
              delta={collectionDelta}
            />
          )}
          <KpiCard
            title="Total Active Patients"
            value={dashboardData.patients.active.toString()}
            icon={Users}
            gradient="bg-gradient-to-br from-[#2D6E8E] to-[#1B4D66]"
            linkLabel="View patients"
            onClick={() => navigate('patients')}
          />
          <KpiCard
            title="Pending Payments"
            value={formatCurrency(dashboardData.payments.pending)}
            icon={CreditCard}
            gradient="bg-gradient-to-br from-[#E85D4A] to-[#C23B28]"
            linkLabel="View pending"
            onClick={() => navigate('billing')}
          />
          <KpiCard
            title="Expiring Packages"
            value={String(packageStats.expiring)}
            icon={Package}
            gradient="bg-gradient-to-br from-[#F2A73D] to-[#D98A1F]"
            linkLabel="View expiring"
            onClick={() => navigate('packages')}
          />
          {isSuperAdmin && (
            <>
              <KpiCard
                title="Total Therapist Salary"
                value={formatCurrency(orgPayrollSummary.totalSalary)}
                icon={Wallet}
                gradient="bg-gradient-to-br from-[#0F7A87] to-[#0B5A64]"
                linkLabel="View payroll"
                onClick={() => navigate('payroll')}
              />
              <KpiCard
                title="Pending Payroll"
                value={String(orgPayrollSummary.pendingPayroll)}
                icon={Clock}
                gradient="bg-gradient-to-br from-[#D9A441] to-[#B3821F]"
                linkLabel="View payroll"
                onClick={() => navigate('payroll')}
              />
              <KpiCard
                title="Paid Payroll"
                value={String(orgPayrollSummary.paidPayroll)}
                icon={CreditCard}
                gradient="bg-gradient-to-br from-[#3F9142] to-[#2A6B2D]"
                linkLabel="View payroll"
                onClick={() => navigate('payroll')}
              />
              <KpiCard
                title="Therapist Sessions"
                value={String(orgPayrollSummary.sessions)}
                icon={Activity}
                gradient="bg-gradient-to-br from-[#5C6BC0] to-[#3949AB]"
                linkLabel="View earnings"
                onClick={() => navigate('therapist-earnings')}
              />
            </>
          )}
        </div>

        {/* ══════════════════════════════════════════
            ROW 2: Appointments by Therapy | Therapist Utilization | Today's Schedule
        ══════════════════════════════════════════ */}
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">

          {/* Appointments by Therapy — Donut */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-800">Appointments by Therapy</h2>
            </div>
            <div className="flex flex-col items-center">
              <div className="relative w-full" style={{ height: 180 }}>
                {therapyDonutData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={therapyDonutData}
                          cx="50%"
                          cy="50%"
                          innerRadius={52}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {therapyDonutData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-2xl font-bold text-gray-800">{totalDonut}</span>
                      <span className="text-xs text-gray-400">Total</span>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="h-14 w-14 rounded-full bg-[#0F7A87]/8 flex items-center justify-center mb-3">
                      <CalendarDays className="h-6 w-6 text-[#0F7A87]/50" />
                    </div>
                    <p className="text-sm text-gray-400">No appointment data yet</p>
                    <p className="text-xs text-gray-300 mt-0.5">Scheduled appointments will show up here</p>
                  </div>
                )}
              </div>

              {/* Legend */}
              {therapyDonutData.length > 0 && (
                <div className="w-full space-y-1.5 mt-2">
                  {therapyDonutData.map((item) => (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                        <span className="text-gray-600">{item.name}</span>
                      </div>
                      <span className="text-gray-500 font-medium">{item.value} ({item.percent})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => navigate('reports')} className="mt-4 flex items-center gap-1 text-xs text-[#0F7A87] font-medium hover:underline">
              View full report <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {/* Therapist Utilization */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-800">Therapist Utilization</h2>
              <span className="text-[10px] text-gray-400">{periodDateLabel}</span>
            </div>
            <div className="space-y-4">
              {therapistUtilization.length > 0 ? (
                therapistUtilization.map((t) => (
                  <div key={t.name} className="flex items-center gap-3">
                    <Avatar initials={t.initials} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <p className="text-xs font-semibold text-gray-800">{t.name}</p>
                          <p className="text-[10px] text-gray-400">{t.role} · {t.sessions} session{t.sessions === 1 ? '' : 's'}</p>
                        </div>
                        <span className="text-xs font-bold text-gray-700">{t.utilization}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${t.utilization}%`, background: t.color }}
                        />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="h-14 w-14 rounded-full bg-[#0F7A87]/8 flex items-center justify-center mb-3">
                    <Users className="h-6 w-6 text-[#0F7A87]/50" />
                  </div>
                  <p className="text-sm text-gray-400">No therapists found</p>
                  <p className="text-xs text-gray-300 mt-0.5">Add employees with a therapist role to see utilization</p>
                </div>
              )}
            </div>
            <button onClick={() => navigate('employees')} className="mt-5 flex items-center gap-1 text-xs text-[#0F7A87] font-medium hover:underline">
              View all therapists <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {/* Schedule Overview */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-800">
                {periodBlock?.isToday && !periodIsRange ? "Today's Schedule Overview" : 'Schedule Overview'}
              </h2>
              <span className="text-[10px] text-gray-400">{periodDateLabel}</span>
            </div>
            <div className="space-y-2">
              {todaySchedule.length > 0 ? (
                todaySchedule.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 py-1.5">
                    <span className="text-xs font-semibold text-gray-500 w-16 flex-shrink-0">
                      {item.date ? `${item.date} · ${item.time}` : item.time}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{item.therapy}</p>
                      <p className="text-[10px] text-gray-400">{item.therapist}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border ${item.statusColor} flex-shrink-0`}>
                      {item.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="h-14 w-14 rounded-full bg-[#0F7A87]/8 flex items-center justify-center mb-3">
                    <CalendarDays className="h-6 w-6 text-[#0F7A87]/50" />
                  </div>
                  <p className="text-sm text-gray-400">No appointments scheduled today</p>
                  <p className="text-xs text-gray-300 mt-0.5">Your day is clear so far</p>
                </div>
              )}
            </div>
            <button onClick={() => navigate('appointments')} className="mt-4 flex items-center gap-1 text-xs text-[#0F7A87] font-medium hover:underline">
              View full schedule <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            ROW 3: Session Summary | Recent Payments | Package Expiring Soon
        ══════════════════════════════════════════ */}
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">

          {/* Session Summary (This Month) */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-800">
                Session Summary <span className="font-normal text-gray-400">(This Month)</span>
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* Total Sessions */}
              <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                <p className="text-[11px] text-[#0F7A87] font-semibold mb-1">Total Sessions</p>
                <p className="text-2xl font-bold text-gray-800">{dashboardData.appointments.completedThisMonth + dashboardData.appointments.cancelledThisMonth}</p>
                <Sparkline data={sessionSummarySparklines.total} color="#3B82F6" />
              </div>
              {/* Completed */}
              <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                <p className="text-[11px] text-emerald-600 font-semibold mb-1">Completed</p>
                <p className="text-2xl font-bold text-gray-800">{dashboardData.appointments.completedThisMonth}</p>
                <div className="flex items-end gap-2">
                  <Sparkline data={sessionSummarySparklines.completed} color="#22C55E" />
                  <span className="text-[10px] text-emerald-600 font-semibold pb-1">
                    {dashboardData.appointments.completedThisMonth + dashboardData.appointments.cancelledThisMonth > 0
                      ? Math.round(
                          (dashboardData.appointments.completedThisMonth /
                            (dashboardData.appointments.completedThisMonth + dashboardData.appointments.cancelledThisMonth)) *
                            100
                        )
                      : 0}
                    %
                  </span>
                </div>
              </div>
              {/* Cancelled */}
              <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                <p className="text-[11px] text-orange-500 font-semibold mb-1">Cancelled</p>
                <p className="text-2xl font-bold text-gray-800">{dashboardData.appointments.cancelledThisMonth}</p>
                <div className="flex items-end gap-2">
                  <Sparkline data={sessionSummarySparklines.cancelled} color="#F97316" />
                  <span className="text-[10px] text-orange-500 font-semibold pb-1">
                    {dashboardData.appointments.completedThisMonth + dashboardData.appointments.cancelledThisMonth > 0
                      ? Math.round(
                          (dashboardData.appointments.cancelledThisMonth /
                            (dashboardData.appointments.completedThisMonth + dashboardData.appointments.cancelledThisMonth)) *
                            100
                        )
                      : 0}
                    %
                  </span>
                </div>
              </div>
              {/* No Show */}
              <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                <p className="text-[11px] text-red-500 font-semibold mb-1">No Show</p>
                <p className="text-2xl font-bold text-gray-800">0</p>
                <div className="flex items-end gap-2">
                  <Sparkline data={sessionSummarySparklines.noShow} color="#EF4444" />
                  <span className="text-[10px] text-red-500 font-semibold pb-1">0%</span>
                </div>
              </div>
            </div>
            <button onClick={() => navigate('reports')} className="mt-4 flex items-center gap-1 text-xs text-[#0F7A87] font-medium hover:underline">
              View detailed report <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {/* Recent Payments */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-800">Recent Payments</h2>
            </div>
            <div className="space-y-3">
              {recentPaymentsDisplay.length > 0 ? (
                recentPaymentsDisplay.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-3 py-1">
                    <Avatar initials={p.initials} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800">{p.name}</p>
                      <p className="text-[10px] text-gray-400 truncate">{p.therapy}</p>
                      <p className="text-[10px] text-gray-400">{p.date}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-gray-800">{p.amount}</p>
                      <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">
                        {p.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <IndianRupee className="h-10 w-10 text-gray-300 mb-2" />
                  <p className="text-sm text-gray-400">No recent payments.</p>
                </div>
              )}
            </div>
            <button onClick={() => navigate('billing')} className="mt-4 flex items-center gap-1 text-xs text-[#0F7A87] font-medium hover:underline">
              View all payments <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {/* Package Expiring Soon */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-800">Package Expiring Soon</h2>
            </div>
            <div className="space-y-4">
              {(() => {
                const now = new Date()
                const fifteenDaysLater = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)
                const expiring = packageAssignments
                  .filter((a: any) => {
                    if (a.status !== 'active' || !a.endDate) return false
                    const end = new Date(a.endDate)
                    return end >= now && end <= fifteenDaysLater
                  })
                  .sort((a: any, b: any) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
                  .slice(0, 5)

                if (expiring.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Package className="h-10 w-10 text-gray-300 mb-2" />
                      <p className="text-sm text-gray-400">No packages are expiring.</p>
                    </div>
                  )
                }

                return expiring.map((pkg: any, idx: number) => {
                  const name = pkg.patient?.childName || 'Unknown'
                  const initials = name.charAt(0).toUpperCase()
                  const packageName = pkg.name ?? pkg.package?.name ?? 'Package'
                  const daysLeft = Math.ceil((new Date(pkg.endDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
                  const sessionsPurchased = pkg.sessionsPurchased || 0
                  const sessionsCompleted = pkg.sessionsCompleted || 0
                  const progress = sessionsPurchased > 0 ? Math.round((sessionsCompleted / sessionsPurchased) * 100) : 0
                  const tagColor = pkg.therapyType === 'Speech Therapy' ? 'bg-teal-100 text-teal-700'
                    : pkg.therapyType === 'Occupational Therapy' ? 'bg-orange-100 text-orange-700'
                    : 'bg-blue-100 text-blue-700'
                  return (
                    <div key={idx} className="flex items-start gap-3">
                      <Avatar initials={initials} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-semibold text-gray-800">{name}</p>
                          <span className="text-[10px] font-semibold text-red-500 flex-shrink-0">
                            Expires in {daysLeft} days
                          </span>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${tagColor}`}>
                          {packageName}
                        </span>
                        <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-teal-500"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
            <button onClick={() => navigate('packages')} className="mt-4 flex items-center gap-1 text-xs text-[#0F7A87] font-medium hover:underline">
              View all expiring packages <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            ROW 4: Package Overview (Super Admin only)
        ══════════════════════════════════════════ */}
        {isSuperAdmin && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-900">Package Overview</h2>
              <button onClick={() => navigate('packages')} className="flex items-center gap-1 text-xs text-[#0F7A87] font-medium hover:text-[#0B5A64] transition-colors duration-300">
                Manage Packages <ChevronRight className="h-3 w-3" />
              </button>
            </div>

            {/* Package stat mini-cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="rounded-3xl border border-slate-200/80 bg-sky-50/70 p-3 text-center transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-sm">
                <p className="text-[11px] text-sky-700 font-semibold mb-1">Total Packages</p>
                <p className="text-xl font-bold text-slate-900">{packageStats.total}</p>
              </div>
              <div className="rounded-3xl border border-slate-200/80 bg-emerald-50/70 p-3 text-center transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-sm">
                <p className="text-[11px] text-emerald-700 font-semibold mb-1">Active</p>
                <p className="text-xl font-bold text-slate-900">{packageStats.active}</p>
              </div>
              <div className="rounded-3xl border border-slate-200/80 bg-orange-50/70 p-3 text-center transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-sm">
                <p className="text-[11px] text-orange-600 font-semibold mb-1">Expiring Soon</p>
                <p className="text-xl font-bold text-slate-900">{packageStats.expiring}</p>
              </div>
              <div className="rounded-3xl border border-slate-200/80 bg-rose-50/70 p-3 text-center transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-sm">
                <p className="text-[11px] text-rose-600 font-semibold mb-1">Expired</p>
                <p className="text-xl font-bold text-slate-900">{packageStats.expired}</p>
              </div>
            </div>

            {/* Recent package assignments table */}
            <div className="overflow-x-auto rounded-3xl border border-slate-200/80 bg-white/80 shadow-sm">
              <table className="w-full text-xs min-w-[680px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left py-3 px-4 font-semibold text-slate-600">Patient</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 hidden sm:table-cell">Therapy Type</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600">Package</th>
                    <th className="text-center py-3 px-4 font-semibold text-slate-600">Sessions</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 hidden md:table-cell">Validity</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-600">Amount</th>
                    <th className="text-center py-3 px-4 font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {packageAssignments.length > 0 ? (
                    packageAssignments.slice(0, 5).map((pkg: any) => {
                      const name = pkg.patient?.childName || 'Unknown'
                      const patientId = pkg.patient?.patientId || ''
                      const therapyType = pkg.therapyType ?? pkg.package?.therapyType ?? 'N/A'
                      const packageName = pkg.name ?? pkg.package?.name ?? 'Package'
                      const sessionsCompleted = pkg.sessionsCompleted || 0
                      const sessionsPurchased = pkg.sessionsPurchased || 0
                      const startDate = pkg.startDate ? new Date(pkg.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : 'N/A'
                      const endDate = pkg.endDate ? new Date(pkg.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : 'N/A'
                      const amount = pkg.netAmount || 0
                      const status = pkg.status || 'active'
                      const statusBadge = status === 'active' ? 'bg-emerald-100 text-emerald-700'
                        : status === 'expired' ? 'bg-rose-100 text-rose-700'
                        : 'bg-slate-100 text-slate-700'
                      return (
                        <tr key={pkg.id} className="hover:bg-slate-50/90 cursor-pointer transition-colors duration-200" onClick={() => navigate('packages')}>
                          <td className="py-3 px-4">
                            <p className="font-medium text-slate-900">{name}</p>
                            <p className="text-[11px] text-slate-500">{patientId}</p>
                          </td>
                          <td className="py-3 px-4 text-slate-600 hidden sm:table-cell">{therapyType}</td>
                          <td className="py-3 px-4 text-slate-600">{packageName}</td>
                          <td className="py-3 px-4 text-center text-slate-700 font-medium">{sessionsCompleted}/{sessionsPurchased}</td>
                          <td className="py-3 px-4 text-slate-500 hidden md:table-cell">{startDate} - {endDate}</td>
                          <td className="py-3 px-4 text-right font-semibold text-slate-900">₹{amount.toLocaleString('en-IN')}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${statusBadge}`}>{status}</span>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400">
                        <Package className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                        No package assignments found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            BOTTOM ROW: Quick Actions + Today's Quote
        ══════════════════════════════════════════ */}
        <div className="flex flex-col sm:flex-row items-stretch gap-4">

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-bold text-gray-800 mr-2 whitespace-nowrap">Quick Actions</span>

              <button onClick={() => navigate('patient-form')} className="action-pill bg-blue-600 text-white hover:bg-blue-700">
                <UserPlus className="h-3.5 w-3.5" />
                New Patient
              </button>
              <button onClick={() => navigate('assessment-form')} className="action-pill bg-emerald-500 text-white hover:bg-emerald-600">
                <ClipboardList className="h-3.5 w-3.5" />
                New Assessment
              </button>
              <button onClick={() => navigate('appointment-form')} className="action-pill bg-violet-500 text-white hover:bg-violet-600">
                <CalendarPlus className="h-3.5 w-3.5" />
                New Appointment
              </button>
              <button onClick={() => navigate('billing')} className="action-pill bg-amber-500 text-white hover:bg-amber-600">
                <Wallet className="h-3.5 w-3.5" />
                New Invoice
              </button>
              <button onClick={() => navigate('whatsapp-logs')} className="action-pill bg-green-600 text-white hover:bg-green-700">
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp Message
              </button>
              <button onClick={() => navigate('reports')} className="action-pill bg-teal-600 text-white hover:bg-teal-700">
                <BarChart2 className="h-3.5 w-3.5" />
                View Reports
              </button>
            </div>
          </div>

          {/* Today's Quote */}
          <div className="bg-gradient-to-br from-blue-900 via-indigo-800 to-purple-900 rounded-2xl shadow-sm p-5 sm:w-72 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />
            <div className="absolute bottom-2 left-2 text-4xl select-none opacity-30">❤️</div>
            <div>
              <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-3">Today&apos;s Quote</p>
              <p className="text-sm text-white leading-relaxed font-medium relative z-10">
                &quot;Every child is different, every child is special, and every child is wonderful.&quot;
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}





