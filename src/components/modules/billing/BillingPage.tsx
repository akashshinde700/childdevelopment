'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import {
  Plus, Filter, FileText, Printer, Eye, Trash2,
  ChevronLeft, ChevronRight, Loader2, X, MoreVertical,
  CheckCircle2, XCircle, Pencil, ChevronsUpDown,
  IndianRupee, CalendarCheck, TrendingUp, Clock, Wallet, CalendarDays,
  Download,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { ActionDialog } from '@/components/ui/action-dialog'
import { SearchInput } from '@/components/ui/search-input'
import { buildDocumentHTML, buildInvoiceHTML, deliverDocument } from '@/components/print/DocumentLayout'
import { usePrintSettings } from '@/components/print/PrintSettingsDialog'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'
import { useAppStore } from '@/store/app-store'
import { authFetch } from '@/lib/api-client'
import { toast } from 'sonner'

// Types
interface Patient {
  id: string
  patientId: string
  childName: string
  mobile: string
}

interface InvoiceItem {
  id?: string
  // "package" (patient's therapy package), "service" (from the Services
  // Master dropdown), or "custom" (free-typed name + price). Defaults to
  // "service" server-side for legacy rows created before this field existed.
  type?: 'package' | 'service' | 'custom'
  referenceId?: string
  description: string
  quantity: number
  rate: number
  amount: number
}

interface ServiceMaster {
  id: string
  name: string
  defaultPrice: number
}

interface Invoice {
  id: string
  invoiceNo: string
  patientId: string
  patient: {
    childName: string
    patientId: string
    parentName?: string
    fatherName?: string
    motherName?: string
    mobile?: string
    address?: string
    city?: string
  }
  date: string
  type: string
  subtotal: number
  discount: number
  gstApplicable: boolean
  cgst: number
  sgst: number
  gstNumber?: string
  totalAmount: number
  amountPaid: number
  balanceDue: number
  paymentMode?: string
  status: string
  notes?: string
  invoiceItems?: InvoiceItem[]
}

const statusColors: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-800 border-orange-200',
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  partially_paid: 'bg-blue-100 text-blue-800 border-blue-200',
  overdue: 'bg-red-100 text-red-800 border-red-200',
}

const typeLabels: Record<string, string> = {
  invoice: 'Invoice',
  receipt: 'Receipt',
  advance_receipt: 'Advance Receipt',
  final_receipt: 'Final Receipt',
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount)

