'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { format, differenceInDays, parseISO } from 'date-fns'
import {
  CalendarOff,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Eye,
  Filter,
  ChevronLeft,
  ChevronRight,
  UserMinus,
  UserCheck,
  AlertCircle,
  Ban,
  Trash2,
  Download,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
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
import { authFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import { useAppStore } from '@/store/app-store'

// Types
interface Employee {
  id: string
  employeeId: string
  name: string
  designation: string | null
}

interface LeaveRecord {
  id: string
  employeeId: string
  leaveType: string
  startDate: string
  endDate: string
  totalDays: number
  reason: string | null
  status: string
  approvedBy: string | null
  approvedAt: string | null
  createdAt: string
  employee: Employee
}

interface LeavePolicyRow {
  id: string
  leaveType: string
  branchId: string | null
  annualLimit: number | null
  monthlyLimit: number | null
  carryForwardAllowed: boolean
  maxCarryForwardDays: number | null
  isPaid: boolean
  requiresApproval: boolean
}

interface LeaveTypeBalance {
  leaveType: string
  label: string
  annualLimit: number | null
  annualUsed: number
  annualRemaining: number | null
  monthlyLimit: number | null
  monthlyUsed: number
  isPaid: boolean
}

interface LeaveBalance {
  perType: LeaveTypeBalance[]
  totalTaken: number
  // Sum across only the leave types that have a finite (non-null) annual
  // limit — types like Unpaid/Government are typically unlimited by policy
  // and would make "total allocated" meaningless if included.
  totalAllocated: number
  totalUsed: number
  totalRemaining: number
  pendingCount: number
}

// Leave type options
const leaveTypes = [
  { value: 'casual', label: 'Casual Leave' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'government', label: 'Government/Public Holiday' },
  { value: 'earned', label: 'Earned Leave' },
  { value: 'maternity', label: 'Maternity Leave' },
  { value: 'unpaid', label: 'Unpaid Leave' },
]

// Leave status badge
function getLeaveStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400">Pending</Badge>
    case 'approved':
      return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">Approved</Badge>
    case 'rejected':
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">Rejected</Badge>
    case 'cancelled':
      return <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400">Cancelled</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

// Leave type badge
function getLeaveTypeBadge(type: string) {
  switch (type) {
    case 'casual':
      return <Badge variant="secondary">Casual</Badge>
    case 'sick':
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">Sick</Badge>
    case 'earned':
      return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">Earned</Badge>
    case 'maternity':
      return <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400">Maternity</Badge>
    case 'unpaid':
      return <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400">Unpaid</Badge>
    case 'government':
      return <Badge className="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400">Gov/Public Holiday</Badge>
    default:
      return <Badge variant="outline">{type}</Badge>
  }
}

// Same per-type color mapping as getLeaveTypeBadge above, reused as a left
// border + dot accent on the balance cards so each leave type is easy to
// tell apart at a glance instead of every card looking identical.
function getLeaveTypeAccent(type: string): { border: string; dot: string } {
  switch (type) {
    case 'sick':
      return { border: 'border-l-red-400 dark:border-l-red-600', dot: 'bg-red-500' }
    case 'earned':
      return { border: 'border-l-blue-400 dark:border-l-blue-600', dot: 'bg-blue-500' }
    case 'maternity':
      return { border: 'border-l-purple-400 dark:border-l-purple-600', dot: 'bg-purple-500' }
    case 'unpaid':
      return { border: 'border-l-gray-400 dark:border-l-gray-600', dot: 'bg-gray-500' }
    case 'government':
      return { border: 'border-l-teal-400 dark:border-l-teal-600', dot: 'bg-teal-500' }
    default: // casual
      return { border: 'border-l-indigo-400 dark:border-l-indigo-600', dot: 'bg-indigo-500' }
  }
}

// Computes an employee's leave balance purely from the existing Leave Policy
// rows + their own Leave records — no separate "balance" table, so this is
// always derived fresh from the two existing sources of truth. Reused by the
// page-level balance section, the Apply Leave form, and the "Remaining
// Balance After Approval" column so every screen agrees on the same numbers.
//
// Rules (see LeavePolicy.annualLimit/monthlyLimit + Leave.status):
//  - Approved leave reduces balance (counted below).
//  - Pending/Rejected leave does NOT reduce balance (excluded below).
//  - A cancelled leave (even if it was previously approved) does NOT reduce
//    balance — since only `status === 'approved'` rows are counted, a
//    cancellation automatically "restores" the balance with no extra code.
function computeLeaveBalance(allLeaves: LeaveRecord[], policies: LeavePolicyRow[]): LeaveBalance {
  const approved = allLeaves.filter((l) => l.status === 'approved')
  const now = new Date()

  const perType: LeaveTypeBalance[] = policies.map((policy) => {
    const sameType = approved.filter((l) => l.leaveType === policy.leaveType)
    const annualUsed = sameType
      .filter((l) => new Date(l.startDate).getFullYear() === now.getFullYear())
      .reduce((s, l) => s + l.totalDays, 0)
    const monthlyUsed = sameType
      .filter((l) => {
        const d = new Date(l.startDate)
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      })
      .reduce((s, l) => s + l.totalDays, 0)
    return {
      leaveType: policy.leaveType,
      label: leaveTypes.find((lt) => lt.value === policy.leaveType)?.label || policy.leaveType,
      annualLimit: policy.annualLimit,
      annualUsed,
      annualRemaining: policy.annualLimit === null ? null : Math.max(0, policy.annualLimit - annualUsed),
      monthlyLimit: policy.monthlyLimit,
      monthlyUsed,
      isPaid: policy.isPaid,
    }
  })

  const finiteTypes = perType.filter((p) => p.annualLimit !== null)

  return {
    perType,
    totalTaken: approved.reduce((s, l) => s + l.totalDays, 0),
    totalAllocated: finiteTypes.reduce((s, p) => s + (p.annualLimit || 0), 0),
    totalUsed: finiteTypes.reduce((s, p) => s + p.annualUsed, 0),
    totalRemaining: finiteTypes.reduce((s, p) => s + (p.annualRemaining || 0), 0),
    pendingCount: allLeaves.filter((l) => l.status === 'pending').length,
  }
}

// Currency formatter
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export default function LeavesPage() {
  const navigate = useAppStore((s) => s.navigate)
  const user = useAppStore((s) => s.user)
  // Therapist + receptionist roles auto-assign their own employeeId
  const isEmployeeRole = user?.role === 'receptionist' || (user?.role?.startsWith('therapist') ?? false)
  const [leaves, setLeaves] = useState<LeaveRecord[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const limit = 20

  // Filters
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingLeaveId, setPendingLeaveId] = useState<string | null>(null)
  const [editingLeave, setEditingLeave] = useState<LeaveRecord | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form
  const [formData, setFormData] = useState({
    employeeId: '',
    leaveType: 'casual',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    totalDays: 1,
    reason: '',
    status: 'pending',
  })

  // Leave balance for selected employee
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null)

  // Balance for whichever employee is picked inside the Apply Leave dialog —
  // may differ from the page-level `leaveBalance` above (e.g. an admin
  // applying leave on behalf of an employee who isn't the currently
  // filtered one). Drives the Allocated/Used/Remaining preview and the
  // "no remaining balance" block on the Apply Leave form.
  const [applyBalance, setApplyBalance] = useState<LeaveBalance | null>(null)
  const [applyBalanceLoading, setApplyBalanceLoading] = useState(false)

  // Super Admin-configured leave policies (annual/monthly limits, carry-forward,
  // paid flag, approval requirement) — one row per existing leave type, global
  // (branchId: null) only. Drives both the balance cards below and the
  // "Leave Policy Settings" dialog.
  const isSuperAdmin = user?.role === 'super_admin'
  const [policies, setPolicies] = useState<LeavePolicyRow[]>([])
  const [policySettingsOpen, setPolicySettingsOpen] = useState(false)
  const [policyDrafts, setPolicyDrafts] = useState<Record<string, LeavePolicyRow>>({})
  const [savingPolicies, setSavingPolicies] = useState(false)

  const fetchPolicies = useCallback(async () => {
    try {
      const res = await authFetch('/api/leave-policies')
      if (res.ok) {
        const json: LeavePolicyRow[] = await res.json()
        setPolicies(json)
      }
    } catch (err) {
      console.error('Failed to fetch leave policies:', err)
    }
  }, [])


  // Fetch employees
  const fetchEmployees = useCallback(async () => {
    try {
      const res = await authFetch('/api/employees?limit=100')
      if (res.ok) {
        const json = await res.json()
        setEmployees(json.employees || [])
      }
    } catch (err) {
      console.error('Failed to fetch employees:', err)
      toast.error('Failed to load employees')
    }
  }, [])

  // Fetch leaves
  const fetchLeaves = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', page.toString())
      params.set('limit', limit.toString())
      if (filterEmployee) params.set('employeeId', filterEmployee)
      if (filterStatus) params.set('status', filterStatus)
      if (filterType) params.set('leaveType', filterType)

      const res = await authFetch(`/api/leaves?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setLeaves(json.leaves || [])
        setTotal(json.total)
      }
    } catch (err) {
      console.error('Failed to fetch leaves:', err)
      toast.error('Failed to load leave records')
    } finally {
      setLoading(false)
    }
  }, [page, filterEmployee, filterStatus, filterType])

  // Fetch leave balance for a given employee — annual + monthly used/remaining
  // per leave type, sourced from the Super Admin-configured LeavePolicy limits
  // rather than hardcoded allowances.
  const fetchLeaveBalance = useCallback(async (employeeId: string) => {
    if (!employeeId) {
      setLeaveBalance(null)
      return
    }
    try {
      const res = await authFetch(`/api/leaves?employeeId=${employeeId}&limit=100`)
      if (res.ok) {
        const json = await res.json()
        const allLeaves: LeaveRecord[] = json.leaves || []
        setLeaveBalance(computeLeaveBalance(allLeaves, policies))
      }
    } catch (err) {
      console.error('Failed to fetch leave balance:', err)
      toast.error('Failed to load leave balance')
    }
  }, [policies])

  // The employee whose balance/dashboard is shown: an employee-role user
  // always sees their OWN balance (no filter needed — matches "Employee
  // Leave Dashboard"); an admin sees whichever employee they've picked in
  // the filter ("Super Admin Employee View").
  const targetEmployeeId = isEmployeeRole ? (user?.employeeId || '') : filterEmployee

  useEffect(() => {
    fetchEmployees()
    fetchPolicies()
  }, [fetchEmployees, fetchPolicies])

  useEffect(() => {
    fetchLeaves()
  }, [fetchLeaves])

  useEffect(() => {
    fetchLeaveBalance(targetEmployeeId)
  }, [targetEmployeeId, fetchLeaveBalance])

  // Apply Leave dialog: fetch the picked employee's balance whenever the
  // dialog is open and an employee is selected — reuses the page-level
  // balance when it's the same employee (no duplicate request).
  useEffect(() => {
    if (!dialogOpen || !formData.employeeId) {
      setApplyBalance(null)
      return
    }
    if (formData.employeeId === targetEmployeeId && leaveBalance) {
      setApplyBalance(leaveBalance)
      return
    }
    let cancelled = false
    setApplyBalanceLoading(true)
    authFetch(`/api/leaves?employeeId=${formData.employeeId}&limit=100`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return
        setApplyBalance(computeLeaveBalance(json.leaves || [], policies))
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setApplyBalanceLoading(false) })
    return () => { cancelled = true }
  }, [dialogOpen, formData.employeeId, targetEmployeeId, leaveBalance, policies])

  // Balance info for the currently-selected leave type in the Apply Leave
  // form — drives the Allocated/Used/Remaining preview and whether the
  // Apply button should be blocked.
  const applyTypeBalance = applyBalance?.perType.find((p) => p.leaveType === formData.leaveType) || null
  // Leave Without Pay (or any leave type the policy marks unpaid, or one
  // with no annual cap at all) is never blocked by a "0 remaining" balance —
  // only a finite, paid allocation can actually run out.
  const applyBlocked = !!applyTypeBalance
    && applyTypeBalance.isPaid
    && applyTypeBalance.annualLimit !== null
    && (applyTypeBalance.annualRemaining ?? 0) <= 0

  // "Remaining Balance After Approval" — for each row in the Leave Records
  // table, the annual balance that was left immediately after THAT specific
  // leave, computed by walking the same employee+type's approved leaves for
  // the year in chronological order. Only meaningful for approved rows;
  // pending/rejected/cancelled show "—". Fetched per unique (employee, type)
  // pair actually visible on the current page — reuses the existing
  // /api/leaves filters (employeeId/leaveType/status), no new endpoint.
  const [remainingAfterMap, setRemainingAfterMap] = useState<Record<string, number | 'unlimited'>>({})
  useEffect(() => {
    const approvedRows = leaves.filter((l) => l.status === 'approved')
    if (approvedRows.length === 0 || policies.length === 0) {
      setRemainingAfterMap({})
      return
    }
    let cancelled = false
    const combos = Array.from(new Set(approvedRows.map((l) => `${l.employeeId}::${l.leaveType}`)))
    ;(async () => {
      const newMap: Record<string, number | 'unlimited'> = {}
      for (const combo of combos) {
        const [employeeId, leaveType] = combo.split('::')
        const policy = policies.find((p) => p.leaveType === leaveType)
        const rowsForCombo = approvedRows.filter((l) => l.employeeId === employeeId && l.leaveType === leaveType)
        if (!policy || policy.annualLimit === null) {
          rowsForCombo.forEach((l) => { newMap[l.id] = 'unlimited' })
          continue
        }
        try {
          const res = await authFetch(`/api/leaves?employeeId=${employeeId}&leaveType=${leaveType}&status=approved&limit=1000`)
          if (!res.ok) continue
          const json = await res.json()
          const now = new Date()
          const thisYear: LeaveRecord[] = (json.leaves || [])
            .filter((l: LeaveRecord) => new Date(l.startDate).getFullYear() === now.getFullYear())
            .sort((a: LeaveRecord, b: LeaveRecord) =>
              new Date(a.approvedAt || a.startDate).getTime() - new Date(b.approvedAt || b.startDate).getTime())
          let cumulative = 0
          for (const l of thisYear) {
            cumulative += l.totalDays
            newMap[l.id] = Math.max(0, policy.annualLimit - cumulative)
          }
        } catch { /* leave this combo out of the map on failure */ }
      }
      if (!cancelled) setRemainingAfterMap(newMap)
    })()
    return () => { cancelled = true }
  }, [leaves, policies])

  // Super Admin policy-level KPIs — summarize the LeavePolicy table itself
  // (not any one employee's usage), so they're visible independent of any
  // employee filter.
  const policyKpis = useMemo(() => ({
    totalLeaveTypes: policies.length,
    totalAnnualLeaveDays: policies.reduce((s, p) => s + (p.annualLimit || 0), 0),
    paidLeaveTypes: policies.filter((p) => p.isPaid).length,
    carryForwardEnabledTypes: policies.filter((p) => p.carryForwardAllowed).length,
  }), [policies])

  // Calculate total days
  useEffect(() => {
    if (formData.startDate && formData.endDate) {
      const start = parseISO(formData.startDate)
      const end = parseISO(formData.endDate)
      const days = differenceInDays(end, start) + 1
      setFormData((prev) => ({ ...prev, totalDays: Math.max(1, days) }))
    }
  }, [formData.startDate, formData.endDate])

  // Open dialog for new leave
  const handleNewLeave = () => {
    setEditingLeave(null)
    setFormData({
      // For therapist/receptionist: auto-assign employeeId from session
      employeeId: isEmployeeRole ? (user?.employeeId || '') : (filterEmployee || ''),
      leaveType: 'casual',
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
      totalDays: 1,
      reason: '',
      status: 'pending',
    })
    setDialogOpen(true)
  }

  // Open dialog for editing
  const handleEditLeave = (leave: LeaveRecord) => {
    setEditingLeave(leave)
    setFormData({
      employeeId: leave.employeeId,
      leaveType: leave.leaveType,
      startDate: format(parseISO(leave.startDate), 'yyyy-MM-dd'),
      endDate: format(parseISO(leave.endDate), 'yyyy-MM-dd'),
      totalDays: leave.totalDays,
      reason: leave.reason || '',
      status: leave.status,
    })
    setDialogOpen(true)
  }

  // Handle approve/reject
  const handleStatusUpdate = async (leaveId: string, status: string) => {
    if (pendingLeaveId) return
    setPendingLeaveId(leaveId)
    try {
      const res = await authFetch('/api/leaves', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: leaveId, status }),
      })
      if (res.ok) {
        toast.success(`Leave ${status} successfully`)
        fetchLeaves()
      } else {
        toast.error('Failed to update leave status')
      }
    } catch {
      toast.error('Failed to update leave status')
    } finally {
      setPendingLeaveId(null)
    }
  }

  // Handle delete
  const handleDeleteLeave = async (leaveId: string) => {
    if (!confirm('Are you sure you want to delete this leave record?')) return
    if (pendingLeaveId) return
    setPendingLeaveId(leaveId)
    try {
      const res = await authFetch(`/api/leaves?id=${leaveId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Leave record deleted')
        fetchLeaves()
      } else {
        toast.error('Failed to delete leave record')
      }
    } catch {
      toast.error('Failed to delete leave record')
    } finally {
      setPendingLeaveId(null)
    }
  }

  // Submit form
  const handleSubmit = async () => {
    // Required-field validation (exact message per spec)
    if (
      !formData.employeeId ||
      !formData.leaveType ||
      !formData.startDate ||
      !formData.endDate ||
      !formData.reason.trim()
    ) {
      toast.error('Please fill all required fields')
      return
    }
    // end >= start validation (exact message per spec)
    const start = parseISO(formData.startDate)
    const end = parseISO(formData.endDate)
    if (end.getTime() < start.getTime()) {
      toast.error('Invalid date selection')
      return
    }
    // Belt-and-braces: the Apply button is already disabled for this case,
    // but block here too (e.g. editing an existing request into a type
    // that's now exhausted) — /api/leaves POST enforces this server-side
    // regardless, this just gives an immediate, specific message.
    if (!editingLeave && applyBlocked) {
      toast.error('No remaining leave balance.')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        ...(editingLeave ? { id: editingLeave.id } : {}),
        employeeId: formData.employeeId,
        leaveType: formData.leaveType,
        startDate: formData.startDate,
        endDate: formData.endDate,
        totalDays: formData.totalDays,
        reason: formData.reason,
        status: formData.status,
      }

      const res = await authFetch('/api/leaves', {
        method: editingLeave ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        toast.success(editingLeave ? 'Leave updated successfully' : 'Leave Applied Successfully')
        setDialogOpen(false)
        fetchLeaves()
      } else {
        const data = await res.json().catch(() => null)
        toast.error(data?.error || 'Failed to save leave')
      }
    } catch {
      toast.error('Failed to save leave')
    } finally {
      setSubmitting(false)
    }
  }

  // Save all edited leave policy drafts (Super Admin only) — one PUT per
  // leave type, since /api/leave-policies upserts a single row at a time.
  const handleSavePolicies = async () => {
    setSavingPolicies(true)
    try {
      const results = await Promise.all(
        Object.values(policyDrafts).map((draft) =>
          authFetch('/api/leave-policies', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draft),
          })
        )
      )
      if (results.every((r) => r.ok)) {
        toast.success('Leave policies updated')
        setPolicySettingsOpen(false)
        fetchPolicies()
      } else {
        toast.error('Some leave policies failed to save')
      }
    } catch {
      toast.error('Failed to save leave policies')
    } finally {
      setSavingPolicies(false)
    }
  }

  const totalPages = Math.ceil(total / limit)

  // ── Export to Excel — re-fetches with the currently active filters
  // (employee/status/type) but a large limit so ALL matching leave records
  // are exported, not just the current page. ──
  const [exportingLeaves, setExportingLeaves] = useState(false)
  const handleExportLeaves = async () => {
    if (exportingLeaves) return
    setExportingLeaves(true)
    try {
      const params = new URLSearchParams({ page: '1', limit: '100000' })
      if (filterEmployee) params.set('employeeId', filterEmployee)
      if (filterStatus) params.set('status', filterStatus)
      if (filterType) params.set('leaveType', filterType)
      const res = await authFetch(`/api/leaves?${params.toString()}`)
      if (!res.ok) {
        toast.error('Failed to export leave records')
        return
      }
      const json = await res.json()
      const all: LeaveRecord[] = json.leaves || []

      const headers = ['Employee', 'Employee ID', 'Leave Type', 'Start Date', 'End Date', 'Total Days', 'Reason', 'Status', 'Approved By']
      const rows = all.map((leave) => [
        leave.employee?.name || '',
        leave.employee?.employeeId || '',
        leaveTypes.find((lt) => lt.value === leave.leaveType)?.label || leave.leaveType,
        format(parseISO(leave.startDate), 'dd MMM yyyy'),
        format(parseISO(leave.endDate), 'dd MMM yyyy'),
        leave.totalDays,
        leave.reason || '',
        leave.status,
        leave.approvedBy || '',
      ])

      const XLSX = await import('xlsx')
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Leave Management')
      XLSX.writeFile(wb, 'Leave_Management.xlsx')
    } catch (err) {
      console.error('Failed to export leave records:', err)
      toast.error('Something went wrong while exporting')
    } finally {
      setExportingLeaves(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leave Management</h1>
          <p className="text-muted-foreground text-sm">Manage employee leave requests and balances</p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <Button
              variant="outline"
              onClick={() => {
                setPolicyDrafts(Object.fromEntries(policies.map((p) => [p.leaveType, { ...p }])))
                setPolicySettingsOpen(true)
              }}
            >
              Leave Policy Settings
            </Button>
          )}
          <Button variant="outline" onClick={handleExportLeaves} disabled={exportingLeaves}>
            <Download className="h-4 w-4 mr-2" />
            Export to Excel
          </Button>
          <Button onClick={handleNewLeave}>
            <Plus className="h-4 w-4 mr-2" />
            Apply Leave
          </Button>
        </div>
      </div>

      {/* Super Admin — policy-level KPIs, summarizing the Leave Policy table
          itself (independent of any employee filter). */}
      {isSuperAdmin && (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card className="p-4 gap-1">
            <p className="text-xs text-muted-foreground font-medium">Total Leave Types</p>
            <p className="text-xl font-bold">{policyKpis.totalLeaveTypes}</p>
          </Card>
          <Card className="p-4 gap-1">
            <p className="text-xs text-muted-foreground font-medium">Total Annual Leave Days</p>
            <p className="text-xl font-bold">{policyKpis.totalAnnualLeaveDays}</p>
          </Card>
          <Card className="p-4 gap-1">
            <p className="text-xs text-muted-foreground font-medium">Paid Leave Types</p>
            <p className="text-xl font-bold">{policyKpis.paidLeaveTypes}</p>
          </Card>
          <Card className="p-4 gap-1">
            <p className="text-xs text-muted-foreground font-medium">Carry Forward Enabled</p>
            <p className="text-xl font-bold">{policyKpis.carryForwardEnabledTypes}</p>
          </Card>
        </div>
      )}

      {/* Super Admin — per-type breakdown of exactly what was configured in
          Leave Policy Settings (this row sums to "Total Annual Leave Days"
          above) — read straight from the policy's own annualLimit, not a
          separate usage calculation, so it always matches what Super Admin
          actually entered there. */}
      {isSuperAdmin && (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {leaveTypes.map((lt) => {
            const policy = policies.find((p) => p.leaveType === lt.value)
            return (
              <Card key={lt.value} className="p-4 gap-1">
                <p className="text-xs text-muted-foreground font-medium">{lt.label}</p>
                <p className="text-xl font-bold">{policy?.annualLimit ?? 'Unlimited'}</p>
                <p className="text-[11px] text-muted-foreground">
                  {policy ? `${policy.isPaid ? 'Paid' : 'Unpaid'}${policy.carryForwardAllowed ? ' · Carry Forward' : ''}` : 'Not configured'}
                </p>
              </Card>
            )
          })}
        </div>
      )}

      {/* Employee Leave Dashboard (self-view) / Super Admin Employee View
          (admin has picked an employee in the filter below) — Total
          Allocated, Used, Remaining, and Pending, all calculated dynamically
          from the existing Leave Policy + Leave records (never hardcoded). */}
      {leaveBalance && targetEmployeeId && (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <Card className="p-4 gap-1">
              <p className="text-xs text-muted-foreground font-medium">Total Allocated Leave</p>
              <p className="text-xl font-bold">{leaveBalance.totalAllocated}</p>
            </Card>
            <Card className="p-4 gap-1">
              <p className="text-xs text-muted-foreground font-medium">Used Leave</p>
              <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{leaveBalance.totalUsed}</p>
            </Card>
            <Card className="p-4 gap-1 border-emerald-200 dark:border-emerald-900/40">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Remaining Leave</p>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{leaveBalance.totalRemaining}</p>
            </Card>
            <Card className="p-4 gap-1 border-amber-200 dark:border-amber-900/40">
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                {isEmployeeRole ? 'Pending Approval' : 'Pending Requests'}
              </p>
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{leaveBalance.pendingCount}</p>
            </Card>
          </div>

          {/* Leave Balance by Type — Allocated / Used / Remaining + progress
              bar per configured leave type, read straight from the Leave
              Policy table (never a duplicated/hardcoded allowance). */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {leaveBalance.perType.map((b) => {
              // `b.annualLimit ? …` would mistreat a configured limit of 0
              // (falsy but not null/unlimited) as "unlimited" and show 0%
              // regardless of usage — check `> 0` explicitly instead.
              const pct = b.annualLimit && b.annualLimit > 0
                ? Math.min(100, Math.round((b.annualUsed / b.annualLimit) * 100))
                : (b.annualUsed > 0 ? 100 : 0)
              const accent = getLeaveTypeAccent(b.leaveType)
              return (
                <Card key={b.leaveType} className={`p-4 gap-2 border-l-4 ${accent.border}`}>
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${accent.dot}`} />
                    {b.label}
                  </p>
                  {b.annualLimit === null ? (
                    <p className="text-xs text-muted-foreground">{b.annualUsed} taken this year · Unlimited allocation</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Allocated: <span className="font-medium text-foreground">{b.annualLimit}</span></span>
                        <span>Used: <span className="font-medium text-foreground">{b.annualUsed}</span></span>
                        <span>Remaining: <span className="font-medium text-emerald-600 dark:text-emerald-400">{b.annualRemaining}</span></span>
                      </div>
                      <Progress value={pct} />
                    </>
                  )}
                  {b.monthlyLimit !== null && (
                    <p className="text-[11px] text-muted-foreground">{b.monthlyUsed} used of {b.monthlyLimit}/month</p>
                  )}
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* Super Admin Employee View — compact tabular breakdown of the same
          balance data above, shown when an admin has picked a specific
          employee in the filter (not for the employee's own self-view). */}
      {!isEmployeeRole && filterEmployee && leaveBalance && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Leave Balance Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Leave Type</TableHead>
                    <TableHead className="text-center">Allocated</TableHead>
                    <TableHead className="text-center">Used</TableHead>
                    <TableHead className="text-center">Remaining</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaveBalance.perType.map((b) => (
                    <TableRow key={b.leaveType}>
                      <TableCell className="font-medium">{b.label}</TableCell>
                      <TableCell className="text-center">{b.annualLimit ?? 'Unlimited'}</TableCell>
                      <TableCell className="text-center">{b.annualUsed}</TableCell>
                      <TableCell className="text-center">{b.annualRemaining ?? 'Unlimited'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Filters:</span>
          </div>
          <Select value={filterEmployee} onValueChange={(v) => { setFilterEmployee(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="All Employees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {employees.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.name} ({emp.employeeId})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={(v) => { setFilterType(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-full sm:w-[170px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {leaveTypes.map((lt) => (
                <SelectItem key={lt.value} value={lt.value}>{lt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Leaves Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leave Records</CardTitle>
          <CardDescription>{total} total leave records</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : leaves.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <CalendarOff className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-muted-foreground text-sm">No leave records found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Leave Type</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead className="text-center">Days</TableHead>
                      <TableHead className="hidden md:table-cell">Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Remaining Balance After Approval</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaves.map((leave) => (
                      <TableRow key={leave.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{leave.employee.name}</p>
                            <p className="text-xs text-muted-foreground">{leave.employee.employeeId}</p>
                          </div>
                        </TableCell>
                        <TableCell>{getLeaveTypeBadge(leave.leaveType)}</TableCell>
                        <TableCell className="text-sm">{format(parseISO(leave.startDate), 'dd MMM yyyy')}</TableCell>
                        <TableCell className="text-sm">{format(parseISO(leave.endDate), 'dd MMM yyyy')}</TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
                            {leave.totalDays}
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell max-w-[180px] truncate text-sm text-muted-foreground">
                          {leave.reason || '-'}
                        </TableCell>
                        <TableCell>{getLeaveStatusBadge(leave.status)}</TableCell>
                        <TableCell className="text-center text-sm">
                          {leave.status !== 'approved' ? (
                            <span className="text-muted-foreground">—</span>
                          ) : remainingAfterMap[leave.id] === 'unlimited' ? (
                            <span className="text-muted-foreground">Unlimited</span>
                          ) : remainingAfterMap[leave.id] !== undefined ? (
                            <span className="font-medium">{remainingAfterMap[leave.id]}</span>
                          ) : (
                            <span className="text-muted-foreground">…</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditLeave(leave)} title="View/Edit" aria-label="View or edit leave">
                              <Eye className="h-4 w-4" />
                            </Button>
                            {leave.status === 'pending' && (
                              <>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" onClick={() => handleStatusUpdate(leave.id, 'approved')} disabled={pendingLeaveId === leave.id} title="Approve" aria-label="Approve leave">
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => handleStatusUpdate(leave.id, 'rejected')} disabled={pendingLeaveId === leave.id} title="Reject" aria-label="Reject leave">
                                  <XCircle className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/20" onClick={() => handleStatusUpdate(leave.id, 'cancelled')} disabled={pendingLeaveId === leave.id} title="Cancel" aria-label="Cancel leave">
                                  <Ban className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {leave.status === 'approved' && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/20" onClick={() => handleStatusUpdate(leave.id, 'cancelled')} disabled={pendingLeaveId === leave.id} title="Cancel Leave" aria-label="Cancel leave">
                                <Ban className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteLeave(leave.id)} disabled={pendingLeaveId === leave.id} title="Delete" aria-label="Delete leave record">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination — full numbered style, matching Patients/Billing. */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                      .map((p, idx, arr) => {
                        const prev = arr[idx - 1]
                        const showEllipsis = prev && p - prev > 1
                        return (
                          <React.Fragment key={p}>
                            {showEllipsis && (
                              <span className="px-1 text-muted-foreground text-xs">...</span>
                            )}
                            <Button
                              variant={page === p ? 'default' : 'outline'}
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setPage(p)}
                            >
                              {p}
                            </Button>
                          </React.Fragment>
                        )
                      })}
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Leave Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLeave ? 'Edit Leave' : 'Apply Leave'}</DialogTitle>
            <DialogDescription>
              {editingLeave ? 'Update leave details below' : 'Fill in the leave application details'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="leave-employee">Employee *</Label>
              {isEmployeeRole ? (
                // Read-only display for therapist/receptionist roles
                <Input
                  id="leave-employee"
                  value={user?.name || user?.employeeId || 'You'}
                  readOnly
                  className="bg-muted cursor-not-allowed"
                />
              ) : (
                <Select
                  value={formData.employeeId}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, employeeId: v }))}
                  disabled={!!editingLeave}
                >
                  <SelectTrigger id="leave-employee" className="w-full">
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
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="leave-type">Leave Type *</Label>
                <Select
                  value={formData.leaveType}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, leaveType: v }))}
                >
                  <SelectTrigger id="leave-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {leaveTypes.map((lt) => (
                      <SelectItem key={lt.value} value={lt.value}>{lt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="leave-total-days">Total Days</Label>
                <Input
                  id="leave-total-days"
                  type="number"
                  min={1}
                  value={formData.totalDays}
                  readOnly
                  className="bg-muted"
                />
              </div>
            </div>

            {/* Remaining-balance preview for the selected leave type — read
                from the existing Leave Policy + Leave records, never a
                separate/duplicated number. "Remaining" leads as the
                headline since that's what decides whether the employee can
                actually apply; Allocated/Used are supporting detail. */}
            {!editingLeave && formData.employeeId && (
              applyBalanceLoading ? (
                <p className="text-xs text-muted-foreground">Loading balance…</p>
              ) : applyTypeBalance ? (
                <div className={`rounded-lg border p-3 space-y-1.5 ${applyBlocked ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10' : 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-900/10'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Remaining {applyTypeBalance.label}</span>
                    <span className={`text-lg font-bold ${applyBlocked ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {applyTypeBalance.annualRemaining ?? 'Unlimited'}
                      {applyTypeBalance.annualRemaining !== null && <span className="text-xs font-normal text-muted-foreground"> / {applyTypeBalance.annualLimit}</span>}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Allocated: {applyTypeBalance.annualLimit ?? 'Unlimited'} · Used: {applyTypeBalance.annualUsed}</p>
                  {applyBlocked && (
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">No remaining leave balance.</p>
                  )}
                </div>
              ) : null
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="leave-start-date">Start Date *</Label>
                <Input
                  id="leave-start-date"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="leave-end-date">End Date *</Label>
                <Input
                  id="leave-end-date"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="leave-reason">Reason *</Label>
              <Textarea
                id="leave-reason"
                value={formData.reason}
                onChange={(e) => setFormData((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="Enter reason for leave"
                rows={3}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting || (!editingLeave && applyBlocked)}>
              {submitting ? 'Saving...' : editingLeave ? 'Update Leave' : 'Apply Leave'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave Policy Settings Dialog — Super Admin only. Configures the
          annual/monthly limits, carry-forward, paid, and approval-required
          flags per existing leave type. Does not add/remove leave types. */}
      {isSuperAdmin && (
        <Dialog open={policySettingsOpen} onOpenChange={setPolicySettingsOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Leave Policy Settings</DialogTitle>
              <DialogDescription>
                Configure limits and rules per existing leave type. These apply to all employees unless a branch-specific override exists.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {leaveTypes.map((lt) => {
                const draft = policyDrafts[lt.value]
                if (!draft) return null
                const update = (patch: Partial<LeavePolicyRow>) =>
                  setPolicyDrafts((prev) => ({ ...prev, [lt.value]: { ...prev[lt.value], ...patch } }))
                return (
                  <Card key={lt.value} className="p-4 space-y-3">
                    <p className="text-sm font-semibold">{lt.label}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Annual Limit</Label>
                        <Input
                          type="number"
                          min={0}
                          placeholder="Unlimited"
                          value={draft.annualLimit ?? ''}
                          onChange={(e) => update({ annualLimit: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Monthly Limit</Label>
                        <Input
                          type="number"
                          min={0}
                          placeholder="No cap"
                          value={draft.monthlyLimit ?? ''}
                          onChange={(e) => update({ monthlyLimit: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Max Carry Forward Days</Label>
                        <Input
                          type="number"
                          min={0}
                          placeholder="—"
                          disabled={!draft.carryForwardAllowed}
                          value={draft.maxCarryForwardDays ?? ''}
                          onChange={(e) => update({ maxCarryForwardDays: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-6">
                      <label className="flex items-center gap-2 text-sm">
                        <Switch checked={draft.carryForwardAllowed} onCheckedChange={(v) => update({ carryForwardAllowed: v })} />
                        Carry Forward Allowed
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Switch checked={draft.isPaid} onCheckedChange={(v) => update({ isPaid: v })} />
                        Paid Leave
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Switch checked={draft.requiresApproval} onCheckedChange={(v) => update({ requiresApproval: v })} />
                        Approval Required
                      </label>
                    </div>
                  </Card>
                )
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPolicySettingsOpen(false)}>Cancel</Button>
              <Button onClick={handleSavePolicies} disabled={savingPolicies}>
                {savingPolicies ? 'Saving...' : 'Save Policies'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
