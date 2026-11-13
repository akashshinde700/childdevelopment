'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { printHTMLDocument, escapeHTML as esc } from '@/components/print/DocumentLayout'
import { usePrintSettings } from '@/components/print/PrintSettingsDialog'
import {
  Wallet,
  Plus,
  Printer,
  ChevronLeft,
  ChevronRight,
  Banknote,
  TrendingDown,
  TrendingUp,
  FileText,
  Pencil,
  Loader2,
  Download,
  Sparkles,
  Unlock,
  CalendarClock,
  Blend,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useAppStore } from '@/store/app-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { authFetch } from '@/lib/api-client'

// Types
interface Employee {
  id: string
  employeeId: string
  name: string
  designation: string | null
  department: string | null
  basicSalary: number
  hra: number
  allowances: number
}

// Employee data as returned by payroll API (limited select)
interface PayrollEmployee {
  name: string
  employeeId: string
  designation: string | null
  department: string | null
}

interface PayrollRecord {
  id: string
  employeeId: string
  month: number
  year: number
  basicSalary: number
  hra: number
  allowances: number
  incentives: number
  bonus: number
  sessionEarnings: number
  totalEarnings: number
  leaveDeduction: number
  pf: number
  esi: number
  professionalTax: number
  advanceRecovery: number
  tds: number
  totalDeductions: number
  netSalary: number
  status: string
  paidDate: string | null
  notes: string | null
  createdAt: string
  employee: PayrollEmployee
}

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

// Payroll payment status badge — just two states. Anything that isn't
// literally 'paid' (including legacy 'draft'/'processed' rows from before
// this was simplified, or a null/missing value) reads as Unpaid.
function getPayrollStatusBadge(status: string) {
  if (status === 'paid') {
    return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">🟢 Paid</Badge>
  }
  return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">🟡 Unpaid</Badge>
}