// Escape user-provided text interpolated into the print HTML — prevents stray
// angle brackets / quotes in invoice numbers, descriptions, etc. from breaking
// the print document.
const escapeHTMLForInvoice = (value: unknown) => {
  if (value == null) return ''
  const str = String(value)
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export default function BillingPage() {
  const { setSelectedInvoice, navigate, searchQuery: globalSearchQuery, setSearchQuery: setGlobalSearchQuery, currentBranch } = useAppStore()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientPackages, setPatientPackages] = useState<any[]>([])
  const [services, setServices] = useState<ServiceMaster[]>([])
  const [patientProfile, setPatientProfile] = useState<any | null>(null)
  const [patientSummaryData, setPatientSummaryData] = useState<any | null>(null)
  const [patientPayments, setPatientPayments] = useState<any[]>([])
  const [patientInvoicesList, setPatientInvoicesList] = useState<any[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  // Bumped after a payment so the selected patient's outstanding list
  // reloads — paying from the summary panel must clear the bill it just paid.
  const [patientBillingRefresh, setPatientBillingRefresh] = useState(0)
  const { choosePrintMode, PrintSettingsDialog } = usePrintSettings()
  const [ppSortKey, setPpSortKey] = useState<'name'|'price'|'paid'|'due'|'status'|'remaining'>('name')
  const [ppSortDir, setPpSortDir] = useState<'asc'|'desc'>('asc')

  // Payment summary (moved from Payments page)
  const [totalCollected, setTotalCollected] = useState(0)
  const [todayCollection, setTodayCollection] = useState(0)
  const [monthCollection, setMonthCollection] = useState(0)
  const [pendingAmount, setPendingAmount] = useState(0)
  const [advanceBalance, setAdvanceBalance] = useState(0)
  const [todayCount, setTodayCount] = useState(0)

  // Reusable debounced search — seeded with the global search bar value.
  const { query, debouncedQuery, setQuery, isDebouncing, clear } = useDebouncedSearch(globalSearchQuery)

  // Filters
  const [filterPatient, setFilterPatient] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterDate, setFilterDate] = useState('')

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

  // Reset page when the debounced search actually fires
  useEffect(() => {
    setPage(1)
  }, [debouncedQuery])

  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoiceState] = useState<Invoice | null>(null)

  // Action dialogs (Task A1) — Mark Paid / Cancel / Delete
  const [markPaidOpen, setMarkPaidOpen] = useState(false)
  const [cancelInvoiceOpen, setCancelInvoiceOpen] = useState(false)
  const [deleteInvoiceOpen, setDeleteInvoiceOpen] = useState(false)
  const [actionTarget, setActionTarget] = useState<Invoice | null>(null)

  // Create invoice form
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [form, setForm] = useState({
    patientId: '',
    type: 'invoice',
    date: format(new Date(), 'yyyy-MM-dd'),
    items: [{ type: 'package', description: '', quantity: 1, rate: 0, amount: 0 }] as InvoiceItem[],
    discount: 0,
    gstApplicable: false,
    gstNumber: '',
    cgstPercent: 9,
    sgstPercent: 9,
    amountPaid: 0,
    paymentMode: 'cash',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (debouncedQuery) params.set('search', debouncedQuery)
      if (filterPatient) params.set('patientId', filterPatient)
      if (filterStatus) params.set('status', filterStatus)
      if (filterType) params.set('type', filterType)
      if (filterDate) params.set('date', filterDate)
      const res = await authFetch(`/api/invoices?${params}`)
      const data = await res.json()
      setInvoices(data.invoices || [])
      setTotal(data.total || 0)
    } catch {
      toast.error('Failed to fetch invoices')
    } finally {
      setLoading(false)
    }
  }, [page, debouncedQuery, filterPatient, filterStatus, filterType, filterDate])

  const fetchPatients = useCallback(async () => {
    try {
      const res = await authFetch('/api/patients?limit=1000')
      const data = await res.json()
      setPatients(data.patients || [])
    } catch { /* silent */ }
  }, [])

  const fetchServices = useCallback(async () => {
    try {
      const res = await authFetch('/api/services')
      if (res.ok) {
        const data = await res.json()
        setServices(data.services || [])
      }
    } catch { /* silent */ }
  }, [])

  // Fetch billing summary stats computed from INVOICES (not payments).
  // Since the Payments module was removed from the sidebar, these boxes now
  // reflect invoice data — so creating a new invoice immediately updates them.
  const fetchPaymentSummary = useCallback(async () => {
    try {
      // Fetch all invoices (up to 1000) to compute summary stats
      const res = await authFetch('/api/invoices?limit=1000')
      if (res.ok) {
        const data = await res.json()
        const allInvoices: Invoice[] = data.invoices || []

        const now = new Date()
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

        // Total collected = sum of amountPaid across all invoices
        const collected = allInvoices.reduce((s, inv) => s + (inv.amountPaid || 0), 0)
        // Today's collection = sum of amountPaid for invoices created today
        const todayCollected = allInvoices
          .filter(inv => { const d = new Date(inv.date); return d >= todayStart && d < todayEnd })
          .reduce((s, inv) => s + (inv.amountPaid || 0), 0)
        // This month's collection
        const monthCollected = allInvoices
          .filter(inv => { const d = new Date(inv.date); return d >= monthStart && d < monthEnd })
          .reduce((s, inv) => s + (inv.amountPaid || 0), 0)
        // Total pending = sum of balanceDue across all invoices
        const pending = allInvoices.reduce((s, inv) => s + (inv.balanceDue || 0), 0)
        // Advance balance = sum of amountPaid for advance_receipt type invoices
        const advance = allInvoices
          .filter(inv => inv.type === 'advance_receipt')
          .reduce((s, inv) => s + (inv.amountPaid || 0), 0)
        // Today's transactions = count of invoices created today
        const todayTxns = allInvoices
          .filter(inv => { const d = new Date(inv.date); return d >= todayStart && d < todayEnd })
          .length

        setTotalCollected(collected)
        setTodayCollection(todayCollected)
        setMonthCollection(monthCollected)
        setPendingAmount(pending)
        setAdvanceBalance(advance)
        setTodayCount(todayTxns)
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])
  useEffect(() => { fetchPatients() }, [fetchPatients])
  useEffect(() => { fetchServices() }, [fetchServices])
  useEffect(() => { fetchPaymentSummary() }, [fetchPaymentSummary])

  // Fetch patient profile (packages/payments/invoices summary) when a patient is selected in the create dialog
  useEffect(() => {
    let mounted = true
    const pid = form.patientId
    if (!pid) {
      setPatientPackages([])
      setPatientProfile(null)
      setPatientSummaryData(null)
      return
    }
    ;(async () => {
      try {
        const res = await authFetch(`/api/patients/${pid}`)
        if (!mounted) return
        if (!res.ok) {
          setPatientPackages([])
          setPatientProfile(null)
          setPatientSummaryData(null)
          return
        }
        const json = await res.json()
        // server returns `packages` array with billing fields like amountPaid/dueAmount/paymentStatus
        const packages = json.packages || []
        setPatientPackages(packages)
        setPatientProfile(json.patient || null)
        setPatientSummaryData(json.summary || null)
        setPatientPayments(json.payments || [])
        setPatientInvoicesList(json.invoices || [])

        // Auto-select the package line item when this patient has exactly
        // one unpaid package and the form doesn't already have a package
        // chosen for that row — previously the dropdown just listed it and
        // the user had to manually reopen and pick the same (only) option
        // every time. Skip entirely when editing an existing invoice (its
        // items are already the saved ones) or when there's more than one
        // candidate (ambiguous — leave the choice to the user).
        if (!editingInvoice) {
          const selectable = packages.filter((p: any) => {
            const paid = p.paymentStatus === 'paid' || (p.dueAmount !== undefined && p.dueAmount <= 0)
            return !paid
          })
          if (selectable.length === 1) {
            const pkg = selectable[0]
            setForm((prev) => {
              const idx = prev.items.findIndex((it) => it.type !== 'service' && it.type !== 'custom' && !it.description)
              if (idx === -1) return prev
              const rate = pkg.dueAmount !== undefined ? pkg.dueAmount : (pkg.amount ?? pkg.netAmount ?? 0)
              const items = [...prev.items]
              items[idx] = {
                ...items[idx],
                type: 'package',
                description: pkg.name || pkg.package?.name || '',
                rate,
                amount: Number(items[idx].quantity || 1) * Number(rate),
                referenceId: pkg.id,
                // @ts-ignore - keep a transient patientPackageId only for actual patient assignments (used by handleSubmit)
                patientPackageId: pkg.id,
              }
              return { ...prev, items }
            })
          }
        }
      } catch (err) {
        if (!mounted) return
        setPatientPackages([])
        setPatientProfile(null)
        setPatientSummaryData(null)
      }
    })()
    return () => { mounted = false }
  }, [form.patientId, patientBillingRefresh])

  // Invoice form helpers
  const updateItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const items = [...form.items]
    items[index] = { ...items[index], [field]: value }
    // Amount = quantity × rate
    items[index].amount = Number(items[index].quantity || 1) * Number(items[index].rate)
    setForm({ ...form, items })
  }

  const addPackageItem = () => {
    setForm({
      ...form,
      items: [...form.items, { type: 'package', description: '', quantity: 1, rate: 0, amount: 0 }],
    })
  }

  const addServiceItem = () => {
    setForm({
      ...form,
      items: [...form.items, { type: 'service', description: '', quantity: 1, rate: 0, amount: 0 }],
    })
  }

  // Fills description/rate/referenceId from the selected Services Master
  // entry and recomputes the amount (qty × price).
  const selectServiceForItem = (index: number, service: ServiceMaster) => {
    const items = [...form.items]
    const quantity = Number(items[index].quantity || 1)
    items[index] = {
      ...items[index],
      type: 'service',
      referenceId: service.id,
      description: service.name,
      rate: service.defaultPrice,
      amount: quantity * service.defaultPrice,
    }
    setForm({ ...form, items })
  }

  // Switches a service row into "Custom Service" mode — free-typed name +
  // manually entered price, no Services Master reference.
  const switchToCustomService = (index: number) => {
    const items = [...form.items]
    items[index] = { ...items[index], type: 'custom', referenceId: undefined, description: '', rate: 0, amount: 0 }
    setForm({ ...form, items })
  }

  const removeItem = (index: number) => {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) })
  }

  const subtotal = form.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  const packageItemsTotal = form.items
    .filter((it) => it.type !== 'service' && it.type !== 'custom')
    .reduce((sum, it) => sum + (Number(it.amount) || 0), 0)
  const serviceItemsTotal = form.items
    .filter((it) => it.type === 'service' || it.type === 'custom')
    .reduce((sum, it) => sum + (Number(it.amount) || 0), 0)
  const taxableAmount = Math.max(0, subtotal - Number(form.discount))
  const cgstAmount = form.gstApplicable ? taxableAmount * (form.cgstPercent / 100) : 0
  const sgstAmount = form.gstApplicable ? taxableAmount * (form.sgstPercent / 100) : 0
  const totalAmount = subtotal - Number(form.discount) + cgstAmount + sgstAmount
  const balanceDue = totalAmount - Number(form.amountPaid)

  // Live validation: Amount Paid should not exceed balance due
  useEffect(() => {
    if (Number(form.amountPaid) > totalAmount) {
      setFormError('Amount paid cannot exceed total amount')
    } else {
      setFormError(null)
    }
  }, [form.amountPaid, totalAmount])

  // Open edit dialog — pre-fills the form with the invoice's data
  const openEditInvoice = (invoice: Invoice) => {
    setEditingInvoice(invoice)
    setForm({
      patientId: invoice.patientId,
      type: invoice.type || 'invoice',
      date: invoice.date ? format(new Date(invoice.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      items: (invoice as any).invoiceItems?.map((item: any) => ({
        type: item.type || 'service',
        referenceId: item.referenceId || undefined,
        description: item.description || '',
        quantity: item.quantity || 1,
        rate: item.rate || 0,
        amount: item.amount || 0,
      })) || [{ type: 'package', description: '', quantity: 1, rate: 0, amount: 0 }],
      discount: invoice.discount || 0,
      gstApplicable: invoice.gstApplicable || false,
      gstNumber: invoice.gstNumber || '',
      cgstPercent: invoice.cgst || 9,
      sgstPercent: invoice.sgst || 9,
      amountPaid: invoice.amountPaid || 0,
      paymentMode: invoice.paymentMode || 'cash',
      notes: invoice.notes || '',
    })
    setCreateDialogOpen(true)
  }

  // Open create dialog — resets the form
  const openCreateInvoice = () => {
    setEditingInvoice(null)
    setForm({
      patientId: '', type: 'invoice', date: format(new Date(), 'yyyy-MM-dd'), items: [{ type: 'package', description: '', quantity: 1, rate: 0, amount: 0 } as InvoiceItem],
      discount: 0, gstApplicable: false, gstNumber: '', cgstPercent: 9, sgstPercent: 9,
      amountPaid: 0, paymentMode: 'cash', notes: '',
    })
    setCreateDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.patientId) { toast.error('Please select a patient'); return }
    if (form.items.every(i => !i.description.trim())) { toast.error('Add at least one line item'); return }

    // Frontend validation: negative amounts
    if (subtotal < 0) { toast.error('Subtotal cannot be negative'); return }
    if (Number(form.discount) < 0) { toast.error('Discount cannot be negative'); return }
    for (let i = 0; i < form.items.length; i++) {
      if (Number(form.items[i].rate) < 0) { toast.error(`Rate for item ${i + 1} cannot be negative`); return }
      if (Number(form.items[i].amount) < 0) { toast.error(`Amount for item ${i + 1} cannot be negative`); return }
    }
    if (totalAmount < 0) { toast.error('Total amount cannot be negative'); return }

    setSubmitting(true)
    try {
      // If all selected items reference the same patientPackageId, pass it
      // at the root level so the backend can create a package-scoped Payment record.
      const patientPackageIds = Array.from(new Set(form.items.map((it: any) => it.patientPackageId).filter(Boolean)))
      const rootPatientPackageId = patientPackageIds.length === 1 ? patientPackageIds[0] : undefined

      const payload = {
        ...form,
        ...(editingInvoice ? { id: editingInvoice.id } : {}),
        branchId: currentBranch?.id || null,
        discount: Number(form.discount),
        subtotal,
        cgst: cgstAmount,
        sgst: sgstAmount,
        totalAmount,
        amountPaid: Number(form.amountPaid),
        balanceDue,
        ...(rootPatientPackageId ? { patientPackageId: rootPatientPackageId } : {}),
      }
      const res = await authFetch('/api/invoices', {
        method: editingInvoice ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      toast.success(editingInvoice ? 'Invoice updated successfully' : 'Invoice created successfully')
      setCreateDialogOpen(false)
      setEditingInvoice(null)
      setForm({
        patientId: '', type: 'invoice', date: format(new Date(), 'yyyy-MM-dd'), items: [{ type: 'package', description: '', quantity: 1, rate: 0, amount: 0 } as InvoiceItem],
        discount: 0, gstApplicable: false, gstNumber: '', cgstPercent: 9, sgstPercent: 9,
        amountPaid: 0, paymentMode: 'cash', notes: '',
      })
      fetchInvoices()
      fetchPaymentSummary()
    } catch {
      toast.error(editingInvoice ? 'Failed to update invoice' : 'Failed to create invoice')
    } finally {
      setSubmitting(false)
    }
  }

  const handleViewInvoice = (invoice: Invoice) => {
    setSelectedInvoiceState(invoice)
    setSelectedInvoice(invoice.id)
    setViewDialogOpen(true)
  }

  const handlePrintInvoice = async (invoice: Invoice) => {
    // The invoice has its own full-page design, so only header & footer bands
    // or nothing — a full-page letterhead background would clash with it.
    const choice = await choosePrintMode({ modes: ['header_footer', 'plain'] })
    if (!choice) return
    const dateStr = format(new Date(invoice.date), 'dd-MM-yyyy')
    // Due date = invoice date + 15 days (standard payment terms)
    const dueDateStr = format(new Date(new Date(invoice.date).getTime() + 15 * 86400000), 'dd-MM-yyyy')
    const patientName = invoice.patient?.childName || 'N/A'
    const patientId = invoice.patient?.patientId || ''
    const items = (invoice.invoiceItems || []).map(item => ({
      description: item.description,
      packageOrService: item.type === 'package' ? 'Package' : item.type === 'custom' ? 'Custom' : 'Service',
      quantity: item.quantity,
      rate: item.rate,
      amount: item.amount,
    }))

    // Fetch center settings + patient details (DOB, therapist) in parallel.
    // Patient photo is intentionally NOT fetched — the invoice print layout
    // uses a clean 2-column grid without a child photo (Remove patient photo
    // from invoice print).
    let centerName = 'Your Clinic Name'
    let centerAddress = ''
    let centerPhone = ''
    let centerEmail = ''
    let gstNumber = invoice.gstNumber || ''
    let dateOfBirth: string | undefined
    let therapistName: string | undefined
    // Print branding — the clinic's own uploaded assets & bank details from
    // Settings → Print Branding. Nothing is hardcoded here anymore: a clinic
    // that hasn't configured branding gets a neutral text header, no QR and
    // no bank rows (never another clinic's account details).
    let branding: Record<string, string | null> = {}

    try {
      const [settingsRes, patientRes] = await Promise.all([
        authFetch('/api/settings/branding'),
        patientId ? authFetch(`/api/patients/${invoice.patientId}`) : Promise.resolve(null),
      ])
      if (settingsRes?.ok) {
        const s = await settingsRes.json()
        branding = s
        centerName = s.centerName || centerName
        if (s.address) centerAddress = s.address
        if (s.phone) centerPhone = s.phone
        if (s.email) centerEmail = s.email
        if (s.gstNumber) gstNumber = s.gstNumber
      }
      if (patientRes?.ok) {
        const pData = await patientRes.json()
        const p = pData.patient
        if (p) {
          if (p.dateOfBirth) {
            dateOfBirth = format(new Date(p.dateOfBirth), 'dd-MM-yyyy')
          }
          // Therapist: use the most recent appointment's therapist
          const appts = pData.appointments
          if (Array.isArray(appts) && appts.length > 0) {
            therapistName = appts[0].therapistId || undefined
          }
        }
      }
    } catch { /* use defaults */ }

    const html = buildInvoiceHTML({
      invoiceNo: invoice.invoiceNo,
      date: dateStr,
      dueDate: dueDateStr,
      type: typeLabels[invoice.type] || invoice.type,
      childName: patientName,
      patientId,
      parentName: invoice.patient?.parentName || invoice.patient?.fatherName || undefined,
      contact: invoice.patient?.mobile || undefined,
      address: [invoice.patient?.address, invoice.patient?.city].filter(Boolean).join(', ') || undefined,
      dateOfBirth,
      therapistName,
      // childPhotoUrl intentionally omitted — invoice print no longer shows the
      // patient photo (clean 2-column grid layout).
      items,
      subtotal: invoice.subtotal,
      discount: invoice.discount,
      gstApplicable: invoice.gstApplicable,
      cgst: invoice.cgst,
      sgst: invoice.sgst,
      totalAmount: invoice.totalAmount,
      amountPaid: invoice.amountPaid,
      balanceDue: invoice.balanceDue,
      centerName,
      centerAddress,
      centerPhone,
      centerEmail,
      gstNumber,
      bankName: branding.bankName || undefined,
      bankBranch: branding.bankBranch || undefined,
      bankAccountName: branding.bankAccountName || undefined,
      accountNumber: branding.bankAccountNumber || undefined,
      ifscCode: branding.bankIfsc || undefined,
      upiId: branding.upiId || undefined,
      notes: invoice.notes || undefined,
      signatoryImageUrl: branding.signature || undefined,
      qrCodeSrc: branding.paymentQr || undefined,
      headerImageUrl: choice.mode === 'header_footer' ? branding.printHeader || undefined : undefined,
      footerImageUrl: choice.mode === 'header_footer' ? branding.printFooter || undefined : undefined,
      autoPrint: false,
    })

    // Print, save as PDF, or hand to the device's share sheet (WhatsApp,
    // Files) — chosen in the print dialog. deliverDocument waits for the
    // header/footer/QR images before rendering, same as the old iframe did.
    await deliverDocument(html, choice.output, {
      fileName: `Invoice ${invoice.invoiceNo} - ${patientName}`,
      shareTitle: `Invoice ${invoice.invoiceNo}`,
      shareText: `Invoice ${invoice.invoiceNo} for ${patientName}`,
      patientId: invoice.patientId,
      patientPhone: invoice.patient?.mobile || undefined,
      onDone: () => navigate('billing'),
    })
  }

  const handleDelete = async () => {
    if (!actionTarget) return
    const res = await authFetch(`/api/invoices?id=${actionTarget.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to delete invoice')
    }
    setActionTarget(null)
    fetchInvoices()
    fetchPaymentSummary()
  }

  // Mark Paid / Cancel Invoice onConfirm handlers (Task A1) — ActionDialog
  // handles success/error toasts + dialog close.
  const handleMarkPaid = async () => {
    if (!actionTarget) return
    const res = await authFetch('/api/invoices', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: actionTarget.id,
        status: 'paid',
        amountPaid: actionTarget.totalAmount,
        balanceDue: 0,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to mark invoice as paid')
    }
    setActionTarget(null)
    fetchInvoices()
    fetchPaymentSummary()
    setPatientBillingRefresh((n) => n + 1)
  }

  const handleCancelInvoice = async () => {
    if (!actionTarget) return
    const res = await authFetch('/api/invoices', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: actionTarget.id, status: 'cancelled' }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to cancel invoice')
    }
    setActionTarget(null)
    fetchInvoices()
    fetchPaymentSummary()
  }

  // ── Export to Excel — re-fetches with the currently active filters
  // (patient/status/type/date/search) but a large limit so ALL matching
  // invoices are exported, not just the current page. ──
  const [exportingInvoices, setExportingInvoices] = useState(false)
  const handleExportInvoices = async () => {
    if (exportingInvoices) return
    setExportingInvoices(true)
    try {
      const params = new URLSearchParams({ page: '1', limit: '100000' })
      if (debouncedQuery) params.set('search', debouncedQuery)
      if (filterPatient) params.set('patientId', filterPatient)
      if (filterStatus) params.set('status', filterStatus)
      if (filterType) params.set('type', filterType)
      if (filterDate) params.set('date', filterDate)
      const res = await authFetch(`/api/invoices?${params}`)
      if (!res.ok) {
        toast.error('Failed to export invoices')
        return
      }
      const data = await res.json()
      const all: Invoice[] = data.invoices || []

      const headers = [
        'Invoice No', 'Type', 'Patient', 'Patient ID', 'Date', 'Subtotal', 'Discount',
        'GST Applicable', 'CGST', 'SGST', 'Total Amount', 'Amount Paid', 'Balance Due',
        'Payment Mode', 'Status', 'Notes',
      ]
      const rows = all.map((inv) => [
        inv.invoiceNo,
        typeLabels[inv.type] || inv.type,
        inv.patient?.childName || 'N/A',
        inv.patient?.patientId || '',
        format(new Date(inv.date), 'dd MMM yyyy'),
        inv.subtotal,
        inv.discount,
        inv.gstApplicable ? 'Yes' : 'No',
        inv.cgst,
        inv.sgst,
        inv.totalAmount,
        inv.amountPaid,
        inv.balanceDue,
        inv.paymentMode || '',
        inv.status.replace('_', ' '),
        inv.notes || '',
      ])

      const XLSX = await import('xlsx')
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 12) }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Invoices')
      XLSX.writeFile(wb, 'Billing_Invoices.xlsx')
    } catch (err) {
      console.error('Failed to export invoices:', err)
      toast.error('Something went wrong while exporting')
    } finally {
      setExportingInvoices(false)
    }
  }

  const openMarkPaid = (inv: Invoice) => { setActionTarget(inv); setMarkPaidOpen(true) }
  const openCancelInvoice = (inv: Invoice) => { setActionTarget(inv); setCancelInvoiceOpen(true) }
  const openDeleteInvoice = (inv: Invoice) => { setActionTarget(inv); setDeleteInvoiceOpen(true) }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6">
      {PrintSettingsDialog}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-semibold tracking-tight truncate">Billing & Invoices</h1>
          <p className="text-muted-foreground text-sm truncate">Manage invoices, receipts, and billing records</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportInvoices} disabled={exportingInvoices} className="gap-2 px-3 py-2" aria-label="Export to Excel">
            <Download className="size-4" /> <span className="hidden sm:inline">Export to Excel</span>
          </Button>
          <Button onClick={openCreateInvoice} className="gap-2 px-3 py-2" aria-label="Create Invoice">
            <Plus className="size-4" /> <span className="hidden sm:inline">Create Invoice</span>
          </Button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 shadow-sm overflow-hidden">
          <div className="p-4 border-l-4 border-emerald-400 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-700/80">Total Collected</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(totalCollected)}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 shadow-inner">
              <IndianRupee className="size-5" />
            </div>
          </div>
          <div className="p-4 text-sm text-slate-700">Total revenue collected through invoices, updated instantly.</div>
        </div>

        <div className="rounded-3xl border border-indigo-100 bg-indigo-50/70 shadow-sm overflow-hidden">
          <div className="p-4 border-l-4 border-indigo-400 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-indigo-700/80">Today&apos;s Collection</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(todayCollection)}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-800 shadow-inner">
              <CalendarCheck className="size-5" />
            </div>
          </div>
          <div className="p-4 text-sm text-slate-700">Payments received from invoices created today.</div>
        </div>

        <div className="rounded-3xl border border-violet-100 bg-violet-50/70 shadow-sm overflow-hidden">
          <div className="p-4 border-l-4 border-violet-400 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-violet-700/80">This Month&apos;s Collection</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(monthCollection)}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-800 shadow-inner">
              <TrendingUp className="size-5" />
            </div>
          </div>
          <div className="p-4 text-sm text-slate-700">Summary of payments received in the current month.</div>
        </div>

        <div className="rounded-3xl border border-amber-100 bg-amber-50/80 shadow-sm overflow-hidden">
          <div className="p-4 border-l-4 border-amber-400 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-amber-700/80">Total Pending</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(pendingAmount)}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 shadow-inner">
              <Clock className="size-5" />
            </div>
          </div>
          <div className="p-4 text-sm text-slate-700">Amount still pending collection across all invoices.</div>
        </div>

        <div className="rounded-3xl border border-sky-100 bg-sky-50/80 shadow-sm overflow-hidden">
          <div className="p-4 border-l-4 border-sky-400 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-sky-700/80">Advance Balance</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(advanceBalance)}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-800 shadow-inner">
              <Wallet className="size-5" />
            </div>
          </div>
          <div className="p-4 text-sm text-slate-700">Advance payments held for future invoice application.</div>
        </div>

        <div className="rounded-3xl border border-teal-100 bg-teal-50/80 shadow-sm overflow-hidden">
          <div className="p-4 border-l-4 border-teal-400 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-teal-700/80">Today&apos;s Transactions</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{todayCount}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-teal-800 shadow-inner">
              <CalendarDays className="size-5" />
            </div>
          </div>
          <div className="p-4 text-sm text-slate-700">Invoice entries created or updated today.</div>
        </div>
      </div>

      {/* Filters */}
      <Card className="sticky top-20 z-20">
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <SearchInput
              value={query}
              onChange={setQuery}
              onClear={clear}
              loading={isDebouncing || loading}
              placeholder="Search by invoice no, patient name..."
              className="flex-1"
              aria-label="Search invoices"
            />
            <Select value={filterPatient} onValueChange={(v) => { setFilterPatient(v === 'all' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Filter by Patient" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Patients</SelectItem>
                {patients.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.childName} ({p.patientId})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v === 'all' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partially_paid">Partially Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={(v) => { setFilterType(v === 'all' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="invoice">Invoice</SelectItem>
                <SelectItem value="receipt">Receipt</SelectItem>
                <SelectItem value="advance_receipt">Advance Receipt</SelectItem>
                <SelectItem value="final_receipt">Final Receipt</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filterDate}
              onChange={(e) => { setFilterDate(e.target.value); setPage(1) }}
              className="w-full sm:w-40"
              aria-label="Filter by date"
            />
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setQuery(''); clear(); setFilterPatient(''); setFilterStatus(''); setFilterType(''); setFilterDate(''); setPage(1) }} title="Clear all filters">
                <X className="size-4" />
              </Button>
            </div>
          </div>
          {/* Active filter chips */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {query && (
              <Badge className="cursor-pointer" onClick={() => { setQuery(''); clear(); setPage(1) }}>
                Search: {query} <X className="ml-2 size-3 inline" />
              </Badge>
            )}
            {filterPatient && (
              <Badge className="cursor-pointer" onClick={() => { setFilterPatient(''); setPage(1) }}>
                Patient: {patients.find(p=>p.id===filterPatient)?.childName || filterPatient} <X className="ml-2 size-3 inline" />
              </Badge>
            )}
            {filterStatus && (
              <Badge className="cursor-pointer" onClick={() => { setFilterStatus(''); setPage(1) }}>
                Status: {filterStatus} <X className="ml-2 size-3 inline" />
              </Badge>
            )}
            {filterType && (
              <Badge className="cursor-pointer" onClick={() => { setFilterType(''); setPage(1) }}>
                Type: {filterType} <X className="ml-2 size-3 inline" />
              </Badge>
            )}
            {filterDate && (
              <Badge className="cursor-pointer" onClick={() => { setFilterDate(''); setPage(1) }}>
                Date: {filterDate} <X className="ml-2 size-3 inline" />
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invoice Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="text-sm [&_td]:py-2 [&_th]:py-2">
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                  <TableHead className="hidden sm:table-cell">Amount</TableHead>
                  <TableHead className="hidden lg:table-cell">GST</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="py-2">
                      <TableCell colSpan={8}><Skeleton className="h-8 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      <FileText className="size-10 mx-auto mb-2 opacity-40" />
                      <p>No invoices found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((invoice) => (
                    <TableRow key={invoice.id} className="cursor-pointer hover:bg-muted/50 py-2" onClick={() => handleViewInvoice(invoice)}>
                      <TableCell className="font-medium">{invoice.invoiceNo}</TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{invoice.patient?.childName || 'N/A'}</span>
                          <span className="text-xs text-muted-foreground ml-1">({invoice.patient?.patientId || ''})</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{format(new Date(invoice.date), 'dd MMM yyyy')}</TableCell>
                      <TableCell className="hidden sm:table-cell">{formatCurrency(invoice.subtotal)}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {invoice.gstApplicable ? formatCurrency(invoice.cgst + invoice.sgst) : '-'}
                      </TableCell>
                      <TableCell className="font-semibold">{formatCurrency(invoice.totalAmount)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[invoice.status] || ''}>
                          {invoice.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {/* View — always visible */}
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => handleViewInvoice(invoice)} title="View" aria-label={`View ${invoice.invoiceNo}`}>
                            <Eye className="size-4" />
                          </Button>
                          {/* Edit — only for pending/partially_paid */}
                          {(invoice.status === 'pending' || invoice.status === 'partially_paid') ? (
                            <Button variant="ghost" size="icon" className="size-8 hover:bg-blue-50 text-blue-600" onClick={() => openEditInvoice(invoice)} title="Edit Invoice" aria-label={`Edit ${invoice.invoiceNo}`}>
                              <Pencil className="size-4" />
                            </Button>
                          ) : (
                            <div className="size-8" aria-hidden="true" />
                          )}
                          {/* Print — always visible */}
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => handlePrintInvoice(invoice)} title="Print" aria-label={`Print ${invoice.invoiceNo}`}>
                            <Printer className="size-4" />
                          </Button>
                          {/* More actions dropdown — always visible, content varies by status */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8" title="More actions">
                                <MoreVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuLabel>Invoice Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {/* View — always in dropdown */}
                              <DropdownMenuItem className="gap-2 text-sm cursor-pointer" onClick={() => handleViewInvoice(invoice)}>
                                <Eye className="h-3.5 w-3.5" /> View Details
                              </DropdownMenuItem>
                              {/* Print — always in dropdown */}
                              <DropdownMenuItem className="gap-2 text-sm cursor-pointer" onClick={() => handlePrintInvoice(invoice)}>
                                <Printer className="h-3.5 w-3.5" /> Print Invoice
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {/* Edit — only for pending/partially_paid */}
                              {(invoice.status === 'pending' || invoice.status === 'partially_paid') && (
                                <DropdownMenuItem className="gap-2 text-sm cursor-pointer text-blue-600" onClick={() => openEditInvoice(invoice)}>
                                  <Pencil className="h-3.5 w-3.5" /> Edit Invoice
                                </DropdownMenuItem>
                              )}
                              {/* Mark Paid — only for pending/partially_paid */}
                              {(invoice.status === 'pending' || invoice.status === 'partially_paid') && (
                                <DropdownMenuItem className="gap-2 text-sm cursor-pointer text-emerald-600" onClick={() => openMarkPaid(invoice)}>
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Mark Paid
                                </DropdownMenuItem>
                              )}
                              {/* Cancel — only for pending/partially_paid */}
                              {(invoice.status === 'pending' || invoice.status === 'partially_paid') && (
                                <DropdownMenuItem className="gap-2 text-sm cursor-pointer text-amber-600" onClick={() => openCancelInvoice(invoice)}>
                                  <XCircle className="h-3.5 w-3.5" /> Cancel Invoice
                                </DropdownMenuItem>
                              )}
                              {/* Status indicator for paid/cancelled */}
                              {invoice.status === 'paid' && (
                                <DropdownMenuItem className="gap-2 text-sm text-emerald-600" disabled>
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Invoice Paid
                                </DropdownMenuItem>
                              )}
                              {invoice.status === 'cancelled' && (
                                <DropdownMenuItem className="gap-2 text-sm text-gray-500" disabled>
                                  <XCircle className="h-3.5 w-3.5" /> Invoice Cancelled
                                </DropdownMenuItem>
                              )}
                              {invoice.status === 'overdue' && (
                                <DropdownMenuItem className="gap-2 text-sm text-red-600" disabled>
                                  <XCircle className="h-3.5 w-3.5" /> Invoice Overdue
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              {/* Delete — always available */}
                              <DropdownMenuItem className="gap-2 text-sm cursor-pointer text-red-600" onClick={() => openDeleteInvoice(invoice)}>
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-muted-foreground">
            Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}
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
              <ChevronLeft className="size-4" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => {
                // Show first, last, current, and neighbors
                return (
                  p === 1 ||
                  p === totalPages ||
                  Math.abs(p - page) <= 1
                )
              })
              .map((p, idx, arr) => {
                const prevPage = arr[idx - 1]
                const showEllipsis = prevPage !== undefined && p - prevPage > 1
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
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create Invoice Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingInvoice ? 'Edit Invoice' : 'Create Invoice'}</DialogTitle>
            <DialogDescription>Add patient details, line items, and payment information</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Patient / Package / Payment Summary Cards (appear after patient selection) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-w-0 items-stretch">
              {/* Patient Summary */}
                <div className="rounded-lg border p-3 overflow-hidden h-full">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                      <IndianRupee className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="text-sm text-muted-foreground mb-0.5">Patient</p>
                      <p className="font-medium truncate whitespace-nowrap">{patientProfile ? `${patientProfile.childName} (${patientProfile.patientId})` : 'No patient selected'}</p>
                      {patientProfile?.mobile && <p className="truncate text-xs text-muted-foreground whitespace-nowrap mt-0.5">{patientProfile.mobile}</p>}
                    </div>
                  </div>
                </div>

              {/* Package Summary */}
              <div className="rounded-lg border p-3 min-w-0 overflow-hidden h-full">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Package Summary</p>
                </div>
                {patientPackages.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-2">No packages assigned</p>
                ) : (
                  <div className="mt-2 text-sm">
                    <div className="overflow-x-auto">
                      <Table className="w-full text-sm [&_td]:py-1 [&_th]:py-1">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-6">#</TableHead>
                            <TableHead onClick={() => { setPpSortKey('name'); setPpSortDir(ppSortKey === 'name' && ppSortDir === 'asc' ? 'desc' : 'asc') }} className="cursor-pointer">Package</TableHead>
                            <TableHead onClick={() => { setPpSortKey('price'); setPpSortDir(ppSortKey === 'price' && ppSortDir === 'asc' ? 'desc' : 'asc') }} className="hidden sm:table-cell cursor-pointer">Price</TableHead>
                            <TableHead onClick={() => { setPpSortKey('paid'); setPpSortDir(ppSortKey === 'paid' && ppSortDir === 'asc' ? 'desc' : 'asc') }} className="hidden md:table-cell cursor-pointer">Paid</TableHead>
                            <TableHead onClick={() => { setPpSortKey('due'); setPpSortDir(ppSortKey === 'due' && ppSortDir === 'asc' ? 'desc' : 'asc') }} className="cursor-pointer">Due</TableHead>
                            <TableHead onClick={() => { setPpSortKey('status'); setPpSortDir(ppSortKey === 'status' && ppSortDir === 'asc' ? 'desc' : 'asc') }} className="hidden lg:table-cell cursor-pointer">Status</TableHead>
                            <TableHead onClick={() => { setPpSortKey('remaining'); setPpSortDir(ppSortKey === 'remaining' && ppSortDir === 'asc' ? 'desc' : 'asc') }} className="hidden xl:table-cell cursor-pointer">Sessions</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(() => {
                            const sorted = [...patientPackages].sort((a: any, b: any) => {
                              const aName = (a.name || a.package?.name || '').toLowerCase()
                              const bName = (b.name || b.package?.name || '').toLowerCase()
                              const aPrice = Number(a.netAmount ?? a.amount ?? 0)
                              const bPrice = Number(b.netAmount ?? b.amount ?? 0)
                              const aPaid = Number(a.amountPaid ?? 0)
                              const bPaid = Number(b.amountPaid ?? 0)
                              const aDue = Number(a.dueAmount ?? 0)
                              const bDue = Number(b.dueAmount ?? 0)
                              const aRemaining = Number((a.sessionsPurchased || 0) - (a.sessionsUsed || 0))
                              const bRemaining = Number((b.sessionsPurchased || 0) - (b.sessionsUsed || 0))
                              let cmp = 0
                              switch (ppSortKey) {
                                case 'name': cmp = aName.localeCompare(bName); break
                                case 'price': cmp = aPrice - bPrice; break
                                case 'paid': cmp = aPaid - bPaid; break
                                case 'due': cmp = aDue - bDue; break
                                case 'status': cmp = (a.paymentStatus || '').localeCompare(b.paymentStatus || ''); break
                                case 'remaining': cmp = aRemaining - bRemaining; break
                                default: cmp = 0
                              }
                              return ppSortDir === 'asc' ? cmp : -cmp
                            })
                            return sorted.map((pp: any, idx: number) => {
                              const name = pp.name || pp.package?.name || ''
                              const price = Number(pp.netAmount ?? pp.amount ?? 0)
                              const paid = Number(pp.amountPaid ?? 0)
                              const due = Number(pp.dueAmount ?? 0)
                              const remaining = Math.max(0, (pp.sessionsPurchased || 0) - (pp.sessionsUsed || 0))
                              const paidLabel = pp.paymentStatus === 'paid' ? 'Paid' : pp.paymentStatus === 'partial' ? 'Partial' : 'Pending'
                              const alreadySelected = form.items.some(it => it.description === name)
                              const disabled = pp.paymentStatus === 'paid'
                              return (
                                <TableRow key={pp.id} className="text-xs">
                                  <TableCell>{idx + 1}</TableCell>
                                  <TableCell className="max-w-[180px] truncate">{name}<div className="text-xs text-muted-foreground">{pp.therapyType || pp.package?.therapyType || ''}</div></TableCell>
                                  <TableCell className="hidden sm:table-cell">₹{new Intl.NumberFormat('en-IN').format(price)}</TableCell>
                                  <TableCell className="hidden md:table-cell">₹{new Intl.NumberFormat('en-IN').format(paid)}</TableCell>
                                  <TableCell>₹{new Intl.NumberFormat('en-IN').format(due)}</TableCell>
                                  <TableCell className="hidden lg:table-cell">{paidLabel}</TableCell>
                                  <TableCell className="hidden xl:table-cell">{remaining}</TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={disabled || alreadySelected}
                                      title={`Due: ₹${new Intl.NumberFormat('en-IN').format(due)} • Remaining: ${Math.max(0, (pp.sessionsPurchased||0)-(pp.sessionsUsed||0))} sessions`}
                                      onClick={() => {
                                        if (alreadySelected || disabled) return
                                        const items = [...form.items]
                                        const emptyIndex = items.findIndex(it => !it.description || it.description === '')
                                        const line = { description: name, rate: due > 0 ? due : price, amount: due > 0 ? due : price, quantity: 1 }
                                        if (emptyIndex >= 0) {
                                          items[emptyIndex] = { ...items[emptyIndex], ...line, // @ts-ignore
                                            patientPackageId: pp.id }
                                        } else {
                                          // append a new line item
                                          // @ts-ignore
                                          items.push({ ...line, // @ts-ignore
                                            patientPackageId: pp.id })
                                        }
                                        toast.success(`Added ${name} to invoice`)
                                        setForm({ ...form, items })
                                        toast.success(`Added ${name} to invoice`)
                                      }}
                                    >{disabled ? 'Already Paid' : alreadySelected ? 'Selected' : 'Select'}</Button>
                                  </TableCell>
                                </TableRow>
                              )
                            })
                          })()}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Summary */}
              <div className="rounded-lg border p-3 min-w-0 overflow-hidden h-full">
                <p className="text-sm text-muted-foreground">Payment Summary</p>
                {patientSummaryData ? (
                  <div className="mt-2 text-sm space-y-1">
                    <div className="flex justify-between"><span>Total Package Value</span><span>₹{new Intl.NumberFormat('en-IN').format(patientSummaryData.totalPackageAmount || 0)}</span></div>
                    <div className="flex justify-between"><span>Paid</span><span>₹{new Intl.NumberFormat('en-IN').format(patientSummaryData.totalAmountPaid || 0)}</span></div>
                    <div className="flex justify-between"><span>Pending</span><span>₹{new Intl.NumberFormat('en-IN').format(patientSummaryData.pendingAmount || 0)}</span></div>
                    {patientPayments && patientPayments.length > 0 && (
                      <div className="flex justify-between"><span>Last Payment</span><span>{format(new Date(patientPayments[0].date), 'dd MMM yyyy')}</span></div>
                    )}
                    {patientInvoicesList && patientInvoicesList.length > 0 && (
                      <div className="flex justify-between"><span>Last Invoice</span><span>{patientInvoicesList[0].invoiceNo}</span></div>
                    )}

                    {/* Outstanding bills for this patient, payable right here.
                        Pay-per-session charges land here too, so the front
                        desk can collect without hunting the invoice list. */}
                    {(() => {
                      const unpaid = (patientInvoicesList || []).filter(
                        (inv: any) => inv.status === 'pending' || inv.status === 'partially_paid'
                      )
                      if (unpaid.length === 0) {
                        return (
                          <p className="pt-2 mt-2 border-t text-xs text-emerald-600">Nothing outstanding for this patient.</p>
                        )
                      }
                      return (
                        <div className="pt-2 mt-2 border-t space-y-1.5">
                          <p className="text-xs font-medium text-amber-700">
                            {unpaid.length} unpaid {unpaid.length === 1 ? 'bill' : 'bills'}
                          </p>
                          {unpaid.slice(0, 4).map((inv: any) => (
                            <div key={inv.id} className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs text-muted-foreground">
                                {inv.invoiceNo} · {format(new Date(inv.date), 'dd MMM')}
                              </span>
                              <span className="flex items-center gap-2 shrink-0">
                                <span className="text-xs font-semibold text-amber-700">
                                  ₹{new Intl.NumberFormat('en-IN').format(
                                    inv.balanceDue ?? Math.max(0, (inv.totalAmount || 0) - (inv.amountPaid || 0))
                                  )}
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[11px]"
                                  onClick={() => openMarkPaid(inv)}
                                >
                                  Pay
                                </Button>
                              </span>
                            </div>
                          ))}
                          {unpaid.length > 4 && (
                            <p className="text-[11px] text-muted-foreground">+{unpaid.length - 4} more in the invoice list below</p>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mt-2">Select a patient to load summary</p>
                )}
              </div>
            </div>
            {/* Patient, Type & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2 min-w-0">
                <Label>Patient *</Label>
                <Select value={form.patientId} onValueChange={v => setForm({ ...form, patientId: v })}>
                  <SelectTrigger className="w-full max-w-full">
                    <SelectValue placeholder="Select patient" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.childName} ({p.patientId})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invoice">Invoice</SelectItem>
                    <SelectItem value="receipt">Receipt</SelectItem>
                    <SelectItem value="advance_receipt">Advance Receipt</SelectItem>
                    <SelectItem value="final_receipt">Final Receipt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
            </div>

            <Separator />

            {/* Package Line Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Package</Label>
                <Button type="button" variant="outline" size="sm" onClick={addPackageItem} className="gap-1">
                  <Plus className="size-3.5" /> Add Package
                </Button>
              </div>
              <div className="space-y-2">
                {form.items
                  .map((item, index) => ({ item, index }))
                  .filter(({ item }) => item.type !== 'service' && item.type !== 'custom')
                  .map(({ item, index }, pos) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-end">
                    {/* Package dropdown (replaces Description) — deliberately
                        ONLY lists this patient's own assigned packages
                        (patientPackages), never the global package catalog.
                        Falling back to the catalog used to let staff bill a
                        package price with no real PatientPackage behind it —
                        the invoice would show a package name/amount, but
                        Active Package / Package Progress / Appointments all
                        read from the actual assignment, so they'd silently
                        show "No Active Package" / 0 sessions / no
                        appointments forever, even though the patient was
                        charged for (and expects) real sessions. A package
                        must be assigned via the Packages module first; use
                        "Add Service" below for a one-off charge that isn't a
                        tracked package. */}
                    <div className="col-span-12 sm:col-span-8">
                      {pos === 0 && <Label className="text-xs">Package</Label>}
                      {item.description && !patientPackages.some((p: any) => (p.name || p.package?.name) === item.description) ? (
                        // Legacy/already-saved line item that doesn't match any
                        // of the patient's current package assignments (e.g. an
                        // older invoice billed before this dropdown stopped
                        // allowing catalog-only selections) — show it read-only
                        // rather than a broken/empty picker.
                        <Input value={item.description} readOnly className="bg-muted" />
                      ) : form.patientId && patientPackages.length === 0 ? (
                        <div className="text-xs text-muted-foreground border rounded-md px-3 py-2 bg-muted/40">
                          No packages assigned to this patient yet. Assign one from the <span className="font-medium">Packages</span> module first, or use <span className="font-medium">Add Service</span> for a one-off charge.
                        </div>
                      ) : (
                        <Select
                          value={item.description}
                          onValueChange={(v) => {
                            const pkg = patientPackages.find((p: any) => (p.name || p.package?.name) === v || p.id === v)
                            const items = [...form.items]
                            const rate = pkg ? (pkg.dueAmount !== undefined ? pkg.dueAmount : (pkg.amount ?? pkg.netAmount ?? 0)) : items[index].rate
                            const patientPackageId = pkg && pkg.id ? pkg.id : undefined
                            items[index] = {
                              ...items[index],
                              type: 'package',
                              description: pkg?.name || v,
                              rate,
                              amount: Number(items[index].quantity || 1) * Number(rate),
                              referenceId: patientPackageId,
                              // @ts-ignore - keep a transient patientPackageId only for actual patient assignments (used by handleSubmit)
                              patientPackageId,
                            }
                            setForm({ ...form, items })
                            if (pkg) toast.success(`Selected package ${pkg.name || pkg.package?.name || pkg.id}`)
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={form.patientId ? 'Select package' : 'Select a patient first'} />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {patientPackages.map((pkg: any) => {
                              const name = pkg.name ?? pkg.package?.name
                              const alreadySelected = form.items.some((it) => it.description === name)
                              const paid = pkg.paymentStatus === 'paid' || (pkg.dueAmount !== undefined && pkg.dueAmount <= 0)
                              return (
                                <SelectItem key={pkg.id || pkg.name} value={name} disabled={alreadySelected || paid}>
                                  {name} - ₹{new Intl.NumberFormat('en-IN').format((pkg.dueAmount !== undefined ? pkg.dueAmount : (pkg.amount ?? pkg.netAmount ?? 0)))}
                                  {paid ? ' (Already Paid)' : alreadySelected ? ' (Selected)' : ''}
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    {/* Amount (auto-calculated from package rate, read-only) */}
                    <div className="col-span-12 sm:col-span-4">
                      {pos === 0 && <Label className="text-xs">Amount</Label>}
                      <div className="flex items-center gap-1">
                        <Input value={formatCurrency(item.amount)} readOnly className="bg-muted" />
                        {form.items.length > 1 && (
                          <Button variant="ghost" size="icon" className="size-9 shrink-0 text-destructive" onClick={() => removeItem(index)}>
                            <X className="size-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Additional Services Line Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Additional Services</Label>
                <Button type="button" variant="outline" size="sm" onClick={addServiceItem} className="gap-1">
                  <Plus className="size-3.5" /> Add Service
                </Button>
              </div>
              {form.items.some((it) => it.type === 'service' || it.type === 'custom') && (
                <div className="hidden sm:grid grid-cols-12 gap-2 px-1 text-xs text-muted-foreground">
                  <span className="col-span-5">Service</span>
                  <span className="col-span-2">Qty</span>
                  <span className="col-span-2">Unit Price</span>
                  <span className="col-span-2">Amount</span>
                </div>
              )}
              <div className="space-y-2">
                {form.items
                  .map((item, index) => ({ item, index }))
                  .filter(({ item }) => item.type === 'service' || item.type === 'custom')
                  .map(({ item, index }) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-12 sm:col-span-5">
                        {item.type === 'custom' ? (
                          <Input
                            placeholder="Custom service name"
                            value={item.description}
                            onChange={(e) => updateItem(index, 'description', e.target.value)}
                          />
                        ) : (
                          <ServiceCombobox
                            services={services}
                            value={item.description}
                            onSelect={(service) => selectServiceForItem(index, service)}
                            onCustomSelect={() => switchToCustomService(index)}
                          />
                        )}
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <Input
                          type="number"
                          min={1}
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <Input
                          type="number"
                          min={0}
                          placeholder="Unit Price"
                          value={item.rate}
                          onChange={(e) => updateItem(index, 'rate', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="col-span-3 sm:col-span-2">
                        <Input value={formatCurrency(item.amount)} readOnly className="bg-muted" />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button variant="ghost" size="icon" className="size-9 shrink-0 text-destructive" onClick={() => removeItem(index)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                {form.items.every((it) => it.type !== 'service' && it.type !== 'custom') && (
                  <p className="text-xs text-muted-foreground">No additional services added yet.</p>
                )}
              </div>
            </div>

            <Separator />

            {/* Totals */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:items-end">
                <div className="space-y-2">
                  <Label>Discount (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.discount === 0 ? "" : form.discount}
                    onChange={(e) => setForm({ ...form, discount: e.target.value === "" ? 0 : parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Subtotal</Label>
                  <div className="h-9 px-3 rounded-md border flex items-center font-medium">
                    {formatCurrency(subtotal)}
                  </div>
                </div>
              </div>

              {/* GST Section */}
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Apply GST</Label>
                  <Switch
                    checked={form.gstApplicable}
                    onCheckedChange={(v) => setForm({ ...form, gstApplicable: v })}
                  />
                </div>
                {form.gstApplicable && (
                  <>
                    <div className="space-y-2">
                      <Label>GST Number</Label>
                      <Input
                        placeholder="Enter GST Number"
                        value={form.gstNumber}
                        onChange={(e) => setForm({ ...form, gstNumber: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>CGST %</Label>
                        <Input
                          type="number"
                          min={0}
                          value={form.cgstPercent === 0 ? "" : form.cgstPercent}
                          onChange={(e) => setForm({ ...form, cgstPercent: e.target.value === "" ? 0 : parseFloat(e.target.value) || 0 })}
                        />
                        <p className="text-xs text-muted-foreground">CGST: {formatCurrency(cgstAmount)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label>SGST %</Label>
                        <Input
                          type="number"
                          min={0}
                          value={form.sgstPercent === 0 ? "" : form.sgstPercent}
                          onChange={(e) => setForm({ ...form, sgstPercent: e.target.value === "" ? 0 : parseFloat(e.target.value) || 0 })}
                        />
                        <p className="text-xs text-muted-foreground">SGST: {formatCurrency(sgstAmount)}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Grand Total & Payment */}
              <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Package Total</span>
                    <span>{formatCurrency(packageItemsTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Additional Services Total</span>
                    <span>{formatCurrency(serviceItemsTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Discount</span>
                    <span>- {formatCurrency(Number(form.discount))}</span>
                  </div>
                  {form.gstApplicable && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GST</span>
                      <span>{formatCurrency(cgstAmount + sgstAmount)}</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-lg font-semibold">Grand Total</span>
                  <span className="text-xl font-bold">{formatCurrency(totalAmount)}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Amount Paid (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.amountPaid === 0 ? "" : form.amountPaid}
                      onChange={(e) => setForm({ ...form, amountPaid: e.target.value === "" ? 0 : parseFloat(e.target.value) || 0 })}
                    />
                    {formError && <p className="text-sm text-destructive mt-1">{formError}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Payment Mode</Label>
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
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="font-medium">Balance Due</span>
                  <span className={`text-lg font-bold ${balanceDue > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {formatCurrency(balanceDue)}
                  </span>
                </div>
                <div className="space-y-2">
                  <Label>Remarks</Label>
                  <Textarea
                    placeholder="Any additional remarks for this invoice (optional)"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateDialogOpen(false); setEditingInvoice(null) }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting || !!formError} className="gap-2">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              {submitting ? 'Saving...' : editingInvoice ? 'Update Invoice' : 'Create Invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Invoice Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invoice Details</DialogTitle>
            <DialogDescription>{selectedInvoice?.invoiceNo}</DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Patient</p>
                  <p className="font-medium">{selectedInvoice.patient?.childName} ({selectedInvoice.patient?.patientId})</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">{format(new Date(selectedInvoice.date), 'dd MMM yyyy')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <Badge variant="outline">{typeLabels[selectedInvoice.type] || selectedInvoice.type}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant="outline" className={statusColors[selectedInvoice.status]}>{selectedInvoice.status.replace('_', ' ')}</Badge>
                </div>
              </div>

              <Separator />

              {/* Items table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(selectedInvoice.invoiceItems || []).map((item, i) => (
                    <TableRow key={i}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.rate)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(item.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Separator />

              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(selectedInvoice.subtotal)}</span></div>
                {selectedInvoice.discount > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{formatCurrency(selectedInvoice.discount)}</span></div>
                )}
                {selectedInvoice.gstApplicable && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CGST ({(() => { const t = selectedInvoice.subtotal - selectedInvoice.discount; return t > 0 ? Math.round((selectedInvoice.cgst / t) * 100) : 9 })()}%)</span>
                      <span>{formatCurrency(selectedInvoice.cgst)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SGST ({(() => { const t = selectedInvoice.subtotal - selectedInvoice.discount; return t > 0 ? Math.round((selectedInvoice.sgst / t) * 100) : 9 })()}%)</span>
                      <span>{formatCurrency(selectedInvoice.sgst)}</span>
                    </div>
                    {selectedInvoice.gstNumber && (
                      <div className="flex justify-between"><span className="text-muted-foreground">GST No</span><span className="text-xs font-mono">{selectedInvoice.gstNumber}</span></div>
                    )}
                  </>
                )}
                <Separator />
                <div className="flex justify-between text-base font-bold"><span>Total</span><span>{formatCurrency(selectedInvoice.totalAmount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span>{formatCurrency(selectedInvoice.amountPaid)}</span></div>
                <div className="flex justify-between font-semibold">
                  <span>Balance Due</span>
                  <span className={selectedInvoice.balanceDue > 0 ? 'text-destructive' : 'text-emerald-600'}>
                    {formatCurrency(selectedInvoice.balanceDue)}
                  </span>
                </div>
              </div>

              {selectedInvoice.paymentMode && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Payment Mode:</span>{' '}
                  <span className="capitalize">{selectedInvoice.paymentMode.replace('_', ' ')}</span>
                </div>
              )}

              {selectedInvoice.notes && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Notes:</span> {selectedInvoice.notes}
                </div>
              )}

              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => handlePrintInvoice(selectedInvoice)} className="gap-2">
                  <Printer className="size-4" /> Print
                </Button>
                <Button onClick={() => { setViewDialogOpen(false) }}>Close</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Mark Paid ActionDialog (Task A1) */}
      <ActionDialog
        open={markPaidOpen}
        onOpenChange={setMarkPaidOpen}
        module="billing"
        recordId={actionTarget?.id || ''}
        actionType="marked_paid"
        actionLabel="Mark Invoice as Paid"
        description={
          actionTarget
            ? `Mark invoice ${actionTarget.invoiceNo} (${formatCurrency(actionTarget.totalAmount)}) as fully paid. A reason or reference is required.`
            : 'Mark this invoice as fully paid. A reason is required.'
        }
        variant="success"
        onConfirm={handleMarkPaid}
      />

      {/* Cancel Invoice ActionDialog (Task A1) */}
      <ActionDialog
        open={cancelInvoiceOpen}
        onOpenChange={setCancelInvoiceOpen}
        module="billing"
        recordId={actionTarget?.id || ''}
        actionType="cancelled"
        actionLabel="Cancel Invoice"
        description={
          actionTarget
            ? `Cancel invoice ${actionTarget.invoiceNo}. This will mark the invoice as cancelled. A reason is required.`
            : 'Cancel this invoice. A reason is required.'
        }
        variant="destructive"
        onConfirm={handleCancelInvoice}
      />

      {/* Delete Invoice ActionDialog (Task A1) */}
      <ActionDialog
        open={deleteInvoiceOpen}
        onOpenChange={setDeleteInvoiceOpen}
        module="billing"
        recordId={actionTarget?.id || ''}
        actionType="deleted"
        actionLabel="Delete Invoice"
        description={
          actionTarget
            ? `Permanently delete invoice ${actionTarget.invoiceNo}. This action cannot be undone. A reason is required.`
            : 'Permanently delete this invoice. A reason is required.'
        }
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}

// ── Searchable service dropdown (Services Master) ──────────────────────────
// Popover + Command combobox: type to filter, pick a service (auto-fills its
// default price) or fall through to "+ Custom Service" for a free-typed entry.
function ServiceCombobox({
  services,
  value,
  onSelect,
  onCustomSelect,
}: {
  services: ServiceMaster[]
  value: string
  onSelect: (service: ServiceMaster) => void
  onCustomSelect: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{value || 'Select Service'}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search service..." />
          <CommandList>
            <CommandEmpty>No service found.</CommandEmpty>
            <CommandGroup>
              {services.map((s) => (
                <CommandItem
                  key={s.id}
                  value={s.name}
                  onSelect={() => { onSelect(s); setOpen(false) }}
                >
                  {s.name} — ₹{new Intl.NumberFormat('en-IN').format(s.defaultPrice)}
                </CommandItem>
              ))}
              <CommandItem
                value="Custom Service"
                onSelect={() => { onCustomSelect(); setOpen(false) }}
                className="text-blue-600 font-medium"
              >
                <Plus className="size-3.5 mr-1" /> Custom Service
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
