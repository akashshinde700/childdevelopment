'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import {
  BarChart3,
  Users,
  CalendarDays,
  IndianRupee,
  UserCog,
  Download,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  Package,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  Pie,
  PieChart,
  Cell,
  Line,
  LineChart,
  Area,
  AreaChart,
} from 'recharts'
import { toast } from 'sonner'
import { authFetch } from '@/lib/api-client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Month names
const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Currency formatter
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// Chart configs
const patientStatusConfig = {
  active: { label: 'Active', color: 'hsl(160, 60%, 45%)' },
  inactive: { label: 'Inactive', color: 'hsl(0, 0%, 70%)' },
  discharged: { label: 'Discharged', color: 'hsl(215, 20%, 55%)' },
} satisfies ChartConfig

const appointmentStatusConfig = {
  completed: { label: 'Completed', color: 'hsl(160, 60%, 45%)' },
  cancelled: { label: 'Cancelled', color: 'hsl(0, 70%, 55%)' },
  scheduled: { label: 'Scheduled', color: 'hsl(215, 70%, 55%)' },
  no_show: { label: 'No Show', color: 'hsl(30, 70%, 55%)' },
  confirmed: { label: 'Confirmed', color: 'hsl(280, 60%, 55%)' },
} satisfies ChartConfig

const revenueConfig = {
  revenue: { label: 'Revenue', color: 'hsl(160, 60%, 45%)' },
  expenses: { label: 'Expenses', color: 'hsl(0, 70%, 55%)' },
} satisfies ChartConfig

const patientGrowthConfig = {
  patients: { label: 'New Patients', color: 'hsl(215, 70%, 55%)' },
} satisfies ChartConfig

const appointmentTrendConfig = {
  appointments: { label: 'Appointments', color: 'hsl(215, 70%, 55%)' },
} satisfies ChartConfig

const leadSourceConfig = {
  doctor: { label: 'Doctor', color: 'hsl(160, 60%, 45%)' },
  school: { label: 'School', color: 'hsl(215, 70%, 55%)' },
  parent_reference: { label: 'Parent Ref', color: 'hsl(280, 60%, 55%)' },
  social_media: { label: 'Social Media', color: 'hsl(30, 70%, 55%)' },
  advertisement: { label: 'Advertisement', color: 'hsl(0, 70%, 55%)' },
  website: { label: 'Website', color: 'hsl(45, 70%, 45%)' },
  walk_in: { label: 'Walk-in', color: 'hsl(170, 50%, 45%)' },
} satisfies ChartConfig

const leadStatusConfig = {
  new: { label: 'New', color: 'hsl(215, 70%, 55%)' },
  contacted: { label: 'Contacted', color: 'hsl(280, 60%, 55%)' },
  interested: { label: 'Interested', color: 'hsl(160, 60%, 45%)' },
  registered: { label: 'Registered', color: 'hsl(45, 70%, 45%)' },
  lost: { label: 'Lost', color: 'hsl(0, 70%, 55%)' },
} satisfies ChartConfig

const PIE_COLORS = ['hsl(160, 60%, 45%)', 'hsl(0, 0%, 70%)', 'hsl(215, 20%, 55%)']
const APPOINTMENT_COLORS: Record<string, string> = {
  completed: 'hsl(160, 60%, 45%)',
  cancelled: 'hsl(0, 70%, 55%)',
  no_show: 'hsl(30, 70%, 55%)',
  scheduled: 'hsl(215, 70%, 55%)',
  confirmed: 'hsl(280, 60%, 55%)',
  rescheduled: 'hsl(45, 70%, 55%)',
}

const LEAD_SOURCE_COLORS: Record<string, string> = {
  doctor: 'hsl(160, 60%, 45%)',
  school: 'hsl(215, 70%, 55%)',
  parent_reference: 'hsl(280, 60%, 55%)',
  social_media: 'hsl(30, 70%, 55%)',
  advertisement: 'hsl(0, 70%, 55%)',
  website: 'hsl(45, 70%, 45%)',
  walk_in: 'hsl(170, 50%, 45%)',
}

const LEAD_STATUS_COLORS: Record<string, string> = {
  new: 'hsl(215, 70%, 55%)',
  contacted: 'hsl(280, 60%, 55%)',
  interested: 'hsl(160, 60%, 45%)',
  registered: 'hsl(45, 70%, 45%)',
  lost: 'hsl(0, 70%, 55%)',
}

// Types for API responses
interface PatientRecord {
  id: string
  patientId: string
  childName: string
  status: string
  registrationDate: string
  createdAt: string
  gender: string
  mobile: string
}

interface AppointmentRecord {
  id: string
  title: string
  date: string
  status: string
  startTime: string
  endTime: string
  therapistId?: string
  patient: { childName: string; patientId: string }
}

interface PaymentRecord {
  id: string
  paymentNo: string
  amount: number
  date: string
  paymentMode: string
  patient: { childName: string; patientId: string }
}

