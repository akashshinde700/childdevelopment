'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
} from 'date-fns'
import {
  Plus, Wallet, CreditCard, Banknote, Building2, ChevronLeft, ChevronRight,
  IndianRupee, CalendarCheck, TrendingUp, Eye, Printer, Trash2, FileDown,
  Clock, CalendarDays, AlertCircle, Filter,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { ActionDialog } from '@/components/ui/action-dialog'
import { SearchInput } from '@/components/ui/search-input'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'
import { useAppStore } from '@/store/app-store'
import { authFetch } from '@/lib/api-client'
import { buildDocumentHTML, deliverDocument, escapeHTML as esc } from '@/components/print/DocumentLayout'
import { usePrintSettings } from '@/components/print/PrintSettingsDialog'
import { toast } from 'sonner'

interface Patient {
  id: string
  patientId: string
  childName: string
}

interface Invoice {
  id: string
  invoiceNo: string
  patientId: string
  totalAmount: number
  balanceDue: number
  patient: { childName: string }
}

interface Payment {
  id: string
  paymentNo: string
  patientId: string
  patient: { childName: string; patientId: string; mobile?: string | null }
  branch?: { name: string; code: string } | null
  invoiceId?: string
  amount: number
  paymentMode: string
  referenceNo?: string
  date: string
  type: string
  status: string
  notes?: string
  createdAt?: string
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount)

const modeIcons: Record<string, React.ReactNode> = {
  cash: <Banknote className="size-3.5" />,
  upi: <Wallet className="size-3.5" />,
  card: <CreditCard className="size-3.5" />,
  bank_transfer: <Building2 className="size-3.5" />,
  cheque: <Wallet className="size-3.5" />,
}

const typeColors: Record<string, string> = {
  payment: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  advance: 'bg-blue-100 text-blue-800 border-blue-200',
  refund: 'bg-red-100 text-red-800 border-red-200',
}

const statusColors: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  partially_paid: 'bg-orange-100 text-orange-800 border-orange-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
  refunded: 'bg-gray-100 text-gray-800 border-gray-200',
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 69: Role-based access control helpers
// ─────────────────────────────────────────────────────────────────────────────
const isReceptionist = (role?: string) => role === 'receptionist'
const isAdmin = (role?: string) => role === 'admin' || role === 'super_admin'

// A payment is considered "completed" if its status is 'completed' or 'paid'
// (preventing further edits / deletes).
const isCompletedPayment = (status: string) =>
  status === 'completed' || status === 'paid'

export default function PaymentsPage() {
  const { searchQuery: globalSearchQuery, setSearchQuery: setGlobalSearchQuery, user } = useAppStore()
  const role = user?.role
  // RBAC flags
  const canCreate = isReceptionist(role) || isAdmin(role)
  const canDelete = isAdmin(role)
  const canExport = isAdmin(role)
  const canViewPrint = true // All roles can view + print
  const { printWithSettings, PrintSettingsDialog } = usePrintSettings()

  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [patients, setPatients] = useState<Patient[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])

  // Summary
  const [totalCollected, setTotalCollected] = useState(0)
  const [todayCollection, setTodayCollection] = useState(0)
  const [monthCollection, setMonthCollection] = useState(0)
  const [pendingAmount, setPendingAmount] = useState(0)
  const [advanceBalance, setAdvanceBalance] = useState(0)
  const [todayCount, setTodayCount] = useState(0)

  // Reusable debounced search — seeded with the global search bar value.
  const { query, debouncedQuery, setQuery, isDebouncing, clear } = useDebouncedSearch(globalSearchQuery)

  // Filters (Task 69 — advanced filters)
  const [filterPatient, setFilterPatient] = useState('')
  const [filterMode, setFilterMode] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [rangeFilter, setRangeFilter] = useState<'all' | 'today' | 'week' | 'month'>('all')

  useEffect(() => {
    if (globalSearchQuery) {
      setQuery(globalSearchQuery)
      setGlobalSearchQuery('')
    }
  }, [globalSearchQuery, setGlobalSearchQuery, setQuery])

  // Pagination
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 20

  // Reset page when the debounced search or any filter actually fires
  useEffect(() => {
    setPage(1)
  }, [debouncedQuery, filterPatient, filterMode, filterType, filterStatus, rangeFilter])

  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null)

  // Task 69: View Payment Details modal state
  const [viewPayment, setViewPayment] = useState<Payment | null>(null)
  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [patientHistory, setPatientHistory] = useState<Payment[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const [form, setForm] = useState({
    patientId: '',
    amount: '',
    paymentMode: 'cash',
    referenceNo: '',
    type: 'payment',
    notes: '',
    invoiceId: '',
  })

  const fetchPayments = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (debouncedQuery) params.set('search', debouncedQuery)
      if (filterPatient) params.set('patientId', filterPatient)
      if (filterMode !== 'all') params.set('paymentMode', filterMode)
      if (filterType !== 'all') params.set('type', filterType)
      if (filterStatus !== 'all') params.set('status', filterStatus)
      if (rangeFilter !== 'all') {
        const now = new Date()
        let start: Date
        let end: Date
        if (rangeFilter === 'today') {
          start = startOfDay(now)
          end = endOfDay(now)
        } else if (rangeFilter === 'week') {
          start = startOfWeek(now, { weekStartsOn: 1 })
          end = endOfWeek(now, { weekStartsOn: 1 })
        } else {
          start = startOfMonth(now)
          end = endOfMonth(now)
        }
        params.set('startDate', format(start, 'yyyy-MM-dd'))
        params.set('endDate', format(end, 'yyyy-MM-dd'))
      }
      const res = await authFetch(`/api/payments?${params}`)
      const data = await res.json()
      setPayments(data.payments || [])
      setTotal(data.total || 0)
      setTotalCollected(data.totalCollected || 0)
      setTodayCollection(data.todayCollection || 0)
      setMonthCollection(data.monthCollection || 0)
      setPendingAmount(data.pendingAmount || 0)
      setAdvanceBalance(data.advanceBalance || 0)
      setTodayCount(data.todayCount || 0)
    } catch {
      toast.error('Failed to fetch payments')
    } finally {
      setLoading(false)
    }
  }, [page, debouncedQuery, filterPatient, filterMode, filterType, filterStatus, rangeFilter])

  const fetchPatients = useCallback(async () => {
    try {
      const res = await authFetch('/api/patients?limit=1000')
      const data = await res.json()
      setPatients(data.patients || [])
    } catch { /* silent */ }
  }, [])

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await authFetch('/api/invoices?limit=1000')
      const data = await res.json()
      setInvoices(data.invoices || [])
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchPayments() }, [fetchPayments])
  useEffect(() => { fetchPatients(); fetchInvoices() }, [fetchPatients, fetchInvoices])

  const handleSubmit = async () => {
    if (!form.patientId) throw new Error('Please select a patient')
    if (!form.amount || Number(form.amount) <= 0) throw new Error('Please enter a valid amount')

    // Validate payment amount doesn't exceed invoice balance due
    if (form.invoiceId) {
      const invoice = filteredInvoices.find(inv => inv.id === form.invoiceId)
      if (invoice && Number(form.amount) > invoice.balanceDue) {
        throw new Error(`Payment amount cannot exceed the invoice balance due of ₹${invoice.balanceDue}`)
      }
    }

    const res = await authFetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        amount: Number(form.amount),
        invoiceId: form.invoiceId || undefined,
      }),
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || 'Failed to record payment')
    }
    setForm({ patientId: '', amount: '', paymentMode: 'cash', referenceNo: '', type: 'payment', notes: '', invoiceId: '' })
    fetchPayments()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await authFetch(`/api/payments?id=${deleteTarget.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || 'Failed to delete payment')
    }
    setDeleteTarget(null)
    fetchPayments()
  }

  const openDelete = (payment: Payment) => {
    setDeleteTarget(payment)
    setDeleteDialogOpen(true)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Task 69: View Payment Details modal — loads patient payment history on open
  // ───────────────────────────────────────────────────────────────────────────
  const openView = async (payment: Payment) => {
    setViewPayment(payment)
    setViewDialogOpen(true)
    setPatientHistory([])
    setHistoryLoading(true)
    try {
      const res = await authFetch(`/api/payments?patientId=${payment.patientId}&limit=200`)
      const data = await res.json()
      setPatientHistory(data.payments || [])
    } catch {
      /* silent — history is non-critical */
    } finally {
      setHistoryLoading(false)
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Task 69: Print Receipt — uses buildDocumentHTML for a professional A4 layout
  // ───────────────────────────────────────────────────────────────────────────
  const handlePrint = (payment: Payment) => printWithSettings((mode, branding, output) => {
    const receiptDate = format(new Date(payment.date), 'dd MMM yyyy')
    const createdAt = payment.createdAt
      ? format(new Date(payment.createdAt), 'dd MMM yyyy, hh:mm a')
      : receiptDate

    const statusClass =
      isCompletedPayment(payment.status) ? 'status-completed'
      : payment.status === 'failed' ? 'status-failed'
      : 'status-pending'

    const bodyHTML = `
      <div class="receipt">
        <div class="receipt-title-bar">
          <h1>PAYMENT RECEIPT</h1>
          <div class="receipt-meta">
            <div><span class="lbl">Receipt No:</span> <strong>${esc(payment.paymentNo)}</strong></div>
            <div><span class="lbl">Date:</span> <strong>${receiptDate}</strong></div>
          </div>
        </div>

        <div class="receipt-grid">
          <div class="receipt-section">
            <h3>Patient Details</h3>
            <table class="kv">
              <tr><td class="lbl">Patient Name</td><td>${esc(payment.patient?.childName) || 'N/A'}</td></tr>
              <tr><td class="lbl">Patient ID</td><td>${esc(payment.patient?.patientId) || '-'}</td></tr>
              <tr><td class="lbl">Branch</td><td>${esc(payment.branch?.name) || 'Main Branch'}</td></tr>
            </table>
          </div>
          <div class="receipt-section">
            <h3>Payment Details</h3>
            <table class="kv">
              <tr><td class="lbl">Payment Mode</td><td>${esc(payment.paymentMode.replace('_', ' '))}</td></tr>
              <tr><td class="lbl">Reference No</td><td>${esc(payment.referenceNo) || '-'}</td></tr>
              <tr><td class="lbl">Payment Type</td><td>${esc(payment.type)}</td></tr>
              <tr><td class="lbl">Status</td><td><span class="status ${statusClass}">${esc(payment.status)}</span></td></tr>
            </table>
          </div>
        </div>

        <div class="receipt-summary">
          <h3>Payment Summary</h3>
          <table class="summary">
            <tr><td>Amount Paid</td><td class="amt">${formatCurrency(payment.amount)}</td></tr>
            <tr class="total"><td>Total</td><td class="amt">${formatCurrency(payment.amount)}</td></tr>
          </table>
        </div>

        ${payment.notes ? `<div class="receipt-notes"><h3>Notes</h3><p>${esc(payment.notes)}</p></div>` : ''}

        <div class="receipt-footer">
          <div class="sign-box">
            <div class="sign-line"></div>
            <p>Authorized Signature</p>
          </div>
          <div class="receipt-meta-foot">
            <p>Generated on ${format(new Date(), 'dd MMM yyyy, hh:mm a')}</p>
            <p>This is a computer-generated receipt.</p>
          </div>
        </div>
      </div>
    `

    const extraCSS = `
      .receipt { padding: 4px 0; color: #1f2937; }
      .receipt-title-bar {
        display: flex; justify-content: space-between; align-items: flex-end;
        border-bottom: 3px solid #0F7A87; padding-bottom: 10px; margin-bottom: 18px;
      }
      .receipt-title-bar h1 { font-size: 22px; color: #0F7A87; margin: 0; letter-spacing: 1px; }
      .receipt-meta { text-align: right; font-size: 12px; line-height: 1.6; }
      .receipt-meta .lbl { color: #6b7280; }
      .receipt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px; }
      .receipt-section { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; }
      .receipt-section h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;
        color: #0F7A87; margin: 0 0 8px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
      table.kv { width: 100%; border-collapse: collapse; font-size: 12px; }
      table.kv td { padding: 3px 0; vertical-align: top; }
      table.kv td.lbl { color: #6b7280; width: 45%; }
      .status { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: capitalize; }
      .status-completed { background: #dcfce7; color: #15803d; }
      .status-failed { background: #fee2e2; color: #b91c1c; }
      .status-pending { background: #fef3c7; color: #b45309; }
      .receipt-summary { margin-bottom: 18px; }
      .receipt-summary h3 { font-size: 12px; text-transform: uppercase; color: #0F7A87; margin: 0 0 8px 0; }
      table.summary { width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid #e5e7eb; }
      table.summary td { padding: 6px 12px; border-bottom: 1px solid #f3f4f6; }
      table.summary td.amt { text-align: right; font-weight: 600; }
      table.summary tr.total td { background: #eff6ff; border-top: 2px solid #0F7A87; font-size: 15px; font-weight: 700; }
      .receipt-notes { border: 1px dashed #d1d5db; padding: 10px 14px; border-radius: 6px; margin-bottom: 18px; }
      .receipt-notes h3 { font-size: 12px; color: #0F7A87; margin: 0 0 4px 0; text-transform: uppercase; }
      .receipt-notes p { font-size: 12px; margin: 0; color: #4b5563; }
      .receipt-footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 30px; }
      .sign-box { text-align: center; }
      .sign-line { width: 160px; border-top: 1px dashed #6b7280; margin-bottom: 4px; }
      .sign-box p { font-size: 11px; color: #6b7280; margin: 0; }
      .receipt-meta-foot { text-align: right; font-size: 10px; color: #9ca3af; line-height: 1.5; }
      @media print { .receipt-title-bar { break-inside: avoid; } }
    `

    const html = buildDocumentHTML({
      title: 'Payment Receipt',
      subtitle: `Receipt ${payment.paymentNo}`,
      centerAddress: payment.branch?.name || '',
      bodyHTML,
      extraCSS,
      footerNote: 'Thank you for your payment.',
      windowTitle: `Receipt ${payment.paymentNo}`,
      autoPrint: false, // we'll call print manually after a short delay
      mode,
      branding,
    })

    deliverDocument(html, output, {
      fileName: `Receipt ${payment.paymentNo}`,
      shareTitle: `Receipt ${payment.paymentNo}`,
      shareText: `Payment receipt ${payment.paymentNo}`,
      patientId: payment.patientId,
      patientPhone: payment.patient?.mobile || undefined,
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Task 69: Export filtered payments to CSV (Excel-compatible)
  // ───────────────────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (payments.length === 0) {
      toast.info('No payments to export with current filters.')
      return
    }
    const headers = ['Payment No', 'Patient', 'Amount', 'Mode', 'Date', 'Type', 'Status', 'Reference']
    const rows = payments.map(p => [
      p.paymentNo,
      `"${(p.patient?.childName || 'N/A').replace(/"/g, '""')}"`,
      String(p.amount),
      p.paymentMode,
      format(new Date(p.date), 'dd MMM yyyy'),
      p.type,
      p.status,
      `"${(p.referenceNo || '').replace(/"/g, '""')}"`,
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    // Prepend BOM so Excel reads the CSV as UTF-8
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payments-export-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`Exported ${payments.length} payment(s) to CSV.`)
  }

  const totalPages = Math.ceil(total / limit)

  // Filter invoices by selected patient for linking
  const filteredInvoices = form.patientId
    ? invoices.filter(inv => inv.patientId === form.patientId && inv.balanceDue > 0)
    : []

  // Memoized patient history filtered to current patient (sorted desc by date)
  const sortedPatientHistory = useMemo(() => {
    if (!viewPayment) return []
    return [...patientHistory]
      .filter(p => p.patientId === viewPayment.patientId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [patientHistory, viewPayment])

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        {PrintSettingsDialog}
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
            <p className="text-muted-foreground text-sm">Track all payments, advances, and refunds</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canExport && (
              <Button variant="outline" onClick={handleExport} className="gap-2">
                <FileDown className="size-4" /> Export
              </Button>
            )}
            {canCreate && (
              <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
                <Plus className="size-4" /> Record Payment
              </Button>
            )}
          </div>
        </div>

        {/* Filter Card with Advanced Filters (Task 69) */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <SearchInput
                value={query}
                onChange={setQuery}
                onClear={clear}
                loading={isDebouncing || loading}
                placeholder="Search by payment no, patient name..."
                className="flex-1"
              />
              <Select value={filterPatient} onValueChange={(v) => { setFilterPatient(v === 'all' ? '' : v); setPage(1) }}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue placeholder="Filter by Patient" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Patients</SelectItem>
                  {patients.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.childName} ({p.patientId})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-center gap-3 pt-1 border-t">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground shrink-0">
                <Filter className="size-4" /> Filters:
              </div>
              {/* Date range filter */}
              <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
                {([
                  { key: 'all', label: 'All' },
                  { key: 'today', label: 'Today' },
                  { key: 'week', label: 'This Week' },
                  { key: 'month', label: 'This Month' },
                ] as const).map(r => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setRangeFilter(r.key)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      rangeFilter === r.key
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <Select value={filterMode} onValueChange={setFilterMode}>
                  <SelectTrigger className="w-full sm:w-44 h-9">
                    <SelectValue placeholder="Payment Mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Modes</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-full sm:w-40 h-9">
                    <SelectValue placeholder="Payment Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="advance">Advance</SelectItem>
                    <SelectItem value="payment">Payment</SelectItem>
                    <SelectItem value="refund">Refund</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full sm:w-44 h-9">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="completed">Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="partially_paid">Partially Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment No</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="hidden sm:table-cell">Mode</TableHead>
                    <TableHead className="hidden md:table-cell">Date</TableHead>
                    <TableHead className="hidden lg:table-cell">Type</TableHead>
                    <TableHead className="hidden lg:table-cell">Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Reference</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={9}><Skeleton className="h-10 w-full" /></TableCell>
                      </TableRow>
                    ))
                  ) : payments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                        <Wallet className="size-10 mx-auto mb-2 opacity-40" />
                        <p>No payments found</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    payments.map((payment) => {
                      const completed = isCompletedPayment(payment.status)
                      return (
                        <TableRow key={payment.id}>
                          <TableCell className="font-medium">{payment.paymentNo}</TableCell>
                          <TableCell>
                            <div>
                              <span className="font-medium">{payment.patient?.childName || 'N/A'}</span>
                              <span className="text-xs text-muted-foreground ml-1">({payment.patient?.patientId || ''})</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-semibold">{formatCurrency(payment.amount)}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <div className="flex items-center gap-1.5 capitalize">
                              {modeIcons[payment.paymentMode]}
                              <span className="text-xs">{payment.paymentMode.replace('_', ' ')}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">{format(new Date(payment.date), 'dd MMM yyyy')}</TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <Badge variant="outline" className={typeColors[payment.type] || ''}>
                              {payment.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <Badge variant="outline" className={statusColors[payment.status] || 'bg-gray-100 text-gray-800 border-gray-200'}>
                              {payment.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                            {payment.referenceNo || '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* View */}
                              {canViewPrint && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => openView(payment)}
                                      aria-label="View payment details"
                                    >
                                      <Eye className="size-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>View Details</TooltipContent>
                                </Tooltip>
                              )}
                              {/* Print */}
                              {canViewPrint && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => handlePrint(payment)}
                                      aria-label="Print receipt"
                                    >
                                      <Printer className="size-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Print Receipt</TooltipContent>
                                </Tooltip>
                              )}
                              {/* Delete — Admin only, disabled for completed payments */}
                              {canDelete && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span tabIndex={completed ? 0 : undefined} className="inline-flex">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive"
                                        disabled={completed}
                                        onClick={() => !completed && openDelete(payment)}
                                        aria-label="Delete payment"
                                      >
                                        <Trash2 className="size-4" />
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {completed ? 'Completed payments cannot be deleted' : 'Delete Payment'}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-sm">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Record Payment ActionDialog (Task A1) — form fields as children */}
        {canCreate && (
          <ActionDialog
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
            module="payments"
            recordId={form.invoiceId || 'standalone'}
            actionType="recorded"
            actionLabel="Record Payment"
            description="Enter payment details for a patient. A reason or note is required before recording."
            variant="success"
            onConfirm={handleSubmit}
            disableConfirm={
              !form.patientId || !form.amount || Number(form.amount) <= 0
            }
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Patient *</Label>
                <Select value={form.patientId} onValueChange={v => setForm({ ...form, patientId: v, invoiceId: '' })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select patient" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.childName} ({p.patientId})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {filteredInvoices.length > 0 && (
                <div className="space-y-2">
                  <Label>Link to Invoice (Optional)</Label>
                  <Select value={form.invoiceId || '__none__'} onValueChange={v => {
                    const selectedId = v === '__none__' ? '' : v
                    const inv = filteredInvoices.find(i => i.id === selectedId)
                    setForm({ ...form, invoiceId: selectedId, amount: inv ? String(inv.balanceDue) : form.amount })
                  }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select invoice to link" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {filteredInvoices.map(inv => (
                        <SelectItem key={inv.id} value={inv.id}>
                          {inv.invoiceNo} - Balance: {formatCurrency(inv.balanceDue)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount (₹) *</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Enter amount"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="payment">Payment</SelectItem>
                      <SelectItem value="advance">Advance</SelectItem>
                      <SelectItem value="refund">Refund</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Payment Mode *</Label>
                  <Select value={form.paymentMode} onValueChange={v => setForm({ ...form, paymentMode: v })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Reference No</Label>
                  <Input
                    placeholder="Reference number"
                    value={form.referenceNo}
                    onChange={(e) => setForm({ ...form, referenceNo: e.target.value })}
                  />
                </div>
              </div>

              {/* Task 69: Notes / Remarks textarea */}
              <div className="space-y-2">
                <Label>Notes / Remarks</Label>
                <Textarea
                  placeholder="Optional remarks about this payment (e.g. cheque number, bank name, partial settlement reason)"
                  value={form.notes}
                  rows={3}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
          </ActionDialog>
        )}

        {/* Delete Payment ActionDialog (Task A1) */}
        {canDelete && (
          <ActionDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            module="payments"
            recordId={deleteTarget?.id || ''}
            actionType="deleted"
            actionLabel="Delete Payment"
            description={
              deleteTarget
                ? `Permanently delete payment ${deleteTarget.paymentNo} (${formatCurrency(deleteTarget.amount)}) for ${deleteTarget.patient?.childName || 'Unknown'}. This action cannot be undone.`
                : 'Permanently delete this payment. A reason is required.'
            }
            variant="destructive"
            onConfirm={handleDelete}
          />
        )}

        {/* Task 69: View Payment Details Modal */}
        <Dialog open={viewDialogOpen} onOpenChange={(open) => { setViewDialogOpen(open); if (!open) setViewPayment(null) }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="size-5 text-primary" />
                Payment Details
              </DialogTitle>
              <DialogDescription>
                {viewPayment?.paymentNo} — {viewPayment?.patient?.childName || 'N/A'}
              </DialogDescription>
            </DialogHeader>
            {viewPayment && (
              <div className="space-y-5">
                {/* Completed payment warning (Task 69 req 9) */}
                {isCompletedPayment(viewPayment.status) && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 text-sm">
                    <AlertCircle className="size-4 mt-0.5 shrink-0" />
                    <span>This is a completed payment. Contact admin for adjustments.</span>
                  </div>
                )}

                {/* Detail grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DetailField label="Payment No" value={viewPayment.paymentNo} />
                  <DetailField label="Patient Name" value={`${viewPayment.patient?.childName || 'N/A'} (${viewPayment.patient?.patientId || ''})`} />
                  <DetailField label="Amount" value={formatCurrency(viewPayment.amount)} />
                  <DetailField label="Payment Mode" value={viewPayment.paymentMode.replace('_', ' ')} />
                  <DetailField label="Date" value={format(new Date(viewPayment.date), 'dd MMM yyyy')} />
                  <DetailField label="Type" value={viewPayment.type} />
                  <DetailField label="Status" value={viewPayment.status} />
                  <DetailField label="Reference" value={viewPayment.referenceNo || '-'} />
                  <DetailField label="Branch" value={viewPayment.branch?.name || 'Main Branch'} />
                  <DetailField label="Created At" value={viewPayment.createdAt ? format(new Date(viewPayment.createdAt), 'dd MMM yyyy, hh:mm a') : '-'} />
                  <DetailField label="Created By" value="—" />
                </div>

                {/* Notes */}
                {viewPayment.notes && (
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{viewPayment.notes}</p>
                  </div>
                )}

                {/* Patient Payment History (Task 69 req 7) */}
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2 border-b">
                    <p className="text-sm font-semibold">Payment History — {viewPayment.patient?.childName || 'Patient'}</p>
                    <p className="text-xs text-muted-foreground">{sortedPatientHistory.length} payment(s) on record</p>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Payment No</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historyLoading ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                              <Skeleton className="h-6 w-full" />
                            </TableCell>
                          </TableRow>
                        ) : sortedPatientHistory.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                              No previous payments found.
                            </TableCell>
                          </TableRow>
                        ) : (
                          sortedPatientHistory.map(p => (
                            <TableRow key={p.id} className={p.id === viewPayment.id ? 'bg-primary/5' : ''}>
                              <TableCell className="font-medium py-2">{p.paymentNo}</TableCell>
                              <TableCell className="font-semibold py-2">{formatCurrency(p.amount)}</TableCell>
                              <TableCell className="py-2">{format(new Date(p.date), 'dd MMM yyyy')}</TableCell>
                              <TableCell className="py-2">
                                <Badge variant="outline" className={statusColors[p.status] || ''}>
                                  {p.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Close</Button>
              {canViewPrint && viewPayment && (
                <Button className="gap-2" onClick={() => handlePrint(viewPayment)}>
                  <Printer className="size-4" /> Print Receipt
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}

// Small helper for the View modal detail grid
function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-100 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium capitalize break-words">{value}</p>
    </div>
  )
}
