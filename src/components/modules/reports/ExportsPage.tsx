'use client'

import React, { useEffect, useState } from 'react'
import { format, differenceInYears, differenceInMonths, differenceInDays } from 'date-fns'
import {
  FileSpreadsheet,
  Download,
  Loader2,
  RotateCcw,
  Filter,
  Users,
  FileText,
  CalendarDays,
  ClipboardCheck,
  Receipt,
  IndianRupee,
  UserCog,
  CalendarOff,
  Wallet,
  KeyRound,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { authFetch } from '@/lib/api-client'
import { getRoleLabel, resolveDisplayDesignation } from '@/store/app-store'
import { toast } from 'sonner'

// ─── Shared helpers ────────────────────────────────────────────────────────

// Appointment "type" values that are too generic to be useful on their own
// (e.g. every walk-in appointment defaults to "therapy" regardless of the
// assigned therapist's actual specialization). When we see one of these,
// fall back to the assigned therapist's real role — the same label shown in
// User Management — instead of the generic word.
const GENERIC_APPT_TYPES = new Set(['therapy', 'consultation', ''])

function resolveAppointmentTypeLabel(
  rawType: string | null | undefined,
  therapistName: string | null | undefined,
  therapists: TherapistLite[]
): string {
  const raw = (rawType || '').trim()
  if (raw && !GENERIC_APPT_TYPES.has(raw.toLowerCase())) {
    return raw
  }
  const therapist = therapists.find((t) => t.name === therapistName)
  // An owner who also treats patients has role 'super_admin' — their
  // specialization / second role describes the session; their access role
  // ("Super Admin") never should.
  const roleLabel = therapist
    ? (therapist.therapyType?.trim() || getRoleLabel(therapist.secondaryRole || therapist.role) || '')
    : ''
  return roleLabel || raw
}

function titleCase(value: string): string {
  if (!value) return ''
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function calculateAge(dateOfBirth: string): string {
  const dob = new Date(dateOfBirth)
  const now = new Date()
  const years = differenceInYears(now, dob)
  const months = differenceInMonths(now, dob)
  const days = differenceInDays(now, dob)
  if (years > 0) return `${years}y ${months % 12}m`
  if (months > 0) return `${months}m ${days % 30}d`
  return `${days}d`
}

function formatTimeDisplay(time24: string): string {
  if (!time24) return ''
  const [h, m] = time24.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
}

const INVOICE_TYPE_LABELS: Record<string, string> = {
  invoice: 'Invoice',
  receipt: 'Receipt',
  advance_receipt: 'Advance Receipt',
  final_receipt: 'Final Receipt',
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function buildFilename(base: string, fromDate: string, toDate: string): string {
  return fromDate && toDate ? `${base}_${fromDate}_to_${toDate}.xlsx` : `${base}_All.xlsx`
}

function autoCols(headers: string[]) {
  return headers.map((h) => ({ wch: Math.max(String(h).length + 2, 12) }))
}

interface ExportResult {
  headers: (string | number)[]
  rows: (string | number)[][]
  sheetName: string
}

interface ModuleDef {
  key: string
  name: string
  description: string
  filenameBase: string
  icon: React.ReactNode
}

const MODULES: ModuleDef[] = [
  { key: 'patients', name: 'Patients', description: 'All patient records with contact details, age, and invoice summary.', filenameBase: 'Patients', icon: <Users className="h-5 w-5" /> },
  { key: 'patient-history', name: 'Patient History', description: 'Patient financial history — invoices, payments, and outstanding balances.', filenameBase: 'Patient_History', icon: <FileText className="h-5 w-5" /> },
  { key: 'appointments', name: 'Appointments', description: 'Scheduled, completed, cancelled, and rescheduled appointments.', filenameBase: 'Appointments', icon: <CalendarDays className="h-5 w-5" /> },
  { key: 'assessments', name: 'Assessments', description: 'Patient assessments with findings, recommendations, and status.', filenameBase: 'Assessments', icon: <ClipboardCheck className="h-5 w-5" /> },
  { key: 'billing', name: 'Billing & Invoices', description: 'Invoices, receipts, GST, and payment status.', filenameBase: 'Billing_Invoices', icon: <Receipt className="h-5 w-5" /> },
  { key: 'expenses', name: 'Expense Management', description: 'Center expenses across all categories and payment modes.', filenameBase: 'Expenses', icon: <IndianRupee className="h-5 w-5" /> },
  { key: 'employees', name: 'Employees', description: 'Employee records, salary structure, and bank details.', filenameBase: 'Employees', icon: <UserCog className="h-5 w-5" /> },
  { key: 'leaves', name: 'Leave Management', description: 'Employee leave requests, types, and approval status.', filenameBase: 'Leave_Management', icon: <CalendarOff className="h-5 w-5" /> },
  { key: 'payroll', name: 'Payroll Management', description: 'Monthly salary processing, deductions, and payout records.', filenameBase: 'Payroll', icon: <Wallet className="h-5 w-5" /> },
  { key: 'parent-login', name: 'Parent Login Management', description: 'Parent login credential status for every patient.', filenameBase: 'Parent_Login_Management', icon: <KeyRound className="h-5 w-5" /> },
]

interface TherapistLite {
  name: string
  role?: string
  secondaryRole?: string | null
  therapyType?: string | null
  designation?: string | null
}

export default function ExportsPage() {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [dateError, setDateError] = useState('')
  const [exportingKey, setExportingKey] = useState<string | null>(null)
  const [therapists, setTherapists] = useState<TherapistLite[]>([])
  // Sidebar already hides the "Exports" nav item when the plan lacks
  // exportData (see PAGE_FEATURE_REQUIREMENTS in app-sidebar.tsx), but that
  // only stops the link — a manually-forced #exports hash still rendered
  // this page. Guard the page itself the same way, fail-open on fetch error
  // to match the sidebar's own fail-open behavior (never block on a flaky
  // features lookup).
  const [exportsAllowed, setExportsAllowed] = useState(true)

  useEffect(() => {
    authFetch('/api/subscription/features')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.features && data.features.exportData === false) setExportsAllowed(false)
      })
      .catch(() => {})
  }, [])

  // Therapist designations are looked up once for the Appointments export
  // (avoids re-fetching the user directory on every export click).
  useEffect(() => {
    authFetch('/api/users')
      .then((res) => (res.ok ? res.json() : []))
      .then((json) => setTherapists(Array.isArray(json) ? json : []))
      .catch(() => setTherapists([]))
  }, [])

  const validateRange = (): boolean => {
    if (fromDate && toDate && fromDate > toDate) {
      setDateError('From Date cannot be greater than To Date.')
      return false
    }
    setDateError('')
    return true
  }

  const handleApply = () => {
    if (!validateRange()) {
      toast.error('From Date cannot be greater than To Date.')
      return
    }
    toast.success('Filters applied')
  }

  const handleReset = () => {
    setFromDate('')
    setToDate('')
    setModuleFilter('all')
    setDateError('')
  }

  const dateParams = () => {
    const params = new URLSearchParams({ page: '1', limit: '100000' })
    if (fromDate) params.set('fromDate', fromDate)
    if (toDate) params.set('toDate', toDate)
    return params
  }

  // ── Per-module fetch + column mapping ──────────────────────────────────

  const exportPatients = async (): Promise<ExportResult> => {
    const res = await authFetch(`/api/patients?${dateParams()}`)
    if (!res.ok) throw new Error('Failed to fetch patients')
    const data = await res.json()
    const all: any[] = data.patients || []
    const headers = ['Patient ID', 'Child Name', 'Gender', 'Age', 'Date of Birth', 'Parent', 'Mobile', 'Invoice Count', 'Total Amount', 'Amount Paid', 'Balance Due', 'Status']
    const rows = all.map((p) => [
      p.patientId, p.childName, p.gender, calculateAge(p.dateOfBirth),
      format(new Date(p.dateOfBirth), 'dd MMM yyyy'),
      p.parentName || p.fatherName || p.motherName || '-', p.mobile || '',
      p.invoiceSummary?.count ?? 0, p.invoiceSummary?.totalAmount ?? 0, p.invoiceSummary?.amountPaid ?? 0, p.invoiceSummary?.balanceDue ?? 0,
      titleCase(p.status || ''),
    ])
    return { headers, rows, sheetName: 'Patients' }
  }

  const exportPatientHistory = async (): Promise<ExportResult> => {
    const res = await authFetch(`/api/patients?${dateParams()}`)
    if (!res.ok) throw new Error('Failed to fetch patient history')
    const data = await res.json()
    const all: any[] = data.patients || []
    const headers = ['Patient ID', 'Child Name', 'Parent', 'Mobile', 'Diagnosis', 'Invoice Count', 'Total Invoiced', 'Amount Paid', 'Balance Due', 'Status']
    const rows = all.map((p) => [
      p.patientId, p.childName,
      p.parentName || p.fatherName || p.motherName || '-', p.mobile || '', p.diagnosis || '',
      p.invoiceSummary?.count ?? 0, p.invoiceSummary?.totalAmount ?? 0, p.invoiceSummary?.amountPaid ?? 0, p.invoiceSummary?.balanceDue ?? 0,
      titleCase(p.status || ''),
    ])
    return { headers, rows, sheetName: 'Patient History' }
  }

  const exportAppointments = async (): Promise<ExportResult> => {
    const res = await authFetch(`/api/appointments?${dateParams()}`)
    if (!res.ok) throw new Error('Failed to fetch appointments')
    const data = await res.json()
    const all: any[] = data.appointments || []
    const headers = ['Patient', 'Patient ID', 'Session/Title', 'Date', 'Start Time', 'End Time', 'Therapist', 'Designation', 'Type', 'Status', 'Notes']
    const rows = all.map((apt) => [
      apt.patient?.childName || apt.title || 'Unknown', apt.patient?.patientId || '', apt.title || '',
      format(new Date(apt.date), 'dd MMM yyyy'), formatTimeDisplay(apt.startTime), formatTimeDisplay(apt.endTime),
      apt.therapistId || '', (() => {
        const match = therapists.find((t) => t.name === apt.therapistId)
        return match ? resolveDisplayDesignation(match.designation, match.role, match.secondaryRole) : ''
      })(),
      resolveAppointmentTypeLabel(apt.type, apt.therapistId, therapists), titleCase(apt.status || ''), apt.notes || '',
    ])
    return { headers, rows, sheetName: 'Appointments' }
  }

  const exportAssessments = async (): Promise<ExportResult> => {
    const res = await authFetch(`/api/assessments?${dateParams()}`)
    if (!res.ok) throw new Error('Failed to fetch assessments')
    const data = await res.json()
    const all: any[] = data.assessments || []
    const headers = [
      'Patient', 'Patient ID', 'Type', 'Status', 'Scheduled Date', 'Scheduled Time',
      'Completed Date', 'Therapist', 'Scheduled By', 'Completed By', 'Reason',
      'Instructions', 'Findings', 'Therapist Notes', 'Recommendation', 'Next Assessment Date', 'Notes',
    ]
    const rows = all.map((a) => [
      a.patient?.childName || 'Unknown', a.patient?.patientId || '', a.type || '', titleCase(a.status || ''),
      a.scheduledDate ? format(new Date(a.scheduledDate), 'dd MMM yyyy') : '', a.scheduledTime || '',
      a.completedDate ? format(new Date(a.completedDate), 'dd MMM yyyy') : '',
      a.therapistName || '', a.scheduledBy || '', a.completedBy || '', a.reason || '', a.instructions || '',
      a.findings || '', a.therapistNotes || '', a.recommendation || '',
      a.nextAssessmentDate ? format(new Date(a.nextAssessmentDate), 'dd MMM yyyy') : '', a.notes || '',
    ])
    return { headers, rows, sheetName: 'Assessments' }
  }

  const exportBilling = async (): Promise<ExportResult> => {
    const res = await authFetch(`/api/invoices?${dateParams()}`)
    if (!res.ok) throw new Error('Failed to fetch invoices')
    const data = await res.json()
    const all: any[] = data.invoices || []
    const headers = [
      'Invoice No', 'Type', 'Patient', 'Patient ID', 'Date', 'Subtotal', 'Discount',
      'GST Applicable', 'CGST', 'SGST', 'Total Amount', 'Amount Paid', 'Balance Due',
      'Payment Mode', 'Status', 'Notes',
    ]
    const rows = all.map((inv) => [
      inv.invoiceNo, INVOICE_TYPE_LABELS[inv.type] || inv.type, inv.patient?.childName || 'N/A', inv.patient?.patientId || '',
      format(new Date(inv.date), 'dd MMM yyyy'), inv.subtotal, inv.discount, inv.gstApplicable ? 'Yes' : 'No',
      inv.cgst, inv.sgst, inv.totalAmount, inv.amountPaid, inv.balanceDue, inv.paymentMode || '',
      titleCase(inv.status || ''), inv.notes || '',
    ])
    return { headers, rows, sheetName: 'Invoices' }
  }

  const exportExpenses = async (): Promise<ExportResult> => {
    const res = await authFetch(`/api/expenses?${dateParams()}`)
    if (!res.ok) throw new Error('Failed to fetch expenses')
    const data = await res.json()
    const all: any[] = data.expenses || []
    const headers = ['Date', 'Category', 'Expense By', 'Vendor', 'Description', 'Amount', 'GST', 'Total', 'Payment Mode', 'Status']
    const rows = all.map((e) => [
      format(new Date(e.date), 'dd MMM yyyy'), titleCase(e.category || ''), e.approvedBy || '', e.vendor || '',
      e.description || '', e.amount, e.gst, e.totalAmount, titleCase(e.paymentMode || ''), titleCase(e.status || ''),
    ])
    return { headers, rows, sheetName: 'Expenses' }
  }

  const exportEmployees = async (): Promise<ExportResult> => {
    const res = await authFetch(`/api/employees?${dateParams()}`)
    if (!res.ok) throw new Error('Failed to fetch employees')
    const data = await res.json()
    const all: any[] = data.employees || []
    const headers = ['Employee ID', 'Name', 'Designation', 'Department', 'Mobile', 'Email', 'Join Date', 'Basic Salary', 'HRA', 'Allowances', 'Total Salary', 'Status']
    const rows = all.map((emp) => [
      emp.employeeId, emp.name, emp.designation || '', emp.department || '', emp.mobile, emp.email || '',
      emp.joinDate ? format(new Date(emp.joinDate), 'dd MMM yyyy') : '',
      emp.basicSalary, emp.hra, emp.allowances, emp.basicSalary + emp.hra + emp.allowances,
      titleCase(emp.status || ''),
    ])
    return { headers, rows, sheetName: 'Employees' }
  }

  const exportLeaves = async (): Promise<ExportResult> => {
    const res = await authFetch(`/api/leaves?${dateParams()}`)
    if (!res.ok) throw new Error('Failed to fetch leave records')
    const data = await res.json()
    const all: any[] = data.leaves || []
    const headers = ['Employee', 'Employee ID', 'Leave Type', 'Start Date', 'End Date', 'Total Days', 'Reason', 'Status', 'Approved By']
    const rows = all.map((l) => [
      l.employee?.name || '', l.employee?.employeeId || '', titleCase(l.leaveType || ''),
      format(new Date(l.startDate), 'dd MMM yyyy'), format(new Date(l.endDate), 'dd MMM yyyy'),
      l.totalDays, l.reason || '', titleCase(l.status || ''), l.approvedBy || '',
    ])
    return { headers, rows, sheetName: 'Leave Management' }
  }

  const exportPayroll = async (): Promise<ExportResult> => {
    const res = await authFetch(`/api/payroll?${dateParams()}`)
    if (!res.ok) throw new Error('Failed to fetch payroll')
    const data = await res.json()
    const all: any[] = data.records || []
    const headers = [
      'Employee', 'Employee ID', 'Designation', 'Period', 'Basic Salary', 'HRA', 'Allowances',
      'Incentives', 'Bonus', 'Total Earnings', 'Leave Deduction', 'PF', 'ESI', 'Professional Tax',
      'Advance Recovery', 'TDS', 'Total Deductions', 'Net Salary', 'Status', 'Paid Date',
    ]
    const rows = all.map((r) => [
      r.employee?.name || '', r.employee?.employeeId || '', r.employee?.designation || '',
      `${MONTHS[r.month - 1]} ${r.year}`,
      r.basicSalary, r.hra, r.allowances, r.incentives, r.bonus, r.totalEarnings,
      r.leaveDeduction, r.pf, r.esi, r.professionalTax, r.advanceRecovery, r.tds, r.totalDeductions,
      r.netSalary, titleCase(r.status || ''), r.paidDate ? format(new Date(r.paidDate), 'dd MMM yyyy') : '',
    ])
    return { headers, rows, sheetName: 'Payroll' }
  }

  const exportParentLogin = async (): Promise<ExportResult> => {
    const [patientsRes, usersRes] = await Promise.all([
      authFetch(`/api/patients?${dateParams()}`),
      authFetch('/api/users?role=parent'),
    ])
    if (!patientsRes.ok) throw new Error('Failed to fetch patients')
    const patientsData = await patientsRes.json()
    const all: any[] = patientsData.patients || []
    const parentUsers: any[] = usersRes.ok ? await usersRes.json().then((j) => (Array.isArray(j) ? j : [])) : []
    const hasCredentials = (patient: any) =>
      parentUsers.some((u) => u.patientId === patient.id || (u.email && u.email === patient.email))
    const headers = ['Patient ID', 'Child Name', 'Parent Name', 'Mobile', 'Email', 'Login Status']
    const rows = all.map((p) => [
      p.patientId, p.childName, p.parentName || '', p.mobile || '', p.email || '',
      hasCredentials(p) ? 'Active' : 'Not Created',
    ])
    return { headers, rows, sheetName: 'Parent Login Management' }
  }

  const EXPORT_FNS: Record<string, () => Promise<ExportResult>> = {
    patients: exportPatients,
    'patient-history': exportPatientHistory,
    appointments: exportAppointments,
    assessments: exportAssessments,
    billing: exportBilling,
    expenses: exportExpenses,
    employees: exportEmployees,
    leaves: exportLeaves,
    payroll: exportPayroll,
    'parent-login': exportParentLogin,
  }

  const runExport = async (moduleKey: string) => {
    if (!validateRange()) {
      toast.error('From Date cannot be greater than To Date.')
      return
    }
    if (exportingKey) return
    const moduleDef = MODULES.find((m) => m.key === moduleKey)
    if (!moduleDef) return
    setExportingKey(moduleKey)
    try {
      const { headers, rows, sheetName } = await EXPORT_FNS[moduleKey]()
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      ws['!cols'] = autoCols(headers.map(String))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
      XLSX.writeFile(wb, buildFilename(moduleDef.filenameBase, fromDate, toDate))
      toast.success(`${moduleDef.name} exported successfully (${rows.length} record${rows.length === 1 ? '' : 's'}).`)
    } catch (err) {
      console.error(`Failed to export ${moduleDef.name}:`, err)
      toast.error(`Failed to export ${moduleDef.name}. Please try again.`)
    } finally {
      setExportingKey(null)
    }
  }

  const visibleModules = moduleFilter === 'all' ? MODULES : MODULES.filter((m) => m.key === moduleFilter)

  if (!exportsAllowed) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Exports</h1>
            <p className="text-sm text-muted-foreground">Export Excel reports for any module, optionally scoped to a date range</p>
          </div>
        </div>
        <Card className="border-2">
          <CardContent className="p-8 text-center space-y-2">
            <h3 className="font-semibold text-base">Exports not included in your current plan</h3>
            <p className="text-sm text-muted-foreground">Upgrade your subscription plan to unlock Excel exports for this organization.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Exports</h1>
            <p className="text-sm text-muted-foreground">Export Excel reports for any module, optionally scoped to a date range</p>
          </div>
        </div>
      </div>

      {/* Date + Module filters */}
      <Card className="border-2">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="h-4 w-4" />
            Filters
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">From Date</Label>
              <DatePicker value={fromDate} onChange={setFromDate} placeholder="Any" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">To Date</Label>
              <DatePicker value={toDate} onChange={setToDate} placeholder="Any" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Module</Label>
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Modules" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modules</SelectItem>
                  {MODULES.map((m) => (
                    <SelectItem key={m.key} value={m.key}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={handleReset} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button onClick={handleApply} className="gap-2">
              <Filter className="h-4 w-4" />
              Apply Filter
            </Button>
          </div>
          {dateError && <p className="text-xs font-medium text-destructive">{dateError}</p>}
          {!dateError && (fromDate || toDate) && (
            <p className="text-xs text-muted-foreground">
              Exports will include records from {fromDate ? format(new Date(fromDate), 'dd MMM yyyy') : 'the beginning'} to {toDate ? format(new Date(toDate), 'dd MMM yyyy') : 'today'}.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Export cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleModules.map((m) => {
          const isExporting = exportingKey === m.key
          return (
            <Card key={m.key} className="border-2 hover:shadow-md transition-shadow">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                    {m.icon}
                  </div>
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-base">{m.name}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{m.description}</p>
                </div>
                <Button
                  className="w-full gap-2"
                  onClick={() => runExport(m.key)}
                  disabled={isExporting}
                >
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {isExporting ? 'Exporting...' : 'Export to Excel'}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