export default function PayrollPage() {
  const { user } = useAppStore()
  const isSuperAdmin = user?.role === 'super_admin'
  const { choosePrintMode, PrintSettingsDialog } = usePrintSettings()
  const [records, setRecords] = useState<PayrollRecord[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [generatingMonth, setGeneratingMonth] = useState(false)
  const [generatingSession, setGeneratingSession] = useState(false)
  const [generatingHybrid, setGeneratingHybrid] = useState(false)
  const [unlockingId, setUnlockingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PayrollRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [slipBreakdown, setSlipBreakdown] = useState<{ serviceType: string; rateType: string; sessions: number; amount: number; avgRate: number }[]>([])

  // Month/Year selector
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  // Summary
  const [summary, setSummary] = useState({
    totalEarnings: 0,
    totalDeductions: 0,
    totalNetSalary: 0,
  })

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [slipDialogOpen, setSlipDialogOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)
  const [editingRecord, setEditingRecord] = useState<PayrollRecord | null>(null)

  // Form
  const [formData, setFormData] = useState({
    employeeId: '',
    basicSalary: 0,
    hra: 0,
    allowances: 0,
    incentives: 0,
    bonus: 0,
    leaveDeduction: 0,
    pf: 0,
    esi: 0,
    professionalTax: 200,
    advanceRecovery: 0,
    tds: 0,
    status: 'unpaid',
  })

  // Fetch employees
  const fetchEmployees = useCallback(async () => {
    try {
      const res = await authFetch('/api/employees?limit=100&status=active')
      if (res.ok) {
        const json = await res.json()
        setEmployees(json.employees || [])
      }
    } catch (err) {
      console.error('Failed to fetch employees:', err)
      toast.error('Failed to load employees')
    }
  }, [])

  // Fetch payroll records
  const fetchPayroll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`/api/payroll?month=${selectedMonth}&year=${selectedYear}`)
      if (res.ok) {
        const json = await res.json()
        setRecords(json.records || [])
        setSummary(json.summary || { totalEarnings: 0, totalDeductions: 0, totalNetSalary: 0 })
      }
    } catch (err) {
      console.error('Failed to fetch payroll:', err)
      toast.error('Failed to load payroll records')
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, selectedYear])

  useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees])

  useEffect(() => {
    fetchPayroll()
  }, [fetchPayroll])

  // Auto-calculate totals when form changes
  const totalEarnings = formData.basicSalary + formData.hra + formData.allowances + formData.incentives + formData.bonus
  const totalDeductions = formData.leaveDeduction + formData.pf + formData.esi + formData.professionalTax + formData.advanceRecovery + formData.tds
  const netSalary = totalEarnings - totalDeductions

  // Open dialog to process payroll
  const handleProcessPayroll = () => {
    setEditingRecord(null)
    setFormData({
      employeeId: '',
      basicSalary: 0,
      hra: 0,
      allowances: 0,
      incentives: 0,
      bonus: 0,
      leaveDeduction: 0,
      pf: 0,
      esi: 0,
      professionalTax: 200,
      advanceRecovery: 0,
      tds: 0,
      status: 'unpaid',
    })
    setDialogOpen(true)
  }

  // Open dialog to edit existing draft payroll
  const handleEditPayroll = (record: PayrollRecord) => {
    setEditingRecord(record)
    setFormData({
      employeeId: record.employeeId,
      basicSalary: record.basicSalary,
      hra: record.hra,
      allowances: record.allowances,
      incentives: record.incentives,
      bonus: record.bonus,
      leaveDeduction: record.leaveDeduction,
      pf: record.pf,
      esi: record.esi,
      professionalTax: record.professionalTax,
      advanceRecovery: record.advanceRecovery,
      tds: record.tds,
      status: record.status,
    })
    setDialogOpen(true)
  }

  // Auto-fill salary when employee selected
  const handleEmployeeSelect = (empId: string) => {
    const emp = employees.find((e) => e.id === empId)
    if (emp) {
      setFormData((prev) => ({
        ...prev,
        employeeId: empId,
        basicSalary: emp.basicSalary,
        hra: emp.hra,
        allowances: emp.allowances,
        pf: Math.round(emp.basicSalary * 0.12),
        esi: Math.round((emp.basicSalary + emp.hra) * 0.0075),
      }))
    }
  }

  // Submit payroll
  const handleSubmit = async () => {
    if (!formData.employeeId) {
      toast.error('Please select an employee')
      return
    }

    setSubmitting(true)
    try {
      if (editingRecord) {
        // Update existing payroll record via PUT
        const res = await authFetch('/api/payroll', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingRecord.id,
            ...formData,
          }),
        })

        if (res.ok) {
          toast.success('Payroll updated successfully')
          setDialogOpen(false)
          setEditingRecord(null)
          fetchPayroll()
        } else {
          toast.error('Failed to update payroll')
        }
      } else {
        const res = await authFetch('/api/payroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            month: selectedMonth,
            year: selectedYear,
          }),
        })

        if (res.ok) {
          toast.success('Payroll processed successfully')
          setDialogOpen(false)
          fetchPayroll()
        } else {
          toast.error('Failed to process payroll')
        }
      }
    } catch {
      toast.error(editingRecord ? 'Failed to update payroll' : 'Failed to process payroll')
    } finally {
      setSubmitting(false)
    }
  }

  // Mark as processed/paid
  const handleStatusUpdate = async (recordId: string, status: string) => {
    if (updatingStatusId) return
    setUpdatingStatusId(recordId)
    try {
      const res = await authFetch('/api/payroll', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordId, status }),
      })
      if (res.ok) {
        toast.success(`Payroll marked as ${status}`)
        fetchPayroll()
      } else {
        toast.error('Failed to update status')
      }
    } catch {
      toast.error('Failed to update status')
    } finally {
      setUpdatingStatusId(null)
    }
  }

  // Generate Payroll for every active employee in one click (Payroll Engine)
  // — folds each therapist's accrued session/assessment earnings for the
  // selected month into their record, alongside the existing single-employee
  // "Process Payroll" flow above.
  // Session earnings silently stay ₹0 for a therapist whose completed
  // sessions have no configured rate (see generatePayrollForEmployee's
  // unratedSessionCount) — without this, that looked identical to "Generate
  // did nothing," when the real fix is adding a rate in Session Rates.
  const warnUnrated = (unratedEmployees?: { employeeName: string; count: number }[]) => {
    if (!unratedEmployees?.length) return
    const detail = unratedEmployees.map((e) => `${e.employeeName} (${e.count})`).join(', ')
    toast.warning(`${unratedEmployees.length} therapist${unratedEmployees.length === 1 ? '' : 's'} have completed sessions with no configured rate — earnings are understated: ${detail}. Add a rate in Session Rates.`)
  }

  const handleGenerateMonth = async () => {
    if (generatingMonth) return
    setGeneratingMonth(true)
    try {
      const res = await authFetch('/api/payroll/generate-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth, year: selectedYear }),
      })
      if (res.ok) {
        const json = await res.json()
        toast.success(`Generated payroll for ${json.generated} employee${json.generated === 1 ? '' : 's'}${json.skipped?.length ? `, ${json.skipped.length} skipped (already processed/paid)` : ''}`)
        warnUnrated(json.unratedEmployees)
        fetchPayroll()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to generate payroll for the month')
      }
    } catch {
      toast.error('Failed to generate payroll for the month')
    } finally {
      setGeneratingMonth(false)
    }
  }

  // Generate Payroll only for Per-Session employees (Employee.paymentType,
  // falling back to CenterSettings.payrollSalaryMode, resolves to PER_SESSION)
  // — separate from "Generate for Month" so Monthly-salary staff are never
  // touched by this action; pulls in any session earnings accrued after the
  // last generate for those employees.
  const handleGenerateSessionPayroll = async () => {
    if (generatingSession) return
    setGeneratingSession(true)
    try {
      const res = await authFetch('/api/payroll/generate-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth, year: selectedYear, onlyPaymentType: 'PER_SESSION' }),
      })
      if (res.ok) {
        const json = await res.json()
        toast.success(`Generated session payroll for ${json.generated} employee${json.generated === 1 ? '' : 's'}${json.skipped?.length ? `, ${json.skipped.length} skipped (already processed/paid)` : ''}`)
        warnUnrated(json.unratedEmployees)
        fetchPayroll()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to generate session payroll')
      }
    } catch {
      toast.error('Failed to generate session payroll')
    } finally {
      setGeneratingSession(false)
    }
  }

  // Same as above but for HYBRID employees — kept as a separate action so
  // Monthly and pure Per-Session staff are never touched by it either.
  const handleGenerateHybridPayroll = async () => {
    if (generatingHybrid) return
    setGeneratingHybrid(true)
    try {
      const res = await authFetch('/api/payroll/generate-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth, year: selectedYear, onlyPaymentType: 'HYBRID' }),
      })
      if (res.ok) {
        const json = await res.json()
        toast.success(`Generated hybrid payroll for ${json.generated} employee${json.generated === 1 ? '' : 's'}${json.skipped?.length ? `, ${json.skipped.length} skipped (already processed/paid)` : ''}`)
        warnUnrated(json.unratedEmployees)
        fetchPayroll()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to generate hybrid payroll')
      }
    } catch {
      toast.error('Failed to generate hybrid payroll')
    } finally {
      setGeneratingHybrid(false)
    }
  }

  // Unlock a payroll record — frees its locked TherapistEarning rows (so
  // their source Appointment/Assessment can be edited again) and removes the
  // record so it can be cleanly regenerated. Super Admin only.
  const handleUnlock = async (record: PayrollRecord) => {
    if (unlockingId) return
    if (!window.confirm(`Unlock ${record.employee.name}'s payroll for ${months[record.month - 1]} ${record.year}? This removes the record and lets its sessions be edited again — you'll need to regenerate it afterward.`)) {
      return
    }
    setUnlockingId(record.id)
    try {
      const res = await authFetch('/api/payroll/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payrollRecordId: record.id }),
      })
      if (res.ok) {
        toast.success('Payroll unlocked')
        fetchPayroll()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to unlock payroll')
      }
    } catch {
      toast.error('Failed to unlock payroll')
    } finally {
      setUnlockingId(null)
    }
  }

  // Delete a payroll record outright — same underlying safety as Unlock
  // (frees any linked TherapistEarning rows first so they aren't orphaned
  // by a dangling payrollRecordId and stay eligible for a future generate),
  // but a plain destructive action for records that never had — or no
  // longer need — a "regenerate afterward" follow-up. Blocked server-side
  // once status is 'paid', mirrored here so the button is disabled instead
  // of round-tripping to find that out.
  const handleDeletePayroll = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      const res = await authFetch(`/api/payroll?id=${deleteTarget.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Payroll deleted successfully.')
        setDeleteTarget(null)
        fetchPayroll()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to delete payroll')
      }
    } catch {
      toast.error('Failed to delete payroll')
    } finally {
      setDeleting(false)
    }
  }

  // View salary slip
  const handleViewSlip = async (record: PayrollRecord) => {
    setSelectedRecord(record)
    setSlipDialogOpen(true)
    setSlipBreakdown([])
    if (record.sessionEarnings > 0) {
      try {
        const res = await authFetch(`/api/payroll/earnings?month=${record.month}&year=${record.year}&employeeId=${record.employeeId}`)
        if (res.ok) {
          const json = await res.json()
          setSlipBreakdown(json.breakdown || [])
        }
      } catch { /* silent — slip still shows the sessionEarnings total */ }
    }
  }

  const [exportingPayroll, setExportingPayroll] = useState(false)
  const handleExportPayroll = async () => {
    if (exportingPayroll) return
    setExportingPayroll(true)
    try {
      const XLSX = await import('xlsx')
      const headers = [
        'Employee', 'Employee ID', 'Designation', 'Period', 'Basic Salary', 'HRA', 'Allowances',
        'Incentives', 'Bonus', 'Session Earnings', 'Total Earnings', 'Leave Deduction', 'PF', 'ESI', 'Professional Tax',
        'Advance Recovery', 'TDS', 'Total Deductions', 'Net Salary', 'Status', 'Paid Date',
      ]
      const rows = records.map((r) => [
        r.employee.name,
        r.employee.employeeId,
        r.employee.designation || '',
        `${months[selectedMonth - 1]} ${selectedYear}`,
        r.basicSalary,
        r.hra,
        r.allowances,
        r.incentives,
        r.bonus,
        r.sessionEarnings,
        r.totalEarnings,
        r.leaveDeduction,
        r.pf,
        r.esi,
        r.professionalTax,
        r.advanceRecovery,
        r.tds,
        r.totalDeductions,
        r.netSalary,
        r.status.charAt(0).toUpperCase() + r.status.slice(1),
        r.paidDate ? format(new Date(r.paidDate), 'dd MMM yyyy') : '',
      ])

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Payroll')
      XLSX.writeFile(wb, `Payroll_${months[selectedMonth - 1]}_${selectedYear}.xlsx`)
    } finally {
      setExportingPayroll(false)
    }
  }

  return (
    <div className="space-y-6">
      {PrintSettingsDialog}
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payroll Management</h1>
          <p className="text-muted-foreground text-sm">Process and manage employee salaries</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportPayroll} disabled={exportingPayroll}>
            <Download className="h-4 w-4 mr-2" />
            {exportingPayroll ? 'Exporting…' : 'Export'}
          </Button>
          <Button variant="outline" onClick={handleGenerateMonth} disabled={generatingMonth}>
            {generatingMonth ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Generate for Month
          </Button>
          <Button variant="outline" onClick={handleGenerateSessionPayroll} disabled={generatingSession}>
            {generatingSession ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CalendarClock className="h-4 w-4 mr-2" />}
            Generate Session Payroll
          </Button>
          <Button variant="outline" onClick={handleGenerateHybridPayroll} disabled={generatingHybrid}>
            {generatingHybrid ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Blend className="h-4 w-4 mr-2" />}
            Generate Hybrid Payroll
          </Button>
          <Button onClick={handleProcessPayroll}>
            <Plus className="h-4 w-4 mr-2" />
            Process Payroll
          </Button>
        </div>
      </div>

      {/* Month/Year Selector */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Period:</span>
          </div>
          <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m, i) => (
                <SelectItem key={i + 1} value={(i + 1).toString()}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-full sm:w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 8 }, (_, i) => now.getFullYear() - 3 + i).map((y) => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card className="p-4 gap-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-medium">Total Earnings</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(summary.totalEarnings)}</p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
        </Card>
        <Card className="p-4 gap-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-medium">Total Deductions</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(summary.totalDeductions)}</p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/40">
              <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </Card>
        <Card className="p-4 gap-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-medium">Net Salary (Total)</p>
              <p className="text-2xl font-bold">{formatCurrency(summary.totalNetSalary)}</p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Banknote className="h-5 w-5 text-primary" />
            </div>
          </div>
        </Card>
      </div>

      {/* Payroll Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payroll - {months[selectedMonth - 1]} {selectedYear}</CardTitle>
          <CardDescription>{records.length} employees</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Wallet className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-muted-foreground text-sm">No payroll records for {months[selectedMonth - 1]} {selectedYear}</p>
              <Button variant="outline" size="sm" onClick={handleProcessPayroll} className="mt-2">
                <Plus className="h-4 w-4 mr-1" />
                Process Payroll
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="hidden lg:table-cell">Designation</TableHead>
                    {/* Earnings */}
                    <TableHead className="text-right hidden xl:table-cell">Basic</TableHead>
                    <TableHead className="text-right hidden xl:table-cell">HRA</TableHead>
                    <TableHead className="text-right hidden xl:table-cell">Allow.</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Incentive</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Bonus</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Session</TableHead>
                    {/* Deductions */}
                    <TableHead className="text-right hidden xl:table-cell">Leave Ded.</TableHead>
                    <TableHead className="text-right hidden xl:table-cell">PF</TableHead>
                    <TableHead className="text-right hidden xl:table-cell">ESI</TableHead>
                    <TableHead className="text-right hidden xl:table-cell">Prof Tax</TableHead>
                    <TableHead className="text-right hidden xl:table-cell">Advance</TableHead>
                    <TableHead className="text-right hidden xl:table-cell">TDS</TableHead>
                    {/* Net */}
                    <TableHead className="text-right">Net Salary</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{record.employee.name}</p>
                          <p className="text-xs text-muted-foreground">{record.employee.employeeId}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">{record.employee.designation || '-'}</TableCell>
                      {/* Earnings */}
                      <TableCell className="text-right hidden xl:table-cell text-sm">{formatCurrency(record.basicSalary)}</TableCell>
                      <TableCell className="text-right hidden xl:table-cell text-sm">{formatCurrency(record.hra)}</TableCell>
                      <TableCell className="text-right hidden xl:table-cell text-sm">{formatCurrency(record.allowances)}</TableCell>
                      <TableCell className="text-right hidden lg:table-cell text-sm">{formatCurrency(record.incentives)}</TableCell>
                      <TableCell className="text-right hidden lg:table-cell text-sm">{formatCurrency(record.bonus)}</TableCell>
                      <TableCell className="text-right hidden lg:table-cell text-sm text-emerald-600 dark:text-emerald-400">{formatCurrency(record.sessionEarnings)}</TableCell>
                      {/* Deductions */}
                      <TableCell className="text-right hidden xl:table-cell text-sm text-red-600 dark:text-red-400">-{formatCurrency(record.leaveDeduction)}</TableCell>
                      <TableCell className="text-right hidden xl:table-cell text-sm text-red-600 dark:text-red-400">-{formatCurrency(record.pf)}</TableCell>
                      <TableCell className="text-right hidden xl:table-cell text-sm text-red-600 dark:text-red-400">-{formatCurrency(record.esi)}</TableCell>
                      <TableCell className="text-right hidden xl:table-cell text-sm text-red-600 dark:text-red-400">-{formatCurrency(record.professionalTax)}</TableCell>
                      <TableCell className="text-right hidden xl:table-cell text-sm text-red-600 dark:text-red-400">-{formatCurrency(record.advanceRecovery)}</TableCell>
                      <TableCell className="text-right hidden xl:table-cell text-sm text-red-600 dark:text-red-400">-{formatCurrency(record.tds)}</TableCell>
                      {/* Net */}
                      <TableCell className="text-right font-semibold">{formatCurrency(record.netSalary)}</TableCell>
                      <TableCell>{getPayrollStatusBadge(record.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleViewSlip(record)} title="Salary Slip">
                            <Printer className="h-4 w-4" />
                          </Button>
                          {record.status !== 'paid' && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20" onClick={() => handleEditPayroll(record)} title="Edit Payroll">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {record.status !== 'paid' ? (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" onClick={() => handleStatusUpdate(record.id, 'paid')} disabled={updatingStatusId === record.id} title="Mark as Paid" aria-label="Mark payroll as paid">
                              <Banknote className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20" onClick={() => handleStatusUpdate(record.id, 'unpaid')} disabled={updatingStatusId === record.id} title="Mark as Unpaid" aria-label="Mark payroll as unpaid">
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:text-muted-foreground disabled:hover:bg-transparent"
                            onClick={() => setDeleteTarget(record)}
                            disabled={record.status === 'paid'}
                            title={record.status === 'paid' ? 'Paid payroll cannot be deleted. Mark it as Unpaid before deleting.' : 'Delete Payroll'}
                            aria-label="Delete payroll"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          {isSuperAdmin && record.sessionEarnings > 0 && record.status !== 'paid' && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20" onClick={() => handleUnlock(record)} disabled={unlockingId === record.id} title="Unlock Payroll" aria-label="Unlock payroll">
                              <Unlock className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Summary Row */}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={2}>Summary</TableCell>
                    <TableCell className="text-right hidden xl:table-cell text-emerald-600 dark:text-emerald-400" colSpan={6}>
                      {formatCurrency(summary.totalEarnings)}
                    </TableCell>
                    <TableCell className="text-right hidden xl:table-cell text-red-600 dark:text-red-400" colSpan={6}>
                      -{formatCurrency(summary.totalDeductions)}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(summary.totalNetSalary)}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Process/Edit Payroll Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingRecord(null) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRecord ? 'Edit Payroll' : 'Process Payroll'}</DialogTitle>
            <DialogDescription>
              {editingRecord
                ? `Editing payroll for ${editingRecord.employee.name} - ${months[selectedMonth - 1]} ${selectedYear}`
                : `${months[selectedMonth - 1]} ${selectedYear} - Select employee and fill salary details`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Employee *</Label>
              <Select value={formData.employeeId} onValueChange={handleEmployeeSelect} disabled={!!editingRecord}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name} ({emp.employeeId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Basic Salary</Label>
                <Input
                  type="number"
                  min={0}
                value={formData.basicSalary === 0 ? '' : formData.basicSalary}
                  onChange={(e) => setFormData((prev) => ({ ...prev, basicSalary: Math.max(parseFloat(e.target.value) || 0, 0) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>HRA</Label>
                <Input
                  type="number"
                  min={0}
                 value={formData.hra === 0 ? '' : formData.hra}
                  onChange={(e) => setFormData((prev) => ({ ...prev, hra: Math.max(parseFloat(e.target.value) || 0, 0) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Allowances</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.allowances === 0 ? '' : formData.allowances}
                  onChange={(e) => setFormData((prev) => ({ ...prev, allowances: Math.max(parseFloat(e.target.value) || 0, 0) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Incentives</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.incentives === 0 ? '' : formData.incentives}
                  onChange={(e) => setFormData((prev) => ({ ...prev, incentives: Math.max(parseFloat(e.target.value) || 0, 0) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Bonus</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.bonus === 0 ? '' : formData.bonus}
                  onChange={(e) => setFormData((prev) => ({ ...prev, bonus: Math.max(parseFloat(e.target.value) || 0, 0) }))}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-3 text-muted-foreground">Deductions</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Leave Deduction</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.leaveDeduction === 0 ? '' : formData.leaveDeduction}
                    onChange={(e) => setFormData((prev) => ({ ...prev, leaveDeduction: Math.max(parseFloat(e.target.value) || 0, 0) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>PF (12%)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.pf === 0 ? '' : formData.pf}
                    onChange={(e) => setFormData((prev) => ({ ...prev, pf: Math.max(parseFloat(e.target.value) || 0, 0) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>ESI (0.75%)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.esi === 0 ? '' : formData.esi}
                    onChange={(e) => setFormData((prev) => ({ ...prev, esi: Math.max(parseFloat(e.target.value) || 0, 0) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Professional Tax</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.professionalTax}
                    onChange={(e) => setFormData((prev) => ({ ...prev, professionalTax: Math.max(parseFloat(e.target.value) || 0, 0) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Advance Recovery</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.advanceRecovery === 0 ? '' : formData.advanceRecovery}
                    onChange={(e) => setFormData((prev) => ({ ...prev, advanceRecovery: Math.max(parseFloat(e.target.value) || 0, 0) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>TDS</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={formData.tds === 0 ? '' : formData.tds}
                    onChange={(e) => setFormData((prev) => ({ ...prev, tds: Math.max(parseFloat(e.target.value) || 0, 0) }))}
                  />
                </div>
              </div>
            </div>

            {/* Auto Calculated Summary */}
            <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Earnings</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(totalEarnings)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Deductions</span>
                <span className="font-medium text-red-600 dark:text-red-400">{formatCurrency(totalDeductions)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>Net Salary</span>
                <span>{formatCurrency(netSalary)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> {editingRecord ? 'Updating...' : 'Processing...'}</> : editingRecord ? 'Update Payroll' : 'Save Payroll'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Salary Slip Dialog */}
      <Dialog open={slipDialogOpen} onOpenChange={setSlipDialogOpen}>
        <DialogContent className="max-w-[650px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Salary Slip</DialogTitle>
            <DialogDescription>
              {selectedRecord && `${months[selectedMonth - 1]} ${selectedYear}`}
            </DialogDescription>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-4 py-2">
              {/* Employee Info */}
              <div className="rounded-lg border p-4 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Employee</span>
                  <span className="font-medium">{selectedRecord.employee.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">ID</span>
                  <span>{selectedRecord.employee.employeeId}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Designation</span>
                  <span>{selectedRecord.employee.designation || '-'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  {getPayrollStatusBadge(selectedRecord.status)}
                </div>
              </div>

              {/* Earnings */}
              <div>
                <p className="text-sm font-medium mb-2 text-emerald-600 dark:text-emerald-400">Earnings</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm"><span>Basic Salary</span><span>{formatCurrency(selectedRecord.basicSalary)}</span></div>
                  <div className="flex justify-between text-sm"><span>HRA</span><span>{formatCurrency(selectedRecord.hra)}</span></div>
                  <div className="flex justify-between text-sm"><span>Allowances</span><span>{formatCurrency(selectedRecord.allowances)}</span></div>
                  <div className="flex justify-between text-sm"><span>Incentives</span><span>{formatCurrency(selectedRecord.incentives)}</span></div>
                  <div className="flex justify-between text-sm"><span>Bonus</span><span>{formatCurrency(selectedRecord.bonus)}</span></div>
                  {selectedRecord.sessionEarnings > 0 && (
                    <>
                      <div className="flex justify-between text-sm"><span>Session Earnings</span><span>{formatCurrency(selectedRecord.sessionEarnings)}</span></div>
                      {slipBreakdown.length > 0 && (
                        <div className="pl-4 space-y-0.5">
                          {slipBreakdown.map((b) => (
                            <div key={`${b.serviceType}::${b.rateType}`} className="flex justify-between text-xs text-muted-foreground">
                              <span>
                                {b.serviceType} ({b.sessions} × {b.rateType === 'PERCENTAGE' ? `${b.avgRate.toFixed(1)}%` : formatCurrency(b.avgRate)})
                              </span>
                              <span>{formatCurrency(b.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between text-sm font-semibold border-t pt-1 mt-1"><span>Total Earnings</span><span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(selectedRecord.totalEarnings)}</span></div>
                </div>
              </div>

              {/* Deductions */}
              <div>
                <p className="text-sm font-medium mb-2 text-red-600 dark:text-red-400">Deductions</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm"><span>Leave Deduction</span><span>{formatCurrency(selectedRecord.leaveDeduction)}</span></div>
                  <div className="flex justify-between text-sm"><span>PF</span><span>{formatCurrency(selectedRecord.pf)}</span></div>
                  <div className="flex justify-between text-sm"><span>ESI</span><span>{formatCurrency(selectedRecord.esi)}</span></div>
                  <div className="flex justify-between text-sm"><span>Professional Tax</span><span>{formatCurrency(selectedRecord.professionalTax)}</span></div>
                  <div className="flex justify-between text-sm"><span>Advance Recovery</span><span>{formatCurrency(selectedRecord.advanceRecovery)}</span></div>
                  <div className="flex justify-between text-sm"><span>TDS</span><span>{formatCurrency(selectedRecord.tds)}</span></div>
                  <div className="flex justify-between text-sm font-semibold border-t pt-1 mt-1"><span>Total Deductions</span><span className="text-red-600 dark:text-red-400">{formatCurrency(selectedRecord.totalDeductions)}</span></div>
                </div>
              </div>

              {/* Net */}
              <div className="rounded-lg bg-primary/5 p-3 flex justify-between font-bold text-lg">
                <span>Net Salary</span>
                <span>{formatCurrency(selectedRecord.netSalary)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlipDialogOpen(false)}>Close</Button>
            <Button onClick={async () => {
              // Print the salary slip via a hidden iframe (no new tab/about:blank)
              if (!selectedRecord) return
              const statusLabel = selectedRecord.status.charAt(0).toUpperCase() + selectedRecord.status.slice(1)
              const payslipNo = `PS-${selectedRecord.id.slice(-8).toUpperCase()}`
              const generatedOn = format(new Date(), 'dd MMM yyyy')
              // Clinic's own uploaded Print Branding (Settings → Print Branding) —
              // never a hardcoded image — or no header/footer at all.
              const choice = await choosePrintMode({ modes: ['header_footer', 'plain'] })
              if (!choice) return
              const withBands = choice.mode === 'header_footer'
              const headerImg = withBands ? choice.branding.printHeader || undefined : undefined
              const footerImg = withBands ? choice.branding.printFooter || undefined : undefined
              printHTMLDocument(`
                  <html><head><title>Salary Slip - ${esc(selectedRecord.employee.name)}</title>
                  <style>
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; box-sizing: border-box; }
                    @page { size: A4; margin: 10mm 12mm; }
                    body { font-family: Arial, Helvetica, sans-serif; color: #1F2937; max-width: 700px; margin: 0 auto; font-size: 13px; }
                    .ps-header-img { margin: 0 0 14px; break-after: avoid; page-break-after: avoid; }
                    .ps-header-img img { width: 100%; height: auto; max-height: 60mm; object-fit: contain; display: block; }
                    .ps-footer-img { margin: 18px 0 0; break-before: avoid; page-break-before: avoid; }
                    .ps-footer-img img { width: 100%; height: auto; max-height: 35mm; object-fit: contain; display: block; }

                    .ps-title-row { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px; }
                    .ps-title-row h1 { font-size: 20px; font-weight: 700; color: #0F7A87; margin: 0; text-align: right; }
                    .ps-title-row .ps-period { font-size: 13px; color: #4B5563; text-align: right; margin-top: 2px; }
                    .ps-meta { font-size: 10.5px; color: #6B7280; }
                    .ps-meta div { margin: 1px 0; }

                    .ps-card { border: 1px solid #D1D5DB; border-radius: 6px; margin-bottom: 14px; overflow: hidden; }
                    .ps-card-title { background: #E9F4F5; color: #0F7A87; font-weight: 700; font-size: 12.5px; padding: 7px 12px; border-bottom: 1px solid #D1D5DB; text-transform: uppercase; letter-spacing: 0.3px; }
                    .ps-card-body { padding: 10px 12px; }
                    .ps-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; }
                    .ps-detail-row { display: flex; justify-content: space-between; font-size: 12.5px; padding: 3px 0; border-bottom: 1px dashed #E5E7EB; }
                    .ps-detail-row span:first-child { color: #6B7280; }
                    .ps-detail-row span:last-child { font-weight: 600; color: #1F2937; }

                    .ps-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
                    .ps-col-card .ps-card-title.earnings { background: #EAF7EF; color: #16A34A; }
                    .ps-col-card .ps-card-title.deductions { background: #FDECEC; color: #DC2626; }
                    .ps-line { display: flex; justify-content: space-between; font-size: 12.5px; padding: 4px 0; }
                    .ps-line span:last-child { font-weight: 600; }
                    .ps-line.total { border-top: 1px solid #D1D5DB; margin-top: 4px; padding-top: 6px; font-weight: 700; }
                    .ps-line.total.earnings span:last-child { color: #16A34A; }
                    .ps-line.total.deductions span:last-child { color: #DC2626; }

                    .ps-summary { display: flex; justify-content: space-between; border: 1px solid #D1D5DB; border-radius: 6px; padding: 10px 16px; margin-bottom: 14px; font-size: 12.5px; background: #F9FAFB; }
                    .ps-summary div { text-align: center; flex: 1; }
                    .ps-summary .label { color: #6B7280; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 2px; }
                    .ps-summary .value { font-weight: 700; font-size: 14px; }

                    .ps-sign-row { display: flex; justify-content: space-between; margin: 30px 0 8px; }
                    .ps-sign-box { text-align: center; width: 45%; }
                    .ps-sign-line { border-top: 1px solid #9CA3AF; padding-top: 4px; font-size: 11px; color: #6B7280; }
                    .ps-disclaimer { text-align: center; font-size: 10px; color: #9CA3AF; margin-top: 4px; }
                  </style></head><body>
                  ${headerImg ? `<div class="ps-header-img"><img src="${esc(headerImg)}" alt="" /></div>` : ''}

                  <div class="ps-title-row">
                    <div class="ps-meta">
                      <div>Payslip No: ${esc(payslipNo)}</div>
                      <div>Generated: ${esc(generatedOn)}</div>
                    </div>
                    <div>
                      <h1>SALARY SLIP</h1>
                      <div class="ps-period">${months[selectedMonth - 1]} ${selectedYear}</div>
                    </div>
                  </div>

                  <div class="ps-card">
                    <div class="ps-card-title">Employee Details</div>
                    <div class="ps-card-body ps-detail-grid">
                      <div class="ps-detail-row"><span>Employee Name</span><span>${esc(selectedRecord.employee.name)}</span></div>
                      <div class="ps-detail-row"><span>Employee ID</span><span>${esc(selectedRecord.employee.employeeId)}</span></div>
                      <div class="ps-detail-row"><span>Designation</span><span>${esc(selectedRecord.employee.designation) || '-'}</span></div>
                      <div class="ps-detail-row"><span>Pay Period</span><span>${months[selectedMonth - 1]} ${selectedYear}</span></div>
                      <div class="ps-detail-row"><span>Status</span><span>${esc(statusLabel)}</span></div>
                      <div class="ps-detail-row"><span>Payment Date</span><span>${selectedRecord.paidDate ? format(new Date(selectedRecord.paidDate), 'dd MMM yyyy') : '-'}</span></div>
                    </div>
                  </div>

                  <div class="ps-cols">
                    <div class="ps-col-card ps-card">
                      <div class="ps-card-title earnings">Earnings</div>
                      <div class="ps-card-body">
                        <div class="ps-line"><span>Basic Salary</span><span>${formatCurrency(selectedRecord.basicSalary)}</span></div>
                        <div class="ps-line"><span>HRA</span><span>${formatCurrency(selectedRecord.hra)}</span></div>
                        <div class="ps-line"><span>Allowances</span><span>${formatCurrency(selectedRecord.allowances)}</span></div>
                        <div class="ps-line"><span>Incentives</span><span>${formatCurrency(selectedRecord.incentives)}</span></div>
                        <div class="ps-line"><span>Bonus</span><span>${formatCurrency(selectedRecord.bonus)}</span></div>
                        ${selectedRecord.sessionEarnings > 0 ? `<div class="ps-line"><span>Session Earnings</span><span>${formatCurrency(selectedRecord.sessionEarnings)}</span></div>${slipBreakdown.map((b) => `<div class="ps-line" style="font-size:11px;color:#6B7280;padding-left:10px;"><span>${esc(b.serviceType)} (${b.sessions} × ${b.rateType === 'PERCENTAGE' ? `${b.avgRate.toFixed(1)}%` : formatCurrency(b.avgRate)})</span><span>${formatCurrency(b.amount)}</span></div>`).join('')}` : ''}
                        <div class="ps-line total earnings"><span>Total Earnings</span><span>${formatCurrency(selectedRecord.totalEarnings)}</span></div>
                      </div>
                    </div>
                    <div class="ps-col-card ps-card">
                      <div class="ps-card-title deductions">Deductions</div>
                      <div class="ps-card-body">
                        <div class="ps-line"><span>Leave Deduction</span><span>${formatCurrency(selectedRecord.leaveDeduction)}</span></div>
                        <div class="ps-line"><span>PF</span><span>${formatCurrency(selectedRecord.pf)}</span></div>
                        <div class="ps-line"><span>ESI</span><span>${formatCurrency(selectedRecord.esi)}</span></div>
                        <div class="ps-line"><span>Professional Tax</span><span>${formatCurrency(selectedRecord.professionalTax)}</span></div>
                        <div class="ps-line"><span>Advance Recovery</span><span>${formatCurrency(selectedRecord.advanceRecovery)}</span></div>
                        <div class="ps-line"><span>TDS</span><span>${formatCurrency(selectedRecord.tds)}</span></div>
                        <div class="ps-line total deductions"><span>Total Deductions</span><span>${formatCurrency(selectedRecord.totalDeductions)}</span></div>
                      </div>
                    </div>
                  </div>

                  <div class="ps-summary">
                    <div><div class="label">Gross Salary</div><div class="value">${formatCurrency(selectedRecord.totalEarnings)}</div></div>
                    <div><div class="label">Total Deductions</div><div class="value" style="color:#DC2626;">${formatCurrency(selectedRecord.totalDeductions)}</div></div>
                    <div><div class="label">Net Pay</div><div class="value" style="color:#16A34A;">${formatCurrency(selectedRecord.netSalary)}</div></div>
                  </div>

                  <div class="ps-sign-row">
                    <div class="ps-sign-box"><div class="ps-sign-line">Authorized Signature</div></div>
                    <div class="ps-sign-box"><div class="ps-sign-line">Employee Signature</div></div>
                  </div>
                  <div class="ps-disclaimer">This is a system-generated salary slip and does not require a physical signature.</div>

                  ${footerImg ? `<div class="ps-footer-img"><img src="${esc(footerImg)}" alt="" /></div>` : ''}
                  </body></html>
                `)
              setSlipDialogOpen(false)
            }}>
              <Printer className="h-4 w-4 mr-2" />
              Print Slip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Payroll confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Payroll</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this payroll?
              {deleteTarget && (
                <span className="mt-1 block font-medium text-foreground">
                  {deleteTarget.employee.name} — {months[deleteTarget.month - 1]} {deleteTarget.year}
                </span>
              )}
              This action will permanently remove the payroll record.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeletePayroll} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
