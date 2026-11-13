'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns'
import {
  Receipt,
  Plus,
  Filter,
  CheckCircle2,
  XCircle,
  Eye,
  Edit3,
  Trash2,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  IndianRupee,
  Upload,
  Loader2,
  X,
  FileText,
  Clock,
  Download,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { SearchInput } from '@/components/ui/search-input'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'
import { toast } from 'sonner'
import { useAppStore } from '@/store/app-store'
import { authFetch, authUpload } from '@/lib/api-client'
import { useSystemConfig } from '@/hooks/use-system-config'
import { ImportDialog } from '@/components/ui/import-dialog'

// Types
interface ExpenseRecord {
  id: string
  date: string
  category: string
  vendor: string | null
  description: string | null
  amount: number
  gst: number
  totalAmount: number
  paymentMode: string | null
  approvedBy?: string | null
  billUrl: string | null
  status: string
  approvedAt: string | null
  createdAt: string
}

// Category mapping: display label -> DB value (lowercase snake_case per schema)
const categoryOptions = [
  { label: 'Electricity', value: 'electricity' },
  { label: 'Internet', value: 'internet' },
  { label: 'Salary', value: 'salary' },
  { label: 'Marketing', value: 'marketing' },
  { label: 'Therapy Equipment', value: 'therapy_equipment' },
  { label: 'Stationery', value: 'stationery' },
  { label: 'Housekeeping', value: 'housekeeping' },
  { label: 'Maintenance', value: 'maintenance' },
  { label: 'Travel', value: 'travel' },
  { label: 'Training', value: 'training' },
  { label: 'Miscellaneous', value: 'miscellaneous' },
]

// Display labels for backward compatibility (category filter dropdown)
const categories = categoryOptions.map(c => c.label)

// Map DB value -> display label
const categoryLabelMap: Record<string, string> = {}
const categoryValueMap: Record<string, string> = {}
categoryOptions.forEach(c => {
  categoryLabelMap[c.value] = c.label
  categoryValueMap[c.label] = c.value
})

// Colors keyed by DB value
const categoryColors: Record<string, string> = {
  rent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  electricity: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  internet: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400',
  salary: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  marketing: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400',
  therapy_equipment: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  stationery: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  housekeeping: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400',
  maintenance: 'bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-400',
  travel: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400',
  training: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400',
  miscellaneous: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-400',
}

// Payment mode mapping: display label -> DB value
const paymentModeOptions = [
  { label: 'Cash', value: 'cash' },
  { label: 'UPI', value: 'upi' },
  { label: 'Card', value: 'card' },
  { label: 'Bank Transfer', value: 'bank_transfer' },
  { label: 'Cheque', value: 'cheque' },
]

const paymentModes = paymentModeOptions.map(m => m.label)
const paymentModeValueMap: Record<string, string> = {}
const paymentModeLabelMap: Record<string, string> = {}
paymentModeOptions.forEach(m => {
  paymentModeValueMap[m.label] = m.value
  paymentModeLabelMap[m.value] = m.label
})

// Expense By will be populated from employees
interface EmployeeOption {
  id: string
  name: string
  designation?: string | null
}

// Helper: get display label for a category DB value
function getCategoryLabel(dbValue: string): string {
  if (!dbValue) return ''
  // Handle both lowercase DB values and legacy Title Case values
  const normalizedKey = dbValue.toLowerCase().replace(/\s+/g, '_')
  return categoryLabelMap[normalizedKey] || categoryLabelMap[dbValue] || dbValue.replace(/_/g, ' ')
}

// Helper: check if a DB category value is one of our known categories
function isKnownCategory(dbValue: string): boolean {
  if (!dbValue) return false
  const normalizedKey = dbValue.toLowerCase().replace(/\s+/g, '_')
  return normalizedKey in categoryLabelMap || dbValue in categoryLabelMap
}

// Helper: get display label for payment mode DB value
function getPaymentModeLabel(dbValue: string): string {
  if (!dbValue) return ''
  const normalizedKey = dbValue.toLowerCase().replace(/\s+/g, '_')
  return paymentModeLabelMap[normalizedKey] || paymentModeLabelMap[dbValue] || dbValue.replace(/_/g, ' ')
}

// Helper: get category color class (handles both lowercase and legacy Title Case values)
function getCategoryColor(dbValue: string): string {
  if (!dbValue) return 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-400'
  const normalizedKey = dbValue.toLowerCase().replace(/\s+/g, '_')
  return categoryColors[normalizedKey] || categoryColors[dbValue] || 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-400'
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

// Expense status badge — pending=amber, approved=green, rejected=red, modified=blue
function getExpenseStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">Pending</Badge>
    case 'approved':
      return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">Approved</Badge>
    case 'rejected':
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">Rejected</Badge>
    case 'modified':
      return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">Modified</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export default function ExpensesPage() {
  const navigate = useAppStore((s) => s.navigate)
  const globalSearchQuery = useAppStore((s) => s.searchQuery)
  const setGlobalSearchQuery = useAppStore((s) => s.setSearchQuery)
  const { items: configCategories, loading: categoriesLoading } = useSystemConfig('expense_categories')
  const { items: configStatuses, loading: statusesLoading } = useSystemConfig('expense_statuses')
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)

  // Reusable debounced search — seeded with the global search bar value.
  const { query, debouncedQuery, setQuery, isDebouncing, clear } = useDebouncedSearch(globalSearchQuery)

  // Filters
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  // Payment Mode + Expense By are client-side filters (the API doesn't support them)
  const [filterPaymentMode, setFilterPaymentMode] = useState('')
  const [filterExpenseBy, setFilterExpenseBy] = useState('')

  useEffect(() => {
    if (globalSearchQuery) {
      setQuery(globalSearchQuery)
      setGlobalSearchQuery('')
    }
  }, [globalSearchQuery, setGlobalSearchQuery, setQuery])

  // Reset page when the debounced search actually fires
  useEffect(() => {
    setPage(1)
  }, [debouncedQuery])

  // Summary
  const [totalExpense, setTotalExpense] = useState(0)
  const [thisMonthExpense, setThisMonthExpense] = useState(0)
  const [totalGst, setTotalGst] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [approvedCount, setApprovedCount] = useState(0)
  const [rejectedCount, setRejectedCount] = useState(0)

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'add' | 'view' | 'modified'>('add')
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null)
  const [currentExpense, setCurrentExpense] = useState<ExpenseRecord | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Confirm dialog
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null)
  const [confirmExpense, setConfirmExpense] = useState<ExpenseRecord | null>(null)
  const [confirmSubmitting, setConfirmSubmitting] = useState(false)

  // Employees for "Expense By" dropdown
  const [employees, setEmployees] = useState<EmployeeOption[]>([])

  // Bill upload state
  const [billFile, setBillFile] = useState<File | null>(null)
  const [billUploading, setBillUploading] = useState(false)
  const [billFileName, setBillFileName] = useState<string>('')

  // Form (stores DB values for category and paymentMode)
  // NOTE: gstPercent is a UI-only helper for auto-calculating the GST amount;
  // it is NOT sent to the API (the backend only stores the absolute `gst` amount).
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    category: 'electricity', // DB value
    customCategory: '',
    expenseBy: '',
    vendor: '',
    description: '',
    amount: 0,
    gst: 0,
    gstPercent: 0,
    paymentMode: 'cash', // DB value
    billUrl: '',
    status: 'pending',
  })
  const [expenseByCustomMode, setExpenseByCustomMode] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)

  // ── Dynamic config merging (falls back to hardcoded while loading) ──
  const mergedCategoryOptions = (!categoriesLoading && configCategories.length > 0)
    ? configCategories.map((c) => ({ label: c.label, value: c.key }))
    : categoryOptions
  const mergedStatusOptions = (!statusesLoading && configStatuses.length > 0)
    ? configStatuses.map((s) => ({ label: s.label, value: s.key }))
    : [
        { label: 'Pending', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Modified', value: 'modified' },
        { label: 'Rejected', value: 'rejected' },
      ]

  // Fetch expenses
  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', page.toString())
      params.set('limit', limit.toString())
      if (debouncedQuery) params.set('search', debouncedQuery)
      if (filterCategory) params.set('category', filterCategory)
      if (filterStatus) params.set('status', filterStatus)

      const res = await authFetch(`/api/expenses?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setExpenses(json.expenses || [])
        setTotal(json.total)
        setTotalExpense(json.totalExpense || 0)
        setTotalGst(json.totalGst || 0)
      }
    } catch (err) {
      console.error('Failed to fetch expenses:', err)
      toast.error('Failed to fetch expenses')
    } finally {
      setLoading(false)
    }
  }, [page, debouncedQuery, filterCategory, filterStatus, limit])

  // Fetch employees for "Expense By" dropdown
  const fetchEmployees = useCallback(async () => {
    try {
      const res = await authFetch('/api/employees?limit=500')
      if (res.ok) {
        const json = await res.json()
        setEmployees((json.employees || []).map((e: { id: string; name: string; designation?: string | null }) => ({
          id: e.id,
          name: e.name,
          designation: e.designation,
        })))
      }
    } catch { /* silent */ }
  }, [])

  // Fetch all expenses for summary computation (this-month total + per-status counts).
  // We pull a larger page (1000) so the counts reflect all records, not just the visible page.
  const fetchThisMonth = useCallback(async () => {
    try {
      const res = await authFetch('/api/expenses?limit=1000')
      if (res.ok) {
        const json = await res.json()
        const all = (json.expenses || []) as ExpenseRecord[]
        const now = new Date()
        const monthStart = startOfMonth(now)
        const monthEnd = endOfMonth(now)
        const thisMonth = all.filter((e) =>
          isWithinInterval(parseISO(e.date), { start: monthStart, end: monthEnd })
        )
        setThisMonthExpense(thisMonth.reduce((sum, e) => sum + e.totalAmount, 0))
        setPendingCount(all.filter((e) => e.status === 'pending').length)
        setApprovedCount(all.filter((e) => e.status === 'approved').length)
        setRejectedCount(all.filter((e) => e.status === 'rejected').length)
      }
    } catch (err) {
      console.error('Failed to fetch summary:', err)
      toast.error('Failed to load expense summary')
    }
  }, [])

  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

  useEffect(() => {
    fetchThisMonth()
  }, [fetchThisMonth])

  useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees])

  // Auto calculate total
  const formTotal = formData.amount + formData.gst

  // Open dialog for new expense
  const resetForm = () => {
    setFormData({
      date: format(new Date(), 'yyyy-MM-dd'),
      category: 'electricity',
      customCategory: '',
      expenseBy: '',
      vendor: '',
      description: '',
      amount: 0,
      gst: 0,
      gstPercent: 0,
      paymentMode: 'cash',
      billUrl: '',
      status: 'pending',
    })
    setExpenseByCustomMode(false)
    setBillFile(null)
    setBillFileName('')
    setBillUploading(false)
  }

  const populateForm = (expense: ExpenseRecord) => {
    const isKnown = isKnownCategory(expense.category)
    // Try to detect a common GST rate from the existing amount/gst so the % field
    // is pre-populated when it makes sense (5/12/18/28 are the common Indian GST slabs).
    let gstPercent = 0
    if (expense.amount > 0 && expense.gst > 0) {
      const computed = Math.round((expense.gst / expense.amount) * 100 * 100) / 100
      if ([5, 12, 18, 28].some((v) => v === computed)) {
        gstPercent = computed
      }
    }
    setFormData({
      date: format(parseISO(expense.date), 'yyyy-MM-dd'),
      category: isKnown ? expense.category : 'other',
      customCategory: isKnown ? '' : expense.category,
      expenseBy: expense.approvedBy || '',
      vendor: expense.vendor || '',
      description: expense.description || '',
      amount: expense.amount,
      gst: expense.gst,
      gstPercent,
      paymentMode: expense.paymentMode || 'cash',
      billUrl: expense.billUrl || '',
      status: expense.status,
    })
    setExpenseByCustomMode(!!expense.approvedBy && !employees.some((emp) => emp.name === expense.approvedBy))
    setBillFile(null)
    setBillFileName(expense.billUrl ? expense.billUrl.split('/').pop() || '' : '')
  }

  // Delete expense
  const handleDeleteExpense = async (expense: ExpenseRecord) => {
    if (!confirm(`Are you sure you want to delete this expense (${getCategoryLabel(expense.category)} - ${formatCurrency(expense.totalAmount)})?`)) return
    if (deletingExpenseId) return
    setDeletingExpenseId(expense.id)
    try {
      const res = await authFetch(`/api/expenses?id=${expense.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        toast.error(errData.error || 'Failed to delete expense')
        return
      }
      toast.success('Expense deleted')
      fetchExpenses()
      fetchThisMonth()
    } catch {
      toast.error('Failed to delete expense')
    } finally {
      setDeletingExpenseId(null)
    }
  }

  const handleNewExpense = () => {
    setCurrentExpense(null)
    setDialogMode('add')
    resetForm()
    setDialogOpen(true)
  }

  const handleEditExpense = (expense: ExpenseRecord) => {
    setCurrentExpense(expense)
    setDialogMode('modified')
    populateForm(expense)
    setDialogOpen(true)
  }

  const handleViewExpense = (expense: ExpenseRecord) => {
    setCurrentExpense(expense)
    setDialogMode('view')
    populateForm(expense)
    setDialogOpen(true)
  }

  // Handle approve/reject
  const handleStatusUpdate = async (expenseId: string, status: string) => {
    try {
      const res = await authFetch('/api/expenses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: expenseId, status }),
      })
      if (res.ok) {
        toast.success(`Expense ${status} successfully`)
        fetchExpenses()
        fetchThisMonth() // refresh KPI cards (pending/approved/rejected counts)
      } else {
        toast.error('Failed to update expense status')
      }
    } catch {
      toast.error('Failed to update expense status')
    }
  }

  const openConfirmDialog = (expense: ExpenseRecord, action: 'approve' | 'reject') => {
    setConfirmExpense(expense)
    setConfirmAction(action)
    setConfirmOpen(true)
  }

  const submitConfirmAction = async () => {
    if (!confirmExpense || !confirmAction) return
    setConfirmSubmitting(true)
    const status = confirmAction === 'approve' ? 'approved' : 'rejected'
    try {
      const res = await authFetch('/api/expenses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: confirmExpense.id, status }),
      })
      if (res.ok) {
        toast.success(`Expense ${status} successfully`)
        fetchExpenses()
        fetchThisMonth() // refresh KPI cards (pending/approved/rejected counts)
      } else {
        toast.error(`Failed to ${confirmAction} expense`)
      }
    } catch {
      toast.error(`Failed to ${confirmAction} expense`)
    } finally {
      setConfirmSubmitting(false)
      setConfirmOpen(false)
      setConfirmAction(null)
      setConfirmExpense(null)
    }
  }

  // Upload bill file
  const handleBillUpload = async (file: File) => {
    setBillUploading(true)
    try {
      const fd = new FormData()
      fd.append('bill', file)
      const res = await authUpload('/api/expenses/upload-bill', {
        method: 'POST',
        body: fd,
      })
      if (res.ok) {
        const data = await res.json()
        setFormData(prev => ({ ...prev, billUrl: data.billUrl }))
        setBillFileName(file.name)
        setBillFile(file)
        toast.success('Bill uploaded successfully')
      } else {
        const errData = await res.json().catch(() => ({}))
        toast.error(errData.error || 'Failed to upload bill')
      }
    } catch {
      toast.error('Failed to upload bill')
    } finally {
      setBillUploading(false)
    }
  }

  // Remove uploaded bill
  const handleRemoveBill = () => {
    setFormData(prev => ({ ...prev, billUrl: '' }))
    setBillFile(null)
    setBillFileName('')
  }

  // Submit form
  const handleSubmit = async () => {
    if (formData.category === 'other' && !formData.customCategory.trim()) {
      toast.error('Custom category is required when Category is Other')
      return
    }

    if (!formData.expenseBy) {
      toast.error('Please select who made this expense')
      return
    }

    if (formData.amount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    setSubmitting(true)
    try {
      // Upload bill first if a new file is selected
      let billUrl = formData.billUrl
      if (billFile && !billUrl) {
        const fd = new FormData()
        fd.append('bill', billFile)
        const uploadRes = await authUpload('/api/expenses/upload-bill', {
          method: 'POST',
          body: fd,
        })
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json()
          billUrl = uploadData.billUrl
        }
      }

      // Use DB value for category; if 'other', use the custom category as-is
      const categoryDbValue = formData.category === 'other' ? formData.customCategory.trim().toLowerCase().replace(/\s+/g, '_') : formData.category
      // NOTE: gstPercent is intentionally NOT included in the payload — the API
      // only stores the absolute `gst` amount. gstPercent is a UI-only helper.
      const payload: Record<string, unknown> = {
        date: formData.date,
        category: categoryDbValue,
        vendor: formData.vendor || null,
        description: formData.description || null,
        amount: formData.amount,
        gst: formData.gst,
        paymentMode: formData.paymentMode, // already in DB format
        billUrl: billUrl || null,
        status: dialogMode === 'modified' ? 'modified' : formData.status,
        approvedBy: formData.expenseBy, // mandatory — validated above
      }

      if (dialogMode === 'modified' && currentExpense) {
        payload.id = currentExpense.id
      }

      const res = await authFetch('/api/expenses', {
        method: dialogMode === 'modified' ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        toast.success(dialogMode === 'modified' ? 'Expense updated successfully' : 'Expense added successfully')
        setDialogOpen(false)
        fetchExpenses()
        fetchThisMonth()
      } else {
        toast.error('Failed to save expense')
      }
    } catch {
      toast.error('Failed to save expense')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Export to Excel — re-fetches with the currently active server-side
  // filters (search/category/status) plus a large limit, then applies the
  // two client-side-only filters (payment mode / expense by) locally so the
  // export always matches what's on screen. ──
  const [exportingExpenses, setExportingExpenses] = useState(false)
  const handleExportExpenses = async () => {
    if (exportingExpenses) return
    setExportingExpenses(true)
    try {
      const params = new URLSearchParams({ page: '1', limit: '100000' })
      if (debouncedQuery) params.set('search', debouncedQuery)
      if (filterCategory) params.set('category', filterCategory)
      if (filterStatus) params.set('status', filterStatus)
      const res = await authFetch(`/api/expenses?${params.toString()}`)
      if (!res.ok) {
        toast.error('Failed to export expenses')
        return
      }
      const json = await res.json()
      const all: ExpenseRecord[] = (json.expenses || []).filter((e: ExpenseRecord) => {
        if (filterPaymentMode && e.paymentMode !== filterPaymentMode) return false
        if (filterExpenseBy && (e.approvedBy || '') !== filterExpenseBy) return false
        return true
      })

      const headers = [
        'Date', 'Category', 'Expense By', 'Vendor', 'Description',
        'Amount', 'GST', 'Total', 'Payment Mode', 'Status',
      ]
      const rows = all.map((e) => [
        format(parseISO(e.date), 'dd MMM yyyy'),
        getCategoryLabel(e.category),
        e.approvedBy || '',
        e.vendor || '',
        e.description || '',
        e.amount,
        e.gst,
        e.totalAmount,
        getPaymentModeLabel(e.paymentMode || ''),
        e.status,
      ])

      const XLSX = await import('xlsx')
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Expenses')
      XLSX.writeFile(wb, 'Expenses.xlsx')
    } catch (err) {
      console.error('Failed to export expenses:', err)
      toast.error('Something went wrong while exporting')
    } finally {
      setExportingExpenses(false)
    }
  }

  const totalPages = Math.ceil(total / limit)

  // Action permission helpers
  const canEdit = (status: string) => status === 'pending' || status === 'modified'
  const canDelete = (status: string) => status === 'pending' || status === 'modified'
  const canApproveOrReject = (status: string) => status === 'pending'

  // Client-side filters (Payment Mode + Expense By) — applied on top of the API response.
  // The API supports search/category/status server-side; these two are local-only.
  const visibleExpenses = expenses.filter((e) => {
    if (filterPaymentMode && e.paymentMode !== filterPaymentMode) return false
    if (filterExpenseBy && (e.approvedBy || '') !== filterExpenseBy) return false
    return true
  })

  // Active filter count for the badge in the filter bar.
  const activeFilterCount = [filterCategory, filterStatus, filterPaymentMode, filterExpenseBy].filter(Boolean).length

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expense Management</h1>
          <p className="text-muted-foreground text-sm">Track and manage center expenses</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportExpenses} disabled={exportingExpenses}>
            <Download className="h-4 w-4 mr-2" />
            Export to Excel
          </Button>
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button onClick={handleNewExpense}>
            <Plus className="h-4 w-4 mr-2" />
            Add Expense
          </Button>
        </div>
      </div>

      {/* Summary Cards — 2 cols mobile, 3 cols sm, 6 cols lg */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {/* Total Expenses — blue */}
        <Card className="p-4 gap-0">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium truncate">Total Expenses</p>
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400 truncate">{formatCurrency(totalExpense)}</p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
              <TrendingDown className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </Card>
        {/* This Month — indigo */}
        <Card className="p-4 gap-0">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium truncate">This Month</p>
              <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400 truncate">{formatCurrency(thisMonthExpense)}</p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/40">
              <Receipt className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
        </Card>
        {/* Pending — amber */}
        <Card className="p-4 gap-0">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium truncate">Pending</p>
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400 truncate">{pendingCount}</p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
        </Card>
        {/* Approved — green */}
        <Card className="p-4 gap-0">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium truncate">Approved</p>
              <p className="text-xl font-bold text-green-600 dark:text-green-400 truncate">{approvedCount}</p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/40">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </Card>
        {/* Rejected — red */}
        <Card className="p-4 gap-0">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium truncate">Rejected</p>
              <p className="text-xl font-bold text-red-600 dark:text-red-400 truncate">{rejectedCount}</p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/40">
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </Card>
        {/* GST Paid — purple */}
        <Card className="p-4 gap-0">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium truncate">GST Paid</p>
              <p className="text-xl font-bold text-purple-600 dark:text-purple-400 truncate">{formatCurrency(totalGst)}</p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/40">
              <IndianRupee className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            onClear={clear}
            loading={isDebouncing || loading}
            placeholder="Search by description, vendor, category..."
            className="flex-1 min-w-[200px]"
          />
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Filters:</span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="text-xs">{activeFilterCount} active</Badge>
            )}
          </div>
          <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {mergedCategoryOptions.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {mergedStatusOptions.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Payment Mode — client-side filter */}
          <Select value={filterPaymentMode} onValueChange={(v) => setFilterPaymentMode(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="All Modes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payment Modes</SelectItem>
              {paymentModeOptions.map((mode) => (
                <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Expense By — client-side filter */}
          <Select value={filterExpenseBy} onValueChange={(v) => setFilterExpenseBy(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="All Expense By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Expense By</SelectItem>
              {employees.map((emp) => (
                <SelectItem key={emp.id} value={emp.name}>{emp.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Expenses Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expense Records</CardTitle>
          <CardDescription>{total} total expenses</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : visibleExpenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Receipt className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-muted-foreground text-sm">No expenses found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="hidden md:table-cell">Expense By</TableHead>
                      <TableHead className="hidden md:table-cell">Vendor</TableHead>
                      <TableHead className="hidden lg:table-cell">Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">GST</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="hidden md:table-cell">Mode</TableHead>
                      <TableHead className="hidden lg:table-cell">Bill</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleExpenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell className="text-sm">{format(parseISO(expense.date), 'dd MMM yyyy')}</TableCell>
                        <TableCell>
                          <Badge className={getCategoryColor(expense.category)}>
                            {getCategoryLabel(expense.category)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{expense.approvedBy || '-'}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{expense.vendor || '-'}</TableCell>
                        <TableCell className="hidden lg:table-cell max-w-[160px] truncate text-sm text-muted-foreground">{expense.description || '-'}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(expense.amount)}</TableCell>
                        <TableCell className="text-right hidden sm:table-cell text-sm">{formatCurrency(expense.gst)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(expense.totalAmount)}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{getPaymentModeLabel(expense.paymentMode || '')}</TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {expense.billUrl ? (
                            <a href={expense.billUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline" title="View bill">
                              <FileText className="h-3.5 w-3.5" />
                              Bill
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{getExpenseStatusBadge(expense.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* View — always shown; disabled for non-pending (records are locked once approved/rejected) */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleViewExpense(expense)}
                              title="View"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canEdit(expense.status) ? (
                              <>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20" onClick={() => handleEditExpense(expense)} title="Edit">
                                  <Edit3 className="h-4 w-4" />
                                </Button>
                                {canApproveOrReject(expense.status) && (
                                  <>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" onClick={() => openConfirmDialog(expense, 'approve')} title="Approve">
                                      <CheckCircle2 className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => openConfirmDialog(expense, 'reject')} title="Reject">
                                      <XCircle className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                                {canDelete(expense.status) ? (
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteExpense(expense)} disabled={deletingExpenseId === expense.id} title="Delete" aria-label="Delete expense">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <div className="h-8 w-8" aria-hidden="true" />
                                )}
                              </>
                            ) : (
                              <>
                                {/* Maintain layout for rows that can't be edited/deleted */}
                                <div className="h-8 w-8" aria-hidden="true" />
                                <div className="h-8 w-8" aria-hidden="true" />
                                <div className="h-8 w-8" aria-hidden="true" />
                                <div className="h-8 w-8" aria-hidden="true" />
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages} ({total} records)
                  </p>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Rows:</span>
                          <Select value={String(limit)} onValueChange={(v) => { setLimit(parseInt(v)); setPage(1) }}>
                            <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="10">10</SelectItem>
                              <SelectItem value="20">20</SelectItem>
                              <SelectItem value="50">50</SelectItem>
                              <SelectItem value="100">100</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Expense Form Dialog — sticky header + scrollable body + sticky footer */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {dialogMode === 'view' ? 'View Expense' : dialogMode === 'modified' ? 'Edit Expense' : 'Add Expense'}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === 'view'
                ? 'Review expense details'
                : dialogMode === 'modified'
                ? 'Update expense details below'
                : 'Fill in the expense details'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1">
            {/* Row 1: Date + Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                  readOnly={dialogMode === 'view'}
                />
              </div>
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, category: v }))}
                  disabled={dialogMode === 'view'}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {mergedCategoryOptions.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formData.category === 'other' && (
              <div className="space-y-2">
                <Label>Custom Category *</Label>
                <Input
                  value={formData.customCategory}
                  onChange={(e) => setFormData((prev) => ({ ...prev, customCategory: e.target.value }))}
                  placeholder="Enter custom category"
                  readOnly={dialogMode === 'view'}
                />
              </div>
            )}
            {/* Row 2: Expense By + Vendor */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Expense By *</Label>
                {expenseByCustomMode ? (
                  <div className="space-y-1">
                    <Input
                      autoFocus
                      placeholder="Enter person's name"
                      value={formData.expenseBy}
                      onChange={(e) => setFormData((prev) => ({ ...prev, expenseBy: e.target.value }))}
                      readOnly={dialogMode === 'view'}
                    />
                    {dialogMode !== 'view' && (
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => { setExpenseByCustomMode(false); setFormData((prev) => ({ ...prev, expenseBy: '' })) }}
                      >
                        ← Choose from list
                      </button>
                    )}
                  </div>
                ) : (
                  <Select
                    value={formData.expenseBy || '__none__'}
                    onValueChange={(v) => {
                      if (v === '__custom__') {
                        setExpenseByCustomMode(true)
                        setFormData((prev) => ({ ...prev, expenseBy: '' }))
                        return
                      }
                      setFormData((prev) => ({ ...prev, expenseBy: v === '__none__' ? '' : v }))
                    }}
                    disabled={dialogMode === 'view'}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select person" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.name}>{emp.name}{emp.designation ? ` (${emp.designation})` : ''}</SelectItem>
                      ))}
                      <SelectItem value="__custom__" className="text-primary font-medium">+ Add New Person</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label>Vendor</Label>
                <Input
                  value={formData.vendor}
                  onChange={(e) => setFormData((prev) => ({ ...prev, vendor: e.target.value }))}
                  placeholder="Vendor name"
                  readOnly={dialogMode === 'view'}
                />
              </div>
            </div>
            {/* Row 3: Amount + GST % */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount *</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                  className="appearance-none"
                  value={formData.amount === 0 ? '' : formData.amount}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0
                    setFormData((prev) => ({
                      ...prev,
                      amount: val,
                      // Auto-recompute the GST amount when a percent is set
                      gst: prev.gstPercent ? Math.round(val * (prev.gstPercent / 100) * 100) / 100 : prev.gst,
                    }))
                  }}
                  readOnly={dialogMode === 'view'}
                />
              </div>
              <div className="space-y-2">
                <Label>GST %</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                  className="appearance-none"
                  value={formData.gstPercent === 0 ? '' : formData.gstPercent}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0
                    setFormData((prev) => ({
                      ...prev,
                      gstPercent: val,
                      gst: Math.round(prev.amount * (val / 100) * 100) / 100,
                    }))
                  }}
                  readOnly={dialogMode === 'view'}
                  placeholder="e.g. 18 (auto-calculates GST amount)"
                />
              </div>
            </div>
            {/* Row 4: GST Amount + Payment Mode */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>GST Amount</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                  className="appearance-none"
                  value={formData.gst === 0 ? '' : formData.gst}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0
                    // Manual override of the GST amount clears the % field
                    setFormData((prev) => ({ ...prev, gst: val, gstPercent: 0 }))
                  }}
                  readOnly={dialogMode === 'view'}
                />
              </div>
              <div className="space-y-2">
                <Label>Payment Mode</Label>
                <Select
                  value={formData.paymentMode}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, paymentMode: v }))}
                  disabled={dialogMode === 'view'}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentModeOptions.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Row 5: Total (full width, read-only) */}
            <div className="rounded-lg border p-3 flex justify-between font-semibold bg-muted/30">
              <span>Total (Amount + GST)</span>
              <span>{formatCurrency(formTotal)}</span>
            </div>
            {/* Row 6: Description (full width) */}
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Expense description"
                rows={2}
                readOnly={dialogMode === 'view'}
              />
            </div>
            {/* Row 7: Bill Upload (full width) */}
            <div className="space-y-2">
              <Label>Bill Upload</Label>
              {formData.billUrl ? (
                <div className="border rounded-lg p-3 flex items-center gap-3 bg-muted/30">
                  {formData.billUrl.toLowerCase().endsWith('.pdf') ? (
                    <FileText className="h-12 w-12 text-red-500 shrink-0" />
                  ) : (
                    <Image
                      src={formData.billUrl}
                      alt="Bill preview"
                      width={80}
                      height={80}
                      className="max-h-20 max-w-20 object-contain rounded border shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{billFileName || formData.billUrl.split('/').pop()}</p>
                    <p className="text-xs text-muted-foreground">Bill uploaded</p>
                  </div>
                  {dialogMode !== 'view' && (
                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={formData.billUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
                        title="View bill"
                      >
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </a>
                      <button
                        type="button"
                        onClick={handleRemoveBill}
                        className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-red-50 transition-colors"
                        title="Remove bill"
                      >
                        <X className="h-4 w-4 text-red-500" />
                      </button>
                    </div>
                  )}
                </div>
              ) : dialogMode !== 'view' ? (
                <div
                  className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/50 transition-colors relative"
                  onClick={() => {
                    const input = document.getElementById('bill-upload-input') as HTMLInputElement
                    input?.click()
                  }}
                >
                  {billUploading ? (
                    <>
                      <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                      <p className="text-sm text-muted-foreground">Uploading...</p>
                    </>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Click to upload bill</p>
                      <p className="text-xs text-muted-foreground">PNG, JPG, PDF up to 5MB</p>
                    </>
                  )}
                  <input
                    id="bill-upload-input"
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        // Validate file size
                        if (file.size > 5 * 1024 * 1024) {
                          toast.error('File size must be under 5MB')
                          return
                        }
                        handleBillUpload(file)
                      }
                      // Reset input so same file can be re-selected
                      e.target.value = ''
                    }}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No bill uploaded</p>
              )}
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            {dialogMode !== 'view' && (
              <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                {submitting ? 'Saving...' : dialogMode === 'modified' ? 'Save Changes' : 'Add Expense'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Approve/Reject Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmAction === 'approve' ? 'Approve Expense' : 'Reject Expense'}</DialogTitle>
            <DialogDescription>
              {confirmAction === 'approve'
                ? 'Are you sure you want to approve this expense?'
                : 'Are you sure you want to reject this expense?'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={confirmSubmitting}>No</Button>
            <Button onClick={submitConfirmAction} disabled={confirmSubmitting}>
              {confirmSubmitting ? 'Saving...' : 'Yes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        module="expenses"
        title="Import Expenses"
        onImportComplete={() => fetchExpenses()}
      />
    </div>
  )
}