interface ExpenseRecord {
  id: string
  category: string
  vendor?: string
  description?: string
  totalAmount: number
  date: string
}

interface InvoiceRecord {
  id: string
  invoiceNo: string
  totalAmount: number
  amountPaid: number
  balanceDue: number
  status: string
  date: string
  patient: { childName: string; patientId: string }
}

interface AttendanceRecord {
  id: string
  employeeId: string
  date: string
  status: string
  workingHours?: number
  employee: { name: string; employeeId: string; designation?: string }
}

interface PayrollRecord {
  id: string
  employeeId: string
  month: number
  year: number
  basicSalary: number
  hra: number
  allowances: number
  tds: number
  totalEarnings: number
  totalDeductions: number
  netSalary: number
  status: string
  employee: { name: string; employeeId: string; designation?: string; department?: string }
}

interface LeadRecord {
  id: string
  name: string
  mobile: string
  childName?: string
  concern?: string
  source?: string
  status: string
  assignedTo?: string
  createdAt: string
}

interface PackageAssignmentRecord {
  id: string
  name: string | null
  therapyType: string | null
  sessionsPurchased: number
  sessionsCompleted: number
  endDate: string
  status: string
  patient?: { childName: string; patientId: string }
  package?: { name: string }
}

// Helper: check if a date falls within the selected range
function isInRange(dateStr: string, startDateStr: string, endDateStr: string, mode: 'month' | 'custom', selectedMonth: number, selectedYear: number): boolean {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return false

  if (mode === 'month') {
    return d.getMonth() + 1 === selectedMonth && d.getFullYear() === selectedYear
  }

  if (mode === 'custom' && startDateStr && endDateStr) {
    const start = new Date(startDateStr)
    const end = new Date(endDateStr)
    end.setHours(23, 59, 59, 999)
    return d >= start && d <= end
  }

  // If custom mode but dates not set, show all
  return true
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('patients')
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [dateRangeMode, setDateRangeMode] = useState<'month' | 'custom'>('month')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [dateRangeError, setDateRangeError] = useState('')

  // Raw API data
  const [patients, setPatients] = useState<PatientRecord[]>([])
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([])
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([])
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [packageAssignments, setPackageAssignments] = useState<PackageAssignmentRecord[]>([])

  // Date range validation
  const isDateRangeInvalid = Boolean(dateRangeMode === 'custom' && startDate && endDate && new Date(startDate) > new Date(endDate))

  useEffect(() => {
    if (dateRangeMode === 'custom' && startDate && endDate) {
      if (new Date(startDate) > new Date(endDate)) {
        setDateRangeError('Start date cannot be after end date. Please select a valid date range.')
      } else {
        setDateRangeError('')
      }
    } else {
      setDateRangeError('')
    }
  }, [startDate, endDate, dateRangeMode])

  // Fetch data
  const fetchAllData = useCallback(async () => {
    setLoading(true)
    try {
      const results = await Promise.allSettled([
        authFetch('/api/patients?limit=1000').then(r => r.ok ? r.json() : { patients: [] }),
        authFetch('/api/appointments?limit=1000').then(r => r.ok ? r.json() : { appointments: [] }),
        authFetch('/api/payments?limit=1000').then(r => r.ok ? r.json() : { payments: [] }),
        authFetch('/api/expenses?limit=1000').then(r => r.ok ? r.json() : { expenses: [] }),
        authFetch('/api/invoices?limit=1000').then(r => r.ok ? r.json() : { invoices: [] }),
        authFetch(`/api/attendance?month=${selectedMonth}&year=${selectedYear}`).then(r => r.ok ? r.json() : { records: [] }),
        authFetch(`/api/payroll?month=${selectedMonth}&year=${selectedYear}`).then(r => r.ok ? r.json() : { records: [] }),
        authFetch('/api/leads?limit=1000').then(r => r.ok ? r.json() : { leads: [] }),
        authFetch('/api/packages?type=assignments&limit=1000').then(r => r.ok ? r.json() : { assignments: [] }),
      ])

      const patientData = results[0].status === 'fulfilled' ? results[0].value : { patients: [] }
      const appointmentData = results[1].status === 'fulfilled' ? results[1].value : { appointments: [] }
      const paymentData = results[2].status === 'fulfilled' ? results[2].value : { payments: [] }
      const expenseData = results[3].status === 'fulfilled' ? results[3].value : { expenses: [] }
      const invoiceData = results[4].status === 'fulfilled' ? results[4].value : { invoices: [] }
      const attendanceData = results[5].status === 'fulfilled' ? results[5].value : { records: [] }
      const payrollData = results[6].status === 'fulfilled' ? results[6].value : { records: [] }
      const leadData = results[7].status === 'fulfilled' ? results[7].value : { leads: [] }
      const packageData = results[8].status === 'fulfilled' ? results[8].value : { assignments: [] }

      setPatients(patientData.patients || [])
      setAppointments(appointmentData.appointments || [])
      setPayments(paymentData.payments || [])
      setExpenses(expenseData.expenses || [])
      setInvoices(invoiceData.invoices || [])
      setAttendanceRecords(attendanceData.records || [])
      setPayrollRecords(payrollData.records || [])
      setLeads(leadData.leads || [])
      setPackageAssignments(packageData.assignments || [])
    } catch {
      toast.error('Failed to load report data')
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, selectedYear])

  useEffect(() => {
    fetchAllData()
  }, [fetchAllData])

  // ========= COMPUTED CHART DATA =========

  // Filter helper: for records with a date field
  const filterByDateRange = useCallback(<T,>(items: T[], dateField: string): T[] => {
    return items.filter(item => {
      const dateStr = (item as Record<string, unknown>)[dateField] as string
      return isInRange(dateStr, startDate, endDate, dateRangeMode, selectedMonth, selectedYear)
    })
  }, [dateRangeMode, selectedMonth, selectedYear, startDate, endDate])

  // --- Patient Tab Data ---
  const filteredPatients = useMemo(() => {
    // For patients, show all for status chart, filter for growth
    return patients
  }, [patients])

  const patientStatusData = useMemo(() => {
    const counts: Record<string, number> = {}
    filteredPatients.forEach(p => {
      const status = p.status || 'active'
      counts[status] = (counts[status] || 0) + 1
    })
    const statusMap: Record<string, { label: string; color: string }> = {
      active: { label: 'Active', color: PIE_COLORS[0] },
      inactive: { label: 'Inactive', color: PIE_COLORS[1] },
      discharged: { label: 'Discharged', color: PIE_COLORS[2] },
    }
    return Object.entries(counts).map(([status, value]) => ({
      name: statusMap[status]?.label || status,
      value,
      color: statusMap[status]?.color || 'hsl(0, 0%, 50%)',
    }))
  }, [filteredPatients])

  const patientGrowthData = useMemo(() => {
    const monthCounts: Record<string, number> = {}
    // Show last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const key = format(d, 'MMM')
      monthCounts[key] = 0
    }
    patients.forEach(p => {
      const d = new Date(p.registrationDate || p.createdAt)
      const key = format(d, 'MMM')
      if (key in monthCounts) {
        monthCounts[key]++
      }
    })
    return Object.entries(monthCounts).map(([month, count]) => ({
      month,
      patients: count,
    }))
  }, [patients])

  const patientTableData = useMemo(() => {
    const filtered = filterByDateRange(patients, 'createdAt')
    return filtered.length > 0 ? filtered : patients.slice(0, 20)
  }, [patients, filterByDateRange])

  // Patient Summary table pagination
  const [patientPage, setPatientPage] = useState(1)
  const patientPageSize = 10
  const patientTotalPages = Math.max(1, Math.ceil(patientTableData.length / patientPageSize))
  const paginatedPatientTableData = useMemo(
    () => patientTableData.slice((patientPage - 1) * patientPageSize, patientPage * patientPageSize),
    [patientTableData, patientPage]
  )
  // Reset to page 1 whenever the underlying (filtered) data set changes
  useEffect(() => {
    setPatientPage(1)
  }, [patientTableData])

  // --- Appointment Tab Data ---
  const filteredAppointments = useMemo(() => {
    return filterByDateRange(appointments, 'date')
  }, [appointments, filterByDateRange])

  const appointmentStatusData = useMemo(() => {
    const counts: Record<string, number> = {}
    filteredAppointments.forEach(a => {
      const status = a.status || 'scheduled'
      counts[status] = (counts[status] || 0) + 1
    })
    return Object.entries(counts).map(([status, value]) => ({
      name: status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value,
      color: APPOINTMENT_COLORS[status] || 'hsl(0, 0%, 50%)',
    }))
  }, [filteredAppointments])

  const appointmentTrendData = useMemo(() => {
    const monthCounts: Record<string, number> = {}
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const key = format(d, 'MMM')
      monthCounts[key] = 0
    }
    appointments.forEach(a => {
      const d = new Date(a.date)
      const key = format(d, 'MMM')
      if (key in monthCounts) {
        monthCounts[key]++
      }
    })
    return Object.entries(monthCounts).map(([month, count]) => ({
      month,
      appointments: count,
    }))
  }, [appointments])

  const appointmentStats = useMemo(() => {
    const total = filteredAppointments.length
    const completed = filteredAppointments.filter(a => a.status === 'completed').length
    const cancelled = filteredAppointments.filter(a => a.status === 'cancelled').length
    const thisMonthAppts = appointmentTrendData.length > 0
      ? appointmentTrendData[appointmentTrendData.length - 1].appointments
      : 0
    const cancelRate = total > 0 ? Math.round((cancelled / total) * 100) : 0
    return { total, completed, cancelled, thisMonthAppts, cancelRate }
  }, [filteredAppointments, appointmentTrendData])

  // --- Financial Tab Data ---
  const filteredPayments = useMemo(() => {
    return filterByDateRange(payments, 'date')
  }, [payments, filterByDateRange])

  const filteredExpenses = useMemo(() => {
    return filterByDateRange(expenses, 'date')
  }, [expenses, filterByDateRange])

  const revenueExpenseData = useMemo(() => {
    const monthData: Record<string, { revenue: number; expenses: number }> = {}
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const key = format(d, 'MMM')
      monthData[key] = { revenue: 0, expenses: 0 }
    }
    payments.forEach(p => {
      const d = new Date(p.date)
      const key = format(d, 'MMM')
      if (key in monthData) {
        monthData[key].revenue += p.amount || 0
      }
    })
    expenses.forEach(e => {
      const d = new Date(e.date)
      const key = format(d, 'MMM')
      if (key in monthData) {
        monthData[key].expenses += e.totalAmount || 0
      }
    })
    return Object.entries(monthData).map(([month, data]) => ({
      month,
      revenue: Math.round(data.revenue),
      expenses: Math.round(data.expenses),
    }))
  }, [payments, expenses])

  const financialSummary = useMemo(() => {
    const totalRevenue = filteredPayments.reduce((s, p) => s + (p.amount || 0), 0)
    const totalExpenses = filteredExpenses.reduce((s, e) => s + (e.totalAmount || 0), 0)
    const netProfit = totalRevenue - totalExpenses
    return { totalRevenue, totalExpenses, netProfit }
  }, [filteredPayments, filteredExpenses])

  const outstandingPayments = useMemo(() => {
    return invoices
      .filter(inv => inv.balanceDue > 0)
      .map(inv => ({
        ...inv,
        overdue: inv.status === 'overdue' || (inv.balanceDue > 0 && new Date(inv.date) < new Date()),
      }))
  }, [invoices])

  // --- HR Tab Data ---
  const attendanceSummary = useMemo(() => {
    const empMap: Record<string, { name: string; present: number; absent: number; leave: number; halfDay: number }> = {}
    attendanceRecords.forEach(r => {
      const eid = r.employeeId
      if (!empMap[eid]) {
        empMap[eid] = { name: r.employee?.name || eid, present: 0, absent: 0, leave: 0, halfDay: 0 }
      }
      if (r.status === 'present') empMap[eid].present++
      else if (r.status === 'absent') empMap[eid].absent++
      else if (r.status === 'leave') empMap[eid].leave++
      else if (r.status === 'half_day') empMap[eid].halfDay++
    })
    return Object.values(empMap)
  }, [attendanceRecords])

  // --- Leads Tab Data ---
  const filteredLeads = useMemo(() => {
    return filterByDateRange(leads, 'createdAt')
  }, [leads, filterByDateRange])

  // Clinic-wide package status — expiring soon is "active" and within 15 days
  // of its end date, mirroring the same 15-day window used on the Packages page.
  const packageStats = useMemo(() => {
    const now = new Date()
    const soon = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)
    let active = 0, expiringSoon = 0, expired = 0, completed = 0
    for (const pp of packageAssignments) {
      if (pp.status === 'completed') completed++
      else if (pp.status === 'expired') expired++
      else if (pp.status === 'active') {
        active++
        const end = new Date(pp.endDate)
        if (end <= soon) expiringSoon++
      }
    }
    const expiringOrExpired = packageAssignments
      .filter((pp) => pp.status === 'expired' || (pp.status === 'active' && new Date(pp.endDate) <= soon))
      .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
    return { active, expiringSoon, expired, completed, total: packageAssignments.length, expiringOrExpired }
  }, [packageAssignments])

  const leadSourceData = useMemo(() => {
    const counts: Record<string, number> = {}
    filteredLeads.forEach(l => {
      const source = l.source || 'unknown'
      counts[source] = (counts[source] || 0) + 1
    })
    return Object.entries(counts).map(([source, value]) => ({
      name: source.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value,
      color: LEAD_SOURCE_COLORS[source] || 'hsl(0, 0%, 50%)',
    }))
  }, [filteredLeads])

  const leadStatusData = useMemo(() => {
    const counts: Record<string, number> = {}
    filteredLeads.forEach(l => {
      const status = l.status || 'new'
      counts[status] = (counts[status] || 0) + 1
    })
    // Map status values to display labels
    const statusLabels: Record<string, string> = {
      new: 'New',
      contacted: 'Contacted',
      interested: 'Interested',
      registered: 'Registered',
      lost: 'Dropped',
      dropped: 'Dropped',
    }
    return Object.entries(counts).map(([status, value]) => ({
      name: statusLabels[status] || status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value,
      fill: LEAD_STATUS_COLORS[status] || 'hsl(0, 0%, 50%)',
    }))
  }, [filteredLeads])

  const csvEscape = (value: unknown) => {
    if (value == null) return ''
    const text = String(value).replace(/"/g, '""')
    return `"${text}"`
  }

  const downloadCSV = (filename: string, headers: string[], rows: Array<Array<string | number | boolean | null>>) => {
    const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleExport = () => {
    if (isDateRangeInvalid) {
      toast.error('Please fix the date range error before exporting.')
      return
    }

    const reportDate = format(new Date(), 'yyyyMMdd')
    let filename = `reports-${reportDate}.csv`
    let headers: string[] = []
    let rows: Array<Array<string | number | boolean | null>> = []

    switch (activeTab) {
      case 'patients':
        filename = `patients-report-${reportDate}.csv`
        headers = ['Name', 'Patient ID', 'Status', 'Registered Date']
        rows = patientTableData.map((patient) => [
          patient.childName,
          patient.patientId,
          patient.status,
          format(new Date(patient.registrationDate || patient.createdAt), 'dd MMM yyyy'),
        ])
        break
      case 'appointments':
        filename = `appointments-report-${reportDate}.csv`
        headers = ['Title', 'Patient', 'Patient ID', 'Date', 'Start Time', 'End Time', 'Status']
        rows = filteredAppointments.map((appointment) => [
          appointment.title,
          appointment.patient.childName,
          appointment.patient.patientId,
          format(new Date(appointment.date), 'dd MMM yyyy'),
          appointment.startTime,
          appointment.endTime,
          appointment.status,
        ])
        break
      case 'financial':
        filename = `outstanding-payments-${reportDate}.csv`
        headers = ['Patient', 'Invoice', 'Amount Due', 'Date', 'Status']
        rows = outstandingPayments.map((invoice) => [
          invoice.patient?.childName || 'N/A',
          invoice.invoiceNo,
          formatCurrency(invoice.balanceDue),
          format(new Date(invoice.date), 'dd MMM yyyy'),
          invoice.overdue ? 'Overdue' : 'Pending',
        ])
        break
      case 'hr':
        if (payrollRecords.length > 0) {
          filename = `payroll-report-${reportDate}.csv`
          headers = ['Employee', 'Basic Salary', 'HRA', 'TDS', 'Deductions', 'Net Salary', 'Status']
          rows = payrollRecords.map((record) => [
            record.employee?.name || record.employeeId,
            formatCurrency(record.basicSalary),
            formatCurrency(record.hra),
            formatCurrency(record.tds || 0),
            formatCurrency(record.totalDeductions),
            formatCurrency(record.netSalary),
            record.status,
          ])
        } else {
          filename = `attendance-report-${reportDate}.csv`
          headers = ['Employee', 'Present', 'Absent', 'Leave', 'Half Day', 'Attendance %']
          rows = attendanceSummary.map((emp) => {
            const total = emp.present + emp.absent + emp.leave + emp.halfDay * 0.5
            return [
              emp.name,
              emp.present,
              emp.absent,
              emp.leave,
              emp.halfDay,
              total > 0 ? `${Math.round((emp.present / total) * 100)}%` : '0%',
            ]
          })
        }
        break
      case 'leads':
        filename = `leads-report-${reportDate}.csv`
        headers = ['Name', 'Child Name', 'Source', 'Status', 'Concern', 'Created Date']
        rows = filteredLeads.map((lead) => [
          lead.name,
          lead.childName || '—',
          (lead.source || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          lead.status === 'lost' || lead.status === 'dropped' ? 'Dropped' : lead.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          lead.concern || '—',
          format(new Date(lead.createdAt), 'dd MMM yyyy'),
        ])
        break
      default:
        filename = `reports-${reportDate}.csv`
        headers = ['Category', 'Value']
        rows = []
    }

    if (rows.length === 0) {
      toast.info('No data available for export')
      return
    }

    downloadCSV(filename, headers, rows)
    toast.success('Report exported successfully')
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports & Analytics</h1>
          <p className="text-muted-foreground text-sm">Comprehensive reports and data analytics</p>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={dateRangeMode} onValueChange={(v: 'month' | 'custom') => { setDateRangeMode(v); setStartDate(''); setEndDate(''); setDateRangeError('') }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Month / Year</SelectItem>
                <SelectItem value="custom">Custom Date Range</SelectItem>
              </SelectContent>
            </Select>
            {dateRangeMode === 'month' ? (
              <>
                <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m, i) => (
                      <SelectItem key={i + 1} value={(i + 1).toString()}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                  <SelectTrigger className="w-[90px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => (
                      <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="start-date" className="text-xs text-muted-foreground">Start</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-[150px] h-9"
                    />
                  </div>
                  <span className="text-muted-foreground mt-4">—</span>
                  <div className="space-y-1">
                    <Label htmlFor="end-date" className="text-xs text-muted-foreground">End</Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-[150px] h-9"
                    />
                  </div>
                </div>
              </>
            )}
            <Button variant="outline" onClick={handleExport} disabled={isDateRangeInvalid}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
          {dateRangeError && (
            <p className="text-sm text-red-600 font-medium">{dateRangeError}</p>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="patients" className="gap-1.5">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Patient</span>
          </TabsTrigger>
          <TabsTrigger value="appointments" className="gap-1.5">
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Appointment</span>
          </TabsTrigger>
          <TabsTrigger value="financial" className="gap-1.5">
            <IndianRupee className="h-4 w-4" />
            <span className="hidden sm:inline">Revenue & Finance</span>
          </TabsTrigger>
          <TabsTrigger value="hr" className="gap-1.5">
            <UserCog className="h-4 w-4" />
            <span className="hidden sm:inline">HR</span>
          </TabsTrigger>
          <TabsTrigger value="leads" className="gap-1.5">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">Leads</span>
          </TabsTrigger>
          <TabsTrigger value="packages" className="gap-1.5">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Packages</span>
          </TabsTrigger>
        </TabsList>

        {/* Patient Reports Tab */}
        <TabsContent value="patients" className="space-y-4 mt-4">
          {/* Stats Cards */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <Card className="p-4 gap-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Patients</p>
                  <p className="text-2xl font-bold">{patients.length}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                  <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </Card>
            <Card className="p-4 gap-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{patientStatusData.find(d => d.name === 'Active')?.value || 0}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
                  <TrendingUp className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                </div>
              </div>
            </Card>
            <Card className="p-4 gap-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">New This Month</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{patientGrowthData.length > 0 ? patientGrowthData[patientGrowthData.length - 1].patients : 0}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
                  <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            {/* Active vs Inactive Pie Chart */}
            <Card className="p-6">
              <CardHeader className="p-0 mb-4">
                <CardTitle className="text-base">Patient Status Distribution</CardTitle>
                <CardDescription>Active vs Inactive vs Discharged patients</CardDescription>
              </CardHeader>
              {patientStatusData.length > 0 ? (
                <>
                  <ChartContainer config={patientStatusConfig} className="h-[280px] w-full">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Pie
                        data={patientStatusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={4}
                        dataKey="value"
                        nameKey="name"
                      >
                        {patientStatusData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="flex justify-center gap-4 mt-2">
                    {patientStatusData.map((item) => (
                      <div key={item.name} className="flex items-center gap-1.5">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-xs text-muted-foreground">{item.name}: {item.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No patient data available</div>
              )}
            </Card>

            {/* Patient Growth Line Chart */}
            <Card className="p-6">
              <CardHeader className="p-0 mb-4">
                <CardTitle className="text-base">Patient Growth Trend</CardTitle>
                <CardDescription>New patient registrations over the last 6 months</CardDescription>
              </CardHeader>
              {patientGrowthData.some(d => d.patients > 0) ? (
                <ChartContainer config={patientGrowthConfig} className="h-[280px] w-full">
                  <LineChart data={patientGrowthData}>
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      type="monotone"
                      dataKey="patients"
                      stroke="var(--color-patients)"
                      strokeWidth={2.5}
                      dot={{ fill: 'var(--color-patients)', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ChartContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No patient growth data available</div>
              )}
            </Card>
          </div>

          {/* Patient Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Patient Summary</CardTitle>
              <CardDescription>List of patients with status</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Patient ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Registered</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedPatientTableData.length > 0 ? paginatedPatientTableData.map((patient) => (
                      <TableRow key={patient.id}>
                        <TableCell className="font-medium">{patient.childName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{patient.patientId}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              patient.status === 'active'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                                : patient.status === 'inactive'
                                  ? 'bg-gray-100 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400'
                                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                            }
                          >
                            {patient.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{format(new Date(patient.registrationDate || patient.createdAt), 'dd MMM yyyy')}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No patients found</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {patientTableData.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(patientPage - 1) * patientPageSize + 1}–{Math.min(patientPage * patientPageSize, patientTableData.length)} of {patientTableData.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={patientPage <= 1}
                      onClick={() => setPatientPage((p) => Math.max(1, p - 1))}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">Page {patientPage} of {patientTotalPages}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={patientPage >= patientTotalPages}
                      onClick={() => setPatientPage((p) => Math.min(patientTotalPages, p + 1))}
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appointment Reports Tab */}
        <TabsContent value="appointments" className="space-y-4 mt-4">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <Card className="p-4 gap-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">This Month</p>
                  <p className="text-2xl font-bold">{appointmentStats.thisMonthAppts}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
                  <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </Card>
            <Card className="p-4 gap-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{appointmentStats.completed}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                  <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </Card>
            <Card className="p-4 gap-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Cancellation Rate</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{appointmentStats.cancelRate}%</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/40">
                  <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            {/* Appointment Trend */}
            <Card className="p-6">
              <CardHeader className="p-0 mb-4">
                <CardTitle className="text-base">Appointment Trend</CardTitle>
                <CardDescription>Monthly appointment counts</CardDescription>
              </CardHeader>
              {appointmentTrendData.some(d => d.appointments > 0) ? (
                <ChartContainer config={appointmentTrendConfig} className="h-[280px] w-full">
                  <AreaChart data={appointmentTrendData}>
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <defs>
                      <linearGradient id="aptGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(215, 70%, 55%)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(215, 70%, 55%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="appointments"
                      stroke="hsl(215, 70%, 55%)"
                      fill="url(#aptGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No appointment trend data available</div>
              )}
            </Card>

            {/* Appointment Status Breakdown */}
            <Card className="p-6">
              <CardHeader className="p-0 mb-4">
                <CardTitle className="text-base">Status Breakdown</CardTitle>
                <CardDescription>Appointment status distribution</CardDescription>
              </CardHeader>
              {appointmentStatusData.length > 0 ? (
                <>
                  <ChartContainer config={appointmentStatusConfig} className="h-[280px] w-full">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Pie
                        data={appointmentStatusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={4}
                        dataKey="value"
                        nameKey="name"
                      >
                        {appointmentStatusData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="flex flex-wrap justify-center gap-3 mt-2">
                    {appointmentStatusData.map((item) => (
                      <div key={item.name} className="flex items-center gap-1.5">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-xs text-muted-foreground">{item.name}: {item.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No appointment status data available</div>
              )}
            </Card>
          </div>
        </TabsContent>

        {/* Revenue & Finance Tab */}
        <TabsContent value="financial" className="space-y-4 mt-4">
          {/* P&L Card */}
          <Card className="p-6">
            <CardHeader className="p-0 mb-4">
              <CardTitle className="text-base">Profit & Loss (Last 6 Months)</CardTitle>
            </CardHeader>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 mb-4">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(financialSummary.totalRevenue)}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Total Expenses</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">{formatCurrency(financialSummary.totalExpenses)}</p>
              </div>
              <div className={`rounded-lg border p-4 ${financialSummary.netProfit >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                <p className="text-sm text-muted-foreground">Net Profit</p>
                <p className={`text-xl font-bold ${financialSummary.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatCurrency(financialSummary.netProfit)}
                </p>
              </div>
            </div>
          </Card>

          {/* Revenue vs Expense Chart */}
          <Card className="p-6">
            <CardHeader className="p-0 mb-4">
              <CardTitle className="text-base">Revenue vs Expenses</CardTitle>
              <CardDescription>Monthly comparison</CardDescription>
            </CardHeader>
            {revenueExpenseData.some(d => d.revenue > 0 || d.expenses > 0) ? (
              <ChartContainer config={revenueConfig} className="h-[300px] w-full">
                <BarChart data={revenueExpenseData} barCategoryGap="20%">
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent formatter={(value) => formatCurrency(value as number)} />}
                  />
                  <Bar dataKey="revenue" fill="hsl(160, 60%, 45%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" fill="hsl(0, 70%, 55%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">No financial data available</div>
            )}
          </Card>

          {/* Outstanding Payments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Outstanding Payments</CardTitle>
              <CardDescription>Pending and overdue invoices</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead className="text-right">Amount Due</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outstandingPayments.length > 0 ? outstandingPayments.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.patient?.childName || 'N/A'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{inv.invoiceNo}</TableCell>
                        <TableCell className="text-right">{formatCurrency(inv.balanceDue)}</TableCell>
                        <TableCell className="text-sm">{format(new Date(inv.date), 'dd MMM yyyy')}</TableCell>
                        <TableCell>
                          <Badge className={inv.overdue ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400'}>
                            {inv.overdue ? 'Overdue' : 'Pending'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No outstanding payments</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* HR Reports Tab */}
        <TabsContent value="hr" className="space-y-4 mt-4">
          {/* Attendance Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attendance Summary</CardTitle>
              <CardDescription>Employee attendance for {months[selectedMonth - 1]} {selectedYear}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-center">Present</TableHead>
                      <TableHead className="text-center">Absent</TableHead>
                      <TableHead className="text-center">Leave</TableHead>
                      <TableHead className="text-center">Half Day</TableHead>
                      <TableHead className="text-right">Attendance %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendanceSummary.length > 0 ? attendanceSummary.map((emp) => {
                      const total = emp.present + emp.absent + emp.leave + emp.halfDay * 0.5
                      const pct = total > 0 ? Math.round((emp.present / total) * 100) : 0
                      return (
                        <TableRow key={emp.name}>
                          <TableCell className="font-medium">{emp.name}</TableCell>
                          <TableCell className="text-center">
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">{emp.present}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">{emp.absent}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400">{emp.leave}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">{emp.halfDay}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">{pct}%</TableCell>
                        </TableRow>
                      )
                    }) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No attendance data for this period</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Salary Register */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Salary Register</CardTitle>
              <CardDescription>Salary summary for {months[selectedMonth - 1]} {selectedYear}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Basic</TableHead>
                      <TableHead className="text-right">HRA</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Deductions</TableHead>
                      <TableHead className="text-right">Net Salary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payrollRecords.length > 0 ? payrollRecords.map((emp) => (
                      <TableRow key={emp.id}>
                        <TableCell className="font-medium">{emp.employee?.name || emp.employeeId}</TableCell>
                        <TableCell className="text-right">{formatCurrency(emp.basicSalary)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(emp.hra)}</TableCell>
                        <TableCell className="text-right hidden sm:table-cell text-red-600 dark:text-red-400">-{formatCurrency(emp.totalDeductions)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(emp.netSalary)}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No payroll data for this period</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leads Reports Tab */}
        <TabsContent value="leads" className="space-y-4 mt-4">
          {/* Stats Cards */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <Card className="p-4 gap-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Leads</p>
                  <p className="text-2xl font-bold">{filteredLeads.length}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/40">
                  <Target className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </Card>
            <Card className="p-4 gap-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Registered</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{filteredLeads.filter(l => l.status === 'registered').length}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                  <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </Card>
            <Card className="p-4 gap-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Conversion Rate</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {filteredLeads.length > 0 ? Math.round((filteredLeads.filter(l => l.status === 'registered').length / filteredLeads.length) * 100) : 0}%
                  </p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
                  <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            {/* Lead Source Pie Chart */}
            <Card className="p-6">
              <CardHeader className="p-0 mb-4">
                <CardTitle className="text-base">Lead Sources</CardTitle>
                <CardDescription>Distribution by source</CardDescription>
              </CardHeader>
              {leadSourceData.length > 0 ? (
                <>
                  <ChartContainer config={leadSourceConfig} className="h-[280px] w-full">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Pie
                        data={leadSourceData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={4}
                        dataKey="value"
                        nameKey="name"
                      >
                        {leadSourceData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="flex flex-wrap justify-center gap-3 mt-2">
                    {leadSourceData.map((item) => (
                      <div key={item.name} className="flex items-center gap-1.5">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-xs text-muted-foreground">{item.name}: {item.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No lead source data available</div>
              )}
            </Card>

            {/* Lead Status Bar Chart */}
            <Card className="p-6">
              <CardHeader className="p-0 mb-4">
                <CardTitle className="text-base">Lead Status</CardTitle>
                <CardDescription>Distribution by current status</CardDescription>
              </CardHeader>
              {leadStatusData.length > 0 ? (
                <ChartContainer config={leadStatusConfig} className="h-[280px] w-full">
                  <BarChart data={leadStatusData} barCategoryGap="20%">
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {leadStatusData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No lead status data available</div>
              )}
            </Card>
          </div>

          {/* Leads Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Leads Summary</CardTitle>
              <CardDescription>All leads with source and status</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Child</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Concern</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeads.length > 0 ? filteredLeads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell className="font-medium">{lead.name}</TableCell>
                        <TableCell className="text-sm">{lead.childName || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {(lead.source || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              lead.status === 'registered'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                                : lead.status === 'lost'
                                  ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                                  : lead.status === 'interested'
                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400'
                            }
                          >
                            {lead.status === 'lost' || lead.status === 'dropped' ? 'Dropped' : lead.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{lead.concern || '—'}</TableCell>
                        <TableCell className="text-sm">{format(new Date(lead.createdAt), 'dd MMM yyyy')}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No leads found</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Package Status Tab */}
        <TabsContent value="packages" className="space-y-4 mt-4">
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
            <Card className="p-4 gap-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{packageStats.active}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                  <Package className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </Card>
            <Card className="p-4 gap-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Expiring Soon</p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{packageStats.expiringSoon}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
                  <TrendingDown className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
            </Card>
            <Card className="p-4 gap-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Expired</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{packageStats.expired}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/40">
                  <Activity className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
              </div>
            </Card>
            <Card className="p-4 gap-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{packageStats.completed}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
                  <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Expiring &amp; Expired Packages</CardTitle>
              <CardDescription>Active packages within 15 days of their end date, plus any already expired — sorted soonest first.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Package</TableHead>
                      <TableHead>Therapy Type</TableHead>
                      <TableHead>Sessions</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {packageStats.expiringOrExpired.length > 0 ? packageStats.expiringOrExpired.map((pp) => (
                      <TableRow key={pp.id}>
                        <TableCell>
                          <p className="font-medium">{pp.patient?.childName || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{pp.patient?.patientId}</p>
                        </TableCell>
                        <TableCell className="text-sm">{pp.name || pp.package?.name || 'N/A'}</TableCell>
                        <TableCell className="text-sm">{pp.therapyType || '—'}</TableCell>
                        <TableCell className="text-sm">{pp.sessionsCompleted}/{pp.sessionsPurchased}</TableCell>
                        <TableCell className="text-sm">{format(new Date(pp.endDate), 'dd MMM yyyy')}</TableCell>
                        <TableCell>
                          <Badge className={pp.status === 'expired' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'}>
                            {pp.status === 'expired' ? 'Expired' : 'Expiring Soon'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No packages expiring or expired.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
