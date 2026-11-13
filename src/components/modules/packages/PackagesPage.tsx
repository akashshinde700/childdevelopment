'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { format, addDays, addMinutes } from 'date-fns'
import {
  Plus,
  Pencil,
  Trash2,
  Package,
  UserPlus,
  Clock,
  IndianRupee,
  Percent,
  Calendar,
  MoreVertical,
  Download,
  RefreshCw,
  Filter,
  Bell,
  MessageCircle,
  Gift,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  Sparkles,
  Check,
  CalendarClock,
  UserCog,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ActionDialog } from '@/components/ui/action-dialog'
import { SearchInput } from '@/components/ui/search-input'
import { Switch } from '@/components/ui/switch'
import { DatePicker } from '@/components/ui/date-picker'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'
import { toast } from 'sonner'
import { authFetch } from '@/lib/api-client'
import { takesTherapySessions } from '@/lib/therapists'
import { useAppStore } from '@/store/app-store'
import { useTherapyTypes } from '@/hooks/use-therapy-types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PackageTherapyTypeRow {
  id: string
  therapyType: string
  sessionCount: number
  sessionDuration: number | null
}

interface TherapyPackage {
  id: string
  name: string
  therapyType: string
  sessionCount: number
  sessionDuration: number
  amount: number
  discount: number
  validityDays: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  // Multi-therapy-type bundle lines (e.g. Speech x10, OT x5, ABA x8).
  // Empty/absent for a plain single-type package.
  therapyTypes?: PackageTherapyTypeRow[]
}

interface Patient {
  id: string
  patientId: string
  childName: string
  mobile: string
}

interface PatientPackageAssignment {
  id: string
  patientId: string
  packageId: string
  // Assignment-level fields (snapshot from template, editable per-assignment)
  name: string | null
  therapyType: string | null
  sessionDuration: number | null
  validityDays: number | null
  sessionsPurchased: number
  sessionsCompleted: number
  sessionsExpired: number
  totalAmount: number
  discountAmount: number
  netAmount: number
  startDate: string
  endDate: string
  status: string
  // Per-package billing (computed by the API)
  amountPaid?: number
  dueAmount?: number
  paymentStatus?: 'paid' | 'partial' | 'pending'
  // Sessions purchased but never placed on the calendar at all (computed by the API)
  sessionsScheduled?: number
  sessionsUnscheduled?: number
  patient: { id: string; patientId: string; childName: string; mobile: string; dateOfBirth: string | null; gender: string | null }
  package: { id: string; name: string; therapyType: string; sessionCount: number; amount: number }
}

interface Therapist {
  id: string
  name: string
  role: string
  therapyType?: string | null
  isActive?: boolean
}

interface SessionRow {
  index: number
  date: string
  time: string
  therapistName: string
  // Set only for a session generated from a bundled package's therapy-type
  // block — groupBlockId is the template PackageTherapyType id, used purely
  // to group/re-generate rows client-side; groupSessionNumber resets to 1
  // per block (independent of the global `index`).
  groupBlockId?: string
  groupTherapyType?: string
  groupSessionNumber?: number
}

// 'interval' = the original "every N days" mode (renamed from 'custom' to
// avoid colliding with the new weekday-picker 'custom_days' mode below).
type ScheduleFrequency = 'daily' | 'weekly' | 'interval' | 'custom_days'

// Sun-first order matches JS `Date.getDay()` (0=Sunday..6=Saturday) so the
// Custom Days generator can index straight into this array.
const WEEKDAYS: { key: string; label: string }[] = [
  { key: 'SUNDAY', label: 'Sun' },
  { key: 'MONDAY', label: 'Mon' },
  { key: 'TUESDAY', label: 'Tue' },
  { key: 'WEDNESDAY', label: 'Wed' },
  { key: 'THURSDAY', label: 'Thu' },
  { key: 'FRIDAY', label: 'Fri' },
  { key: 'SATURDAY', label: 'Sat' },
]

function formatCurrency(amount: number): string {
  return `₹${new Intl.NumberFormat('en-IN').format(amount)}`
}

// ─── Therapy icon + color map ──────────────────────────────────────────────────

const THERAPY_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  'Speech Therapy':       { bg: 'bg-blue-100',   text: 'text-blue-600',   icon: '💬' },
  'Occupational Therapy': { bg: 'bg-green-100',  text: 'text-green-600',  icon: '🤝' },
  'Behavioral Therapy':   { bg: 'bg-purple-100', text: 'text-purple-600', icon: '🧠' },
  'Special Education':    { bg: 'bg-yellow-100', text: 'text-yellow-600', icon: '📚' },
  'ABA Therapy':          { bg: 'bg-pink-100',   text: 'text-pink-600',   icon: '🎯' },
  'Physiotherapy':        { bg: 'bg-orange-100', text: 'text-orange-600', icon: '💪' },
  'Counseling':           { bg: 'bg-teal-100',   text: 'text-teal-600',   icon: '🫂' },
  'Remedial Therapy':     { bg: 'bg-red-100',    text: 'text-red-500',    icon: '📖' },
}

function getTherapyStyle(type: string) {
  return THERAPY_STYLES[type] ?? { bg: 'bg-gray-100', text: 'text-gray-600', icon: '📦' }
}

// ─── Package accent colors (Image 1 reference design) ─────────────────────────
// Each standard package has a signature accent color used for the header band
// and the total-price band on the reference card design. Mapping is by session
// count tier (the defining characteristic of each plan) with a name-based
// fallback and a rotating palette for any custom packages.

interface PackageAccent {
  /** background class for the header + price band */
  band: string
  /** text color class used on the colored band */
  bandText: string
  /** solid background for the selection checkmark badge */
  check: string
  /** human label for debugging / tooltips */
  label: string
}

const PACKAGE_ACCENTS: PackageAccent[] = [
  // Ordered by session-count tier — matches Image 1 exactly.
  { band: 'bg-green-500',   bandText: 'text-white',     check: 'bg-green-600',   label: 'green'   }, // 1  session — Single Session
  { band: 'bg-amber-400',   bandText: 'text-amber-950', check: 'bg-amber-500',   label: 'amber'   }, // 4  sessions — Basic Plan
  { band: 'bg-red-500',     bandText: 'text-white',     check: 'bg-red-600',     label: 'red'     }, // 8  sessions — Introductory Plan
  { band: 'bg-slate-500',   bandText: 'text-white',     check: 'bg-slate-600',   label: 'slate'   }, // 12 sessions — Foundation Plan
  { band: 'bg-purple-600',  bandText: 'text-white',     check: 'bg-purple-700',  label: 'purple'  }, // 24 sessions — Progress Plan
  { band: 'bg-blue-500',    bandText: 'text-white',     check: 'bg-blue-600',    label: 'blue'    }, // 48 sessions — Advantage Plan
]

const SESSION_TIER_TO_ACCENT_INDEX: { sessions: number; idx: number }[] = [
  { sessions: 1,  idx: 0 },
  { sessions: 4,  idx: 1 },
  { sessions: 8,  idx: 2 },
  { sessions: 12, idx: 3 },
  { sessions: 24, idx: 4 },
  { sessions: 48, idx: 5 },
]

const NAME_TO_ACCENT_INDEX: { match: RegExp; idx: number }[] = [
  { match: /single/i,     idx: 0 },
  { match: /basic/i,      idx: 1 },
  { match: /intro/i,      idx: 2 },
  { match: /foundation/i, idx: 3 },
  { match: /progress/i,   idx: 4 },
  { match: /advantage/i,  idx: 5 },
]

function getPackageAccent(pkg: { name: string; sessionCount: number }): PackageAccent {
  // 1. Match by session-count tier (the defining trait of each standard plan).
  const tier = SESSION_TIER_TO_ACCENT_INDEX.find((t) => t.sessions === pkg.sessionCount)
  if (tier) return PACKAGE_ACCENTS[tier.idx]

  // 2. Match by name pattern.
  const byName = NAME_TO_ACCENT_INDEX.find((n) => n.match.test(pkg.name))
  if (byName) return PACKAGE_ACCENTS[byName.idx]

  // 3. Fallback: rotate through the palette by session count.
  return PACKAGE_ACCENTS[pkg.sessionCount % PACKAGE_ACCENTS.length]
}

// ─── Price formatting (Rs. prefix to match the Image 1 reference) ─────────────
function formatRupees(amount: number): string {
  return `Rs.${new Intl.NumberFormat('en-IN').format(Math.round(amount))}`
}

function pricePerSession(amount: number, sessions: number): number {
  if (sessions <= 0) return 0
  return Math.round(amount / sessions)
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function PackageStatusBadge({ status }: { status: string }) {
  if (status === 'Active')
    return (
      <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
        Active
      </span>
    )
  if (status === 'Expiring Soon')
    return (
      <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-600">
        Expiring Soon
      </span>
    )
  if (status === 'Completed')
    return (
      <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
        Completed
      </span>
    )
  if (status === 'Expired')
    return (
      <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
        Expired
      </span>
    )
  return <span className="text-xs text-gray-400">{status}</span>
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function PatientAvatar({ name, color }: { name: string; color: string }) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <div
      className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PackagesPage() {
  const [packages, setPackages] = useState<TherapyPackage[]>([])
  const [assignments, setAssignments] = useState<PatientPackageAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const globalSearchQuery = useAppStore((s) => s.searchQuery)
  const setGlobalSearchQuery = useAppStore((s) => s.setSearchQuery)
  const user = useAppStore((s) => s.user)
  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'admin'
  const [patients, setPatients] = useState<Patient[]>([])
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [patientSearch, setPatientSearch] = useState('')
  const [activeCount, setActiveCount] = useState(0)
  const [expiringCount, setExpiringCount] = useState(0)
  const [expiredCount, setExpiredCount] = useState(0)
  const [totalAssignmentsCount, setTotalAssignmentsCount] = useState(0)

  // Reusable debounced search — seeded with the global search bar value.
  const { query, debouncedQuery, setQuery, isDebouncing, clear } = useDebouncedSearch(globalSearchQuery)

  // Filters — applied client-side to the fetched assignments.
  const [filterPatient, setFilterPatient] = useState('all')
  const [filterTherapy, setFilterTherapy] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  // Derived: apply patient/therapy/status filters to the assignments list.
  // This ensures "All Patients" shows all records, and specific selections
  // filter the list immediately (no need to click a Filter button).

  // Unified "Expiring Soon" calculation — matches the backend stat card:
  // an active assignment is "Expiring Soon" if its endDate is within 15 days
  // from now. This keeps the stat card count and the table filter in sync.
  const isExpiringSoon = (endDate: string | Date): boolean => {
    const end = new Date(endDate)
    const now = new Date()
    const fifteenDays = 15 * 24 * 60 * 60 * 1000
    return end.getTime() - now.getTime() <= fifteenDays
  }

  // Derive the 5-status package lifecycle for an assignment (used by the table
  // badge + filter + KPI cards). The lifecycle combines the assignment status,
  // expiry window, and payment state into a single, color-coded status:
  //   1. active            — in date window, fully paid
  //   2. expiring          — expiring within 15 days
  //   3. pending_payment   — active but no payment recorded yet
  //   4. completed         — all sessions consumed
  //   5. expired           — past end date
  // (PACKAGE-LIFECYCLE-LOGIC)
  const getAssignmentStatus = (pp: PatientPackageAssignment): 'active' | 'expiring' | 'pending_payment' | 'completed' | 'expired' => {
    if (pp.status === 'completed') return 'completed'
    if (pp.status === 'expired') return 'expired'
    // status === 'active'
    if (isExpiringSoon(pp.endDate)) return 'expiring'
    // Active but unpaid → pending_payment (surfaces packages needing collection)
    if ((pp.amountPaid ?? 0) === 0 && (pp.paymentStatus ?? 'pending') === 'pending') return 'pending_payment'
    return 'active'
  }

  // Payment badge text + color for the table row (PACKAGE-LIFECYCLE-LOGIC).
  const getPaymentBadge = (pp: PatientPackageAssignment): { label: string; className: string } => {
    const ps = pp.paymentStatus ?? 'pending'
    if (ps === 'paid') return { label: 'Paid', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
    if (ps === 'partial') return { label: 'Partial', className: 'bg-amber-100 text-amber-700 border-amber-200' }
    return { label: 'Pending', className: 'bg-rose-100 text-rose-700 border-rose-200' }
  }

  const filteredAssignments = assignments.filter((pp) => {
    // Patient filter
    if (filterPatient !== 'all' && pp.patientId !== filterPatient) return false
    // Therapy type filter
    if (filterTherapy !== 'all') {
      const tType = (pp.therapyType ?? pp.package?.therapyType) || ''
      if (tType !== filterTherapy) return false
    }
    // Status filter
    if (filterStatus !== 'all') {
      if (getAssignmentStatus(pp) !== filterStatus) return false
    }
    return true
  })

  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const totalPages = Math.max(1, Math.ceil(filteredAssignments.length / pageSize))
  const paginatedAssignments = filteredAssignments.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  useEffect(() => {
    setCurrentPage(1)
  }, [filterPatient, filterTherapy, filterStatus, debouncedQuery, pageSize])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    if (globalSearchQuery) {
      setQuery(globalSearchQuery)
      setGlobalSearchQuery('')
    }
  }, [globalSearchQuery, setGlobalSearchQuery, setQuery])

  // Create/Edit dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingPackage, setEditingPackage] = useState<TherapyPackage | null>(null)
  // When non-null, the edit dialog is editing a PatientPackage ASSIGNMENT (not a
  // template). Save goes to PUT /api/patient-packages/[id] using this assignment ID.
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    therapyType: 'Speech Therapy',
    sessionCount: 10,
    sessionDuration: 30,
    amount: 0,
    discount: 0,
    validityDays: 30,
  })
  // Multi-therapy-type bundle (new-package creation only — e.g. Speech x10,
  // OT x5, ABA x8 all inside one package). Editing an existing package keeps
  // the single-type flow above.
  const [isBundle, setIsBundle] = useState(false)
  const [bundleTypes, setBundleTypes] = useState<{ therapyType: string; sessionCount: number; sessionDuration: number }[]>([
    { therapyType: 'Speech Therapy', sessionCount: 10, sessionDuration: 30 },
  ])

  // Assign dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [assignStep, setAssignStep] = useState(1) // 1=Patient, 2=Package, 3=Schedule
  const [assignForm, setAssignForm] = useState({
    patientId: '',
    packageId: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    discountAmount: 0,
  })

  // ── Session scheduling state (Task P1) ──────────────────────────────────────
  // Per-session rows generated once a package is selected. Each row carries the
  // ISO date, time slot, and therapist name (which the API stores as therapistId).
  const [sessions, setSessions] = useState<SessionRow[]>([])
  // Auto-generate section
  const [autoGenerate, setAutoGenerate] = useState(false)
  const [frequency, setFrequency] = useState<ScheduleFrequency>('weekly')
  const [customDays, setCustomDays] = useState(3) // every N days (interval mode)
  const [preferredTime, setPreferredTime] = useState('10:00')
  // Custom Days mode: which weekdays to cycle through + a time per weekday.
  const [selectedWeekDays, setSelectedWeekDays] = useState<string[]>([])
  const [weekdayTimes, setWeekdayTimes] = useState<Record<string, string>>({})

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PatientPackageAssignment | null>(null)
  const [saving, setSaving] = useState(false)
  const [exportingPackages, setExportingPackages] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Activate / Deactivate action dialogs (Task A1)
  const [activateOpen, setActivateOpen] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [statusTarget, setStatusTarget] = useState<TherapyPackage | null>(null)

  // ── Data fetching (preserved from original) ──────────────────────────────────

  const fetchPackages = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (debouncedQuery) params.set('search', debouncedQuery)
      const res = await authFetch(`/api/packages?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setPackages(json.packages || [])
        if (json.stats) {
          setActiveCount(json.stats.activeCount || 0)
          setExpiringCount(json.stats.expiringCount || 0)
          setExpiredCount(json.stats.expiredCount || 0)
          setTotalAssignmentsCount(json.stats.totalAssignments ?? 0)
        }
      }
    } catch (err) {
      console.error('Failed to fetch packages:', err)
      toast.error('Failed to load packages')
    } finally {
      setLoading(false)
    }
  }, [debouncedQuery])

  // Guards against out-of-order responses: if an older in-flight request
  // (e.g. from a search keystroke) resolves *after* the refetch triggered by
  // a delete/edit, it must not be allowed to overwrite the newer state with
  // stale data — which is exactly what makes a just-deleted row "come back".
  const assignmentsRequestId = useRef(0)
  const fetchAssignments = useCallback(async () => {
    const requestId = ++assignmentsRequestId.current
    try {
      const params = new URLSearchParams({ type: 'assignments', limit: '100' })
      if (debouncedQuery) params.set('search', debouncedQuery)
      const res = await authFetch(`/api/packages?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        if (requestId === assignmentsRequestId.current) {
          setAssignments(json.assignments || [])
        }
      }
    } catch (err) {
      console.error('Failed to fetch assignments:', err)
      if (requestId === assignmentsRequestId.current) toast.error('Failed to load package assignments')
    }
  }, [debouncedQuery])

  const fetchPatients = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '200', search: patientSearch })
      const res = await authFetch(`/api/patients?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setPatients(json.patients || [])
      }
    } catch {
      // silent
    }
  }, [patientSearch])

  // Therapists — same pattern as AppointmentsPage. /api/users is admin-only;
  // therapist_* roles are filtered client-side. The therapist `name` is what
  // the Appointments API stores on the `therapistId` field.
  const fetchTherapists = useCallback(async () => {
    try {
      const res = await authFetch('/api/users')
      if (res.ok) {
        const json = await res.json()
        const therapistRoles = new Set([
          'therapist_speech', 'therapist_ot', 'therapist_behavioral',
          'therapist_remedial', 'psychologist',
        ])
        const loaded: Therapist[] = Array.isArray(json)
          ? json.filter((u: Therapist) => u?.name && takesTherapySessions(u, [...therapistRoles]) && u.isActive !== false)
          : []
        setTherapists(loaded)
      }
    } catch {
      // silent
    }
  }, [])

  useEffect(() => { fetchPackages(); fetchAssignments() }, [fetchPackages, fetchAssignments])
  useEffect(() => { fetchPatients() }, [fetchPatients])
  useEffect(() => { fetchTherapists() }, [fetchTherapists])

  // ── CRUD handlers (preserved from original) ───────────────────────────────────

  const openCreate = () => {
    setEditingPackage(null)
    setEditingAssignmentId(null)
    setForm({ name: '', therapyType: 'Speech Therapy', sessionCount: 10, sessionDuration: 30, amount: 0, discount: 0, validityDays: 30 })
    setIsBundle(false)
    setBundleTypes([{ therapyType: 'Speech Therapy', sessionCount: 10, sessionDuration: 30 }])
    setCreateDialogOpen(true)
  }

  const openEdit = (pkg: TherapyPackage) => {
    setEditingPackage(pkg)
    setEditingAssignmentId(null)
    setForm({
      name: pkg.name,
      therapyType: pkg.therapyType,
      sessionCount: pkg.sessionCount,
      sessionDuration: pkg.sessionDuration,
      amount: pkg.amount,
      discount: pkg.discount,
      validityDays: pkg.validityDays,
    })
    setIsBundle(false)
    setCreateDialogOpen(true)
  }

  // Open the edit dialog for a PatientPackage ASSIGNMENT (not a template).
  // Uses assignment-level fields with fallback to the template. Save goes to
  // PUT /api/patient-packages/[assignmentId] — only this assignment is affected;
  // no other patient's assignment or the shared template is touched.
  const openEditAssignment = (pp: PatientPackageAssignment) => {
    setEditingPackage(null)
    setEditingAssignmentId(pp.id)
    setForm({
      name: pp.name ?? pp.package?.name ?? '',
      therapyType: pp.therapyType ?? pp.package?.therapyType ?? 'Speech Therapy',
      sessionCount: pp.sessionsPurchased,
      sessionDuration: pp.sessionDuration ?? 30,
      amount: pp.totalAmount,
      discount: pp.discountAmount || 0,
      validityDays: pp.validityDays ?? 30,
    })
    setCreateDialogOpen(true)
  }

  // Duplicate a package template (creates a copy with "(Copy)" suffix)
  const handleDuplicate = async (pkg: TherapyPackage) => {
    setSaving(true)
    try {
      const res = await authFetch('/api/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${pkg.name} (Copy)`,
          therapyType: pkg.therapyType,
          sessionCount: pkg.sessionCount,
          sessionDuration: pkg.sessionDuration,
          amount: pkg.amount,
          discount: pkg.discount,
          validityDays: pkg.validityDays,
        }),
      })
      if (res.ok) {
        toast.success('Package duplicated successfully')
        fetchPackages()
      } else {
        toast.error('Failed to duplicate package')
      }
    } catch {
      toast.error('Failed to duplicate package')
    } finally {
      setSaving(false)
    }
  }

  // Delete template state + handler
  const [deleteTemplateOpen, setDeleteTemplateOpen] = useState(false)
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<TherapyPackage | null>(null)
  const [deleteTemplateAssignments, setDeleteTemplateAssignments] = useState<number>(0)

  const openDeleteTemplate = async (pkg: TherapyPackage) => {
    // Check if this package is assigned to any patients
    try {
      const res = await authFetch(`/api/packages?type=assignments&limit=1000`)
      if (res.ok) {
        const json = await res.json()
        const count = (json.assignments || []).filter((a: PatientPackageAssignment) => a.packageId === pkg.id).length
        setDeleteTemplateAssignments(count)
      }
    } catch { /* silent — allow delete attempt anyway */ }
    setDeleteTemplateTarget(pkg)
    setDeleteTemplateOpen(true)
  }

  const handleDeleteTemplate = async () => {
    if (!deleteTemplateTarget) return
    setDeleting(true)
    try {
      const res = await authFetch(`/api/packages?id=${deleteTemplateTarget.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Package template deleted')
        setDeleteTemplateOpen(false)
        setDeleteTemplateTarget(null)
        fetchPackages()
      } else {
        toast.error('Failed to delete package — it may have assignments')
      }
    } catch {
      toast.error('Failed to delete package')
    } finally {
      setDeleting(false)
    }
  }

  const handleSave = async () => {
    const creatingBundle = isBundle && !editingPackage && !editingAssignmentId
    if (!form.name) {
      toast.error('Please fill in all required fields')
      return
    }
    if (creatingBundle) {
      if (bundleTypes.length === 0 || bundleTypes.some((t) => !t.therapyType || t.sessionCount <= 0)) {
        toast.error('Each therapy type needs a type and a session count greater than 0')
        return
      }
    } else if (!form.therapyType) {
      toast.error('Please fill in all required fields')
      return
    }
    setSaving(true)
    try {
      let res: Response
      if (editingAssignmentId) {
        // Editing a PatientPackage ASSIGNMENT — scoped to this one assignment.
        // Does NOT touch the shared Package template or any other patient's assignment.
        res = await authFetch(`/api/patient-packages/${editingAssignmentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            therapyType: form.therapyType,
            sessionDuration: form.sessionDuration,
            sessionsPurchased: form.sessionCount,
            totalAmount: form.amount,
            discountAmount: form.discount,
            validityDays: form.validityDays,
          }),
        })
      } else if (editingPackage) {
        // Editing a Package TEMPLATE (super admin only)
        res = await authFetch('/api/packages', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, id: editingPackage.id }),
        })
      } else {
        // Creating a new Package TEMPLATE — bundle (multi-type) or single-type
        res = await authFetch('/api/packages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creatingBundle ? { ...form, therapyTypes: bundleTypes } : form),
        })
      }
      if (res.ok) {
        toast.success(editingAssignmentId || editingPackage ? 'Package updated successfully' : 'Package created successfully')
        setCreateDialogOpen(false)
        setEditingAssignmentId(null)
        fetchPackages()
        fetchAssignments()
      } else {
        const json = await res.json().catch(() => ({}))
        toast.error(json.error || 'Failed to save package')
      }
    } catch {
      toast.error('Failed to save package')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      // Delete the PatientPackage ASSIGNMENT by its assignment ID.
      // Only this one assignment is removed — the shared template and all other
      // patients' assignments are untouched.
      const res = await authFetch(`/api/patient-packages/${deleteTarget.id}`, { method: 'DELETE' })

      if (res.ok) {
        toast.success('Package assignment deleted successfully')
        setDeleteDialogOpen(false)
        setDeleteTarget(null)
        fetchPackages()
        fetchAssignments()
      } else if (res.status === 401) {
        toast.error('Session expired. Please log in again.')
        setDeleteDialogOpen(false)
      } else if (res.status === 403) {
        toast.error('You do not have permission to delete packages. Only Super Admin can delete.')
      } else {
        let errorMsg = 'Failed to delete package'
        try {
          const text = await res.text()
          if (text) {
            const json = JSON.parse(text)
            errorMsg = json.error || errorMsg
          }
        } catch {
          errorMsg = `Server error (${res.status})`
        }
        toast.error(errorMsg)
      }
    } catch (err) {
      console.error('[PackagesPage] DELETE exception:', err)
      toast.error('Network error — failed to delete package')
    } finally {
      setDeleting(false)
    }
  }

  // ── Session scheduling helpers (Task P1) ──────────────────────────────────────
  // The currently-selected package object (memoized so session regeneration
  // doesn't run on every render).
  const selectedPackage = useMemo(
    () => packages.find((p) => p.id === assignForm.packageId) || null,
    [packages, assignForm.packageId],
  )

  // The clinic's own therapy types (Settings → System Config), plus any type
  // already in use by a therapist or an existing package so editing an old
  // record never drops its type.
  const typesInUse = useMemo(
    () => [...therapists.map((t) => t.therapyType), ...packages.map((pkg) => pkg.therapyType)],
    [therapists, packages]
  )
  const therapyTypeOptions = useTherapyTypes(typesInUse)

  // Therapists whose specialization matches a given therapy type — keeps the
  // per-session therapist dropdown from showing unrelated specialists (e.g.
  // an OT therapist for a Speech Therapy session/block). Therapists with no
  // `therapyType` set are shown for every type (treated as generalists)
  // rather than hidden entirely.
  const therapistsForType = useCallback((type: string) => {
    const wanted = type.trim().toLowerCase()
    return therapists.filter((t) => !t.therapyType || t.therapyType.trim().toLowerCase() === wanted)
  }, [therapists])

  const therapistsForSelectedPackage = useMemo(() => {
    if (!selectedPackage) return therapists
    return therapistsForType(selectedPackage.therapyType)
  }, [therapists, selectedPackage, therapistsForType])

  // Multi-therapy-type bundle blocks for the selected package (empty for a
  // plain single-type package). Memoized so the reference is stable across
  // renders — an inline `|| []` fallback would produce a new array every
  // render and infinite-loop the effect below (which depends on it).
  const bundleBlocks = useMemo(() => selectedPackage?.therapyTypes || [], [selectedPackage])
  const isBundlePackage = bundleBlocks.length > 0

  // Sessions grouped by therapy-type block, in template order — used to
  // render Step 3 as separate per-type sections. `null` for a non-bundle
  // package (falls back to the original flat list).
  const groupedSessions = useMemo(() => {
    if (!isBundlePackage) return null
    return bundleBlocks.map((block) => ({
      block,
      rows: sessions
        .filter((s) => s.groupBlockId === block.id)
        .sort((a, b) => (a.groupSessionNumber || 0) - (b.groupSessionNumber || 0)),
    }))
  }, [isBundlePackage, bundleBlocks, sessions])

  // Build the default session list whenever the user picks a package.
  // Defaults: weekly cadence from TODAY (deliberately not the Package Assign
  // Date — session scheduling and package validity are independent; see the
  // note above the Package Assign Date field), 10:00 time slot, therapist
  // left empty for the user to fill in per row. A bundle package gets one
  // independent weekly stream PER therapy-type block, flattened into the
  // same `sessions` array (tagged with group info) so the rest of the
  // scheduling logic (updateSession, handleAssign) doesn't need to know
  // about bundles at all.
  useEffect(() => {
    if (!selectedPackage) {
      setSessions([])
      return
    }
    const startBase = new Date()

    if (isBundlePackage) {
      let globalIdx = 0
      const rows: SessionRow[] = []
      bundleBlocks.forEach((block, blockIdx) => {
        // Stagger each block's default time by 45min so a patient's Speech
        // and OT sessions (both scheduled from the same start date) don't
        // default to an identical day+time and trip the same-patient overlap
        // check. The user can still adjust any row's time afterwards.
        const defaultTime = format(addMinutes(new Date(2000, 0, 1, 10, 0), blockIdx * 45), 'HH:mm')
        const count = block.sessionCount || 0
        for (let i = 0; i < count; i++) {
          globalIdx++
          rows.push({
            index: globalIdx,
            date: format(addDays(startBase, i * 7), 'yyyy-MM-dd'),
            time: defaultTime,
            therapistName: '',
            groupBlockId: block.id,
            groupTherapyType: block.therapyType,
            groupSessionNumber: i + 1,
          })
        }
      })
      setSessions(rows)
      return
    }

    const count = selectedPackage.sessionCount || 0
    if (count <= 0) {
      setSessions([])
      return
    }
    const rows: SessionRow[] = Array.from({ length: count }, (_, i) => ({
      index: i + 1,
      date: format(addDays(startBase, i * 7), 'yyyy-MM-dd'),
      time: '10:00',
      therapistName: '',
    }))
    setSessions(rows)
  }, [selectedPackage, isBundlePackage, bundleBlocks])

  // Auto-generate: fills all session dates based on the chosen frequency.
  // Respects the preferred time set in the collapsible section, but preserves
  // any therapist the user has already picked per row. For a bundle package,
  // the SAME frequency/weekday config is applied independently to every
  // therapy-type block (each block gets its own session-count-length stream
  // starting from the same assignment start date).
  const generateSchedule = () => {
    if (!selectedPackage) {
      toast.error('Select a package first')
      return
    }
    // Session scheduling starts from today, independent of the Package
    // Assign Date field (which only affects package validity/start/expiry).
    const startBase = new Date()

    if (frequency === 'custom_days') {
      if (selectedWeekDays.length === 0) {
        toast.error('Select at least one weekday')
        return
      }
      const missingTime = selectedWeekDays.find((d) => !weekdayTimes[d])
      if (missingTime) {
        toast.error(`Please set a time for ${WEEKDAYS.find((w) => w.key === missingTime)?.label}`)
        return
      }
    }

    // Computes `count` {date, time} slots starting at startBase per the
    // currently-chosen frequency — shared by both the bundle and
    // single-type branches below. `timeOffsetMin` shifts every slot's time
    // by N minutes — used to stagger each bundle block's default time so two
    // blocks scheduled from the same start date don't land on the exact same
    // day+time (which the same-patient overlap check would reject).
    const offsetTime = (time: string, offsetMin: number) => {
      if (!offsetMin) return time
      const [h, m] = time.split(':').map(Number)
      return format(addMinutes(new Date(2000, 0, 1, h, m), offsetMin), 'HH:mm')
    }
    const computeSlots = (count: number, timeOffsetMin = 0): { date: string; time: string }[] => {
      if (frequency === 'custom_days') {
        const slots: { date: string; time: string }[] = []
        const cursor = new Date(startBase)
        let guard = 0
        while (slots.length < count && guard < count * 30) {
          const dayKey = WEEKDAYS[cursor.getDay()].key
          if (selectedWeekDays.includes(dayKey)) {
            slots.push({ date: format(cursor, 'yyyy-MM-dd'), time: offsetTime(weekdayTimes[dayKey] || '10:00', timeOffsetMin) })
          }
          cursor.setDate(cursor.getDate() + 1)
          guard++
        }
        return slots
      }
      const stepDays =
        frequency === 'daily' ? 1 :
        frequency === 'weekly' ? 7 :
        Math.max(1, customDays || 1)
      return Array.from({ length: count }, (_, i) => ({
        date: format(addDays(startBase, i * stepDays), 'yyyy-MM-dd'),
        time: offsetTime(preferredTime || '10:00', timeOffsetMin),
      }))
    }

    const freqLabel = frequency === 'custom_days'
      ? `Custom Days: ${selectedWeekDays.map((k) => WEEKDAYS.find((w) => w.key === k)?.label).join(', ')}`
      : frequency

    if (isBundlePackage) {
      setSessions((prev) => {
        let globalIdx = 0
        const next: SessionRow[] = []
        bundleBlocks.forEach((block, blockIdx) => {
          const count = block.sessionCount || 0
          const slots = computeSlots(count, blockIdx * 45)
          for (let i = 0; i < count; i++) {
            globalIdx++
            const existing = prev.find((r) => r.groupBlockId === block.id && r.groupSessionNumber === i + 1)
            next.push({
              index: globalIdx,
              date: slots[i]?.date || format(startBase, 'yyyy-MM-dd'),
              time: slots[i]?.time || '10:00',
              therapistName: existing?.therapistName || '',
              groupBlockId: block.id,
              groupTherapyType: block.therapyType,
              groupSessionNumber: i + 1,
            })
          }
        })
        return next
      })
      toast.success(`Generated schedule for ${bundleBlocks.length} therapy type${bundleBlocks.length === 1 ? '' : 's'} (${freqLabel})`)
      return
    }

    const count = selectedPackage.sessionCount || 0
    if (count <= 0) return
    const slots = computeSlots(count)
    setSessions((prev) => {
      const next: SessionRow[] = Array.from({ length: count }, (_, i) => {
        const existing = prev[i]
        return {
          index: i + 1,
          date: slots[i].date,
          time: slots[i].time,
          therapistName: existing?.therapistName || '',
        }
      })
      return next
    })
    toast.success(`Generated ${count} session${count === 1 ? '' : 's'} (${freqLabel})`)
  }

  // Per-row field updates — used by the inputs in the session grid.
  const updateSession = (idx: number, patch: Partial<SessionRow>) => {
    setSessions((prev) => prev.map((s) => (s.index === idx ? { ...s, ...patch } : s)))
  }

  // Auto-assign a therapist to every row that doesn't already have one,
  // matching by therapy type (via therapistsForType) and round-robining
  // across matching therapists so the same person isn't booked twice at the
  // exact same date+time within this batch. Rows the user already assigned
  // manually are left untouched. If every matching therapist is already
  // taken at a given slot, the next one in rotation is used anyway — the
  // existing date/time conflict-retry in handleAssign is the real safety net
  // against double-booking on submission.
  const autoAssignTherapists = () => {
    if (sessions.length === 0) {
      toast.error('Generate the schedule first')
      return
    }
    let unassignableCount = 0
    setSessions((prev) => {
      const takenAtSlot = new Map<string, Set<string>>()
      const rotation = new Map<string, number>()
      const next = prev.map((row) => {
        if (row.therapistName) return row
        const therapyType = row.groupTherapyType || selectedPackage?.therapyType || ''
        const candidates = therapistsForType(therapyType)
        if (candidates.length === 0) {
          unassignableCount++
          return row
        }
        const slotKey = `${row.date}_${row.time}`
        const taken = takenAtSlot.get(slotKey) || new Set<string>()
        const startIdx = rotation.get(therapyType) || 0
        let picked: string | null = null
        for (let i = 0; i < candidates.length; i++) {
          const idx = (startIdx + i) % candidates.length
          if (!taken.has(candidates[idx].name)) {
            picked = candidates[idx].name
            rotation.set(therapyType, idx + 1)
            break
          }
        }
        if (!picked) {
          const idx = startIdx % candidates.length
          picked = candidates[idx].name
          rotation.set(therapyType, idx + 1)
        }
        taken.add(picked)
        takenAtSlot.set(slotKey, taken)
        return { ...row, therapistName: picked }
      })
      return next
    })
    if (unassignableCount > 0) {
      toast.error(`Auto-assigned where possible — ${unassignableCount} session(s) have no matching therapist available`)
    } else {
      toast.success('Therapists auto-assigned based on therapy type')
    }
  }

  const handleAssign = async () => {
    if (!assignForm.patientId || !assignForm.packageId) {
      toast.error('Please select patient and package')
      return
    }
    if (!assignForm.startDate) {
      toast.error('Please select a Package Assign Date')
      return
    }
    setSaving(true)
    try {
      // 1. Create the PatientPackage assignment. The PATCH endpoint returns the
      //    created PatientPackage record (including its `id`), which we use to
      //    link the scheduled appointments.
      const res = await authFetch('/api/packages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignForm),
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        toast.error(errJson.error || 'Failed to assign package')
        return
      }
      const patientPackage = await res.json()

      // 2. Schedule sessions — only for rows where the user filled in date, time,
      //    AND therapist. Rows with missing data are silently skipped (per task
      //    spec: "session rows are optional").
      const pkg = packages.find((p) => p.id === assignForm.packageId)
      const packageName = pkg?.name || 'Therapy Package'
      const sessionsToSchedule = sessions.filter(
        (s) => s.date && s.time && s.therapistName,
      )

      // Map each template block (bundleBlocks[i].id) to the just-created
      // assignment-level block (patientPackage.therapyTypeBlocks), matched by
      // therapy-type label, so each scheduled session links to the RIGHT
      // per-type session counter (so completing it decrements only that type).
      const assignmentBlocksByType = new Map<string, string>()
      const assignmentBlocks: Array<{ id: string; therapyType: string }> = patientPackage.therapyTypeBlocks || []
      for (const b of assignmentBlocks) {
        if (!assignmentBlocksByType.has(b.therapyType)) assignmentBlocksByType.set(b.therapyType, b.id)
      }

      // Root-cause fix (session-count mismatch bug): a plain "one POST per
      // session, silently drop on conflict" loop is what caused
      // sessionsPurchased (e.g. 24) to diverge from the actual number of
      // Appointment rows created (e.g. 20) — a 409 from the therapist/patient
      // double-booking check would just increment a counter and move on, with
      // no way for anything downstream to know a session went missing.
      // Instead: on a scheduling conflict, search forward for the next open
      // slot (same day, later time; then later days) before giving up, so
      // every purchased session actually gets scheduled in the common case.
      // Only a genuine dead end (no open slot found at all) is reported as a
      // real failure — loudly, not as a dismiss-and-forget toast.
      let scheduledCount = 0
      const failedSessions: Array<{ label: string; date: string; time: string; reason: string }> = []

      for (const s of sessionsToSchedule) {
        const title = s.groupTherapyType
          ? `${s.groupTherapyType} #${s.groupSessionNumber} - ${packageName}`
          : `Session ${s.index} - ${packageName}`
        const patientPackageTherapyTypeId = s.groupTherapyType ? assignmentBlocksByType.get(s.groupTherapyType) : undefined

        let placed = false
        let lastError = ''

        findSlot:
        for (let dayOffset = 0; dayOffset < 6; dayOffset++) {
          const attemptDate = format(addDays(new Date(s.date), dayOffset), 'yyyy-MM-dd')
          for (let slotOffset = 0; slotOffset < 4; slotOffset++) {
            const [baseH, baseM] = s.time.split(':').map(Number)
            const attemptStart = new Date(2000, 0, 1, baseH, baseM)
            const shifted = addMinutes(attemptStart, slotOffset * 45)
            const attemptTime = format(shifted, 'HH:mm')
            const endTime = format(addMinutes(shifted, 45), 'HH:mm')

            try {
              const apptRes = await authFetch('/api/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  patientId: assignForm.patientId,
                  therapistId: s.therapistName,
                  title,
                  date: attemptDate,
                  startTime: attemptTime,
                  endTime,
                  status: 'scheduled',
                  type: 'therapy',
                  patientPackageId: patientPackage.id,
                  // Bundle sessions get their specific block's type
                  // (s.groupTherapyType); a plain single-type package has no
                  // group, so fall back to the package template's own
                  // therapyType — without this, single-type package
                  // appointments were created with therapyType left null,
                  // which silently broke anything reading it later (e.g. the
                  // Payroll Engine's per-service rate lookup).
                  therapyType: s.groupTherapyType || pkg?.therapyType || null,
                  ...(s.groupTherapyType ? { sessionNumber: s.groupSessionNumber } : {}),
                  ...(patientPackageTherapyTypeId ? { patientPackageTherapyTypeId } : {}),
                }),
              })
              if (apptRes.ok) {
                placed = true
                scheduledCount++
                break findSlot
              }
              const errJson = await apptRes.json().catch(() => ({}))
              lastError = errJson.error || `HTTP ${apptRes.status}`
              // Only a scheduling CONFLICT (409) is worth retrying at a
              // different slot — any other error (validation, 500) will fail
              // identically no matter the date/time, so stop immediately.
              if (apptRes.status !== 409) break findSlot
            } catch {
              lastError = 'Network error'
              break findSlot
            }
          }
        }

        if (!placed) {
          failedSessions.push({ label: title, date: s.date, time: s.time, reason: lastError || 'Unknown error' })
        }
      }

      // 3. Success message — reflects whether sessions were scheduled.
      if (scheduledCount > 0) {
        toast.success(`Package assigned with ${scheduledCount} session${scheduledCount === 1 ? '' : 's'} scheduled`)
      } else if (sessionsToSchedule.length > 0) {
        toast.warning('Package assigned, but no sessions could be scheduled')
      } else {
        toast.success('Package assigned to patient')
      }
      if (failedSessions.length > 0) {
        console.error('Sessions that could not be scheduled (no open slot found):', failedSessions)
        toast.error(
          `${failedSessions.length} of ${sessionsToSchedule.length} session(s) could NOT be scheduled — no open slot found nearby (${failedSessions.map((f) => f.label).join(', ')}). Please schedule them manually from the Appointments page.`,
          { duration: 15000 },
        )
      }

      // 4. Close dialog & refresh.
      setAssignDialogOpen(false)
      setAssignForm({ patientId: '', packageId: '', startDate: format(new Date(), 'yyyy-MM-dd'), discountAmount: 0 })
      setSessions([])
      setAutoGenerate(false)
      fetchAssignments()
      fetchPackages()
      void patientPackage
    } catch {
      toast.error('Failed to assign package')
    } finally {
      setSaving(false)
    }
  }

  // ── Activate / Deactivate handlers (Task A1) ────────────────────────────────
  // onConfirm handlers — ActionDialog handles success/error toasts + dialog close.
  const confirmActivate = async () => {
    if (!statusTarget) return
    const res = await authFetch('/api/packages', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: statusTarget.id, isActive: true }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to activate package')
    }
    setStatusTarget(null)
    fetchPackages()
  }

  const confirmDeactivate = async () => {
    if (!statusTarget) return
    const res = await authFetch('/api/packages', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: statusTarget.id, isActive: false }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to deactivate package')
    }
    setStatusTarget(null)
    fetchPackages()
  }

  const openActivate = (pkg: TherapyPackage) => {
    setStatusTarget(pkg)
    setActivateOpen(true)
  }

  const openDeactivate = (pkg: TherapyPackage) => {
    setStatusTarget(pkg)
    setDeactivateOpen(true)
  }

  const handleExportPackages = async () => {
    if (exportingPackages) return
    setExportingPackages(true)
    try {
      const statusLabels: Record<string, string> = {
        active: 'Active', expiring: 'Expiring Soon', pending_payment: 'Pending Payment',
        completed: 'Completed', expired: 'Expired',
      }
      const XLSX = await import('xlsx')
      const headers = [
        'Patient', 'Patient ID', 'Package', 'Therapy Type', 'Sessions Completed', 'Sessions Purchased',
        'Total Amount', 'Discount', 'Net Amount', 'Paid', 'Due', 'Status', 'Expires',
      ]
      const rows = filteredAssignments.map((pp) => [
        pp.patient?.childName || 'N/A',
        pp.patient?.patientId || '',
        pp.package?.name || pp.name || 'N/A',
        pp.therapyType || pp.package?.therapyType || 'N/A',
        pp.sessionsCompleted,
        pp.sessionsPurchased,
        pp.totalAmount,
        pp.discountAmount || 0,
        pp.netAmount,
        pp.amountPaid || 0,
        pp.dueAmount ?? Math.max(0, pp.netAmount - (pp.amountPaid || 0)),
        statusLabels[getAssignmentStatus(pp)] || getAssignmentStatus(pp),
        format(new Date(pp.endDate), 'dd MMM yyyy'),
      ])

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      ws['!cols'] = [
        { wch: 22 }, { wch: 12 }, { wch: 24 }, { wch: 20 }, { wch: 10 }, { wch: 10 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 14 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Session Packages')
      XLSX.writeFile(wb, `session-packages-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
    } finally {
      setExportingPackages(false)
    }
  }

  // ── KPI derived values ────────────────────────────────────────────────────────
  // KPI cards are derived from the FILTERED assignment list so the card counts
  // always match the visible table rows (PACKAGES-FILTER-SYNC-FIX). When no
  // filters are active this equals the server-side stats; when a filter is
  // applied the cards update to reflect only the matching subset.
  // The 5-status lifecycle (PACKAGE-LIFECYCLE-LOGIC) drives the colorful cards.
  const totalPackages = filteredAssignments.length
  const activePackages = filteredAssignments.filter(pp => getAssignmentStatus(pp) === 'active').length
  const expiringSoon = filteredAssignments.filter(pp => getAssignmentStatus(pp) === 'expiring').length
  const pendingPaymentPackages = filteredAssignments.filter(pp => getAssignmentStatus(pp) === 'pending_payment').length
  const expiredPackages = filteredAssignments.filter(pp => getAssignmentStatus(pp) === 'expired').length

  // ── Loading state ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">

      {/* ── Top Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b-2 border-gray-200 px-4 sm:px-6 py-5 flex items-center flex-wrap gap-y-3 justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <Package className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Session Packages</h1>
              <p className="text-sm text-gray-500">Manage therapy packages, sessions and balances</p>
            </div>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-3 ml-auto">
          {/* Search */}
          <SearchInput
            value={query}
            onChange={setQuery}
            onClear={clear}
            loading={isDebouncing || loading}
            placeholder="Search by child name, ID or mobile..."
            className="hidden md:block w-72"
          />

          {/* WhatsApp icon */}
          <button className="h-9 w-9 rounded-full bg-green-100 flex items-center justify-center hover:bg-green-200 transition-colors">
            <MessageCircle className="h-5 w-5 text-green-600" />
          </button>

          {/* Notifications */}
          <button className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center relative hover:bg-gray-200 transition-colors">
            <Bell className="h-5 w-5 text-gray-600" />
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">8</span>
          </button>

          {/* Export */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-gray-700 border-gray-300"
            onClick={handleExportPackages}
            disabled={exportingPackages}
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">{exportingPackages ? 'Exporting…' : 'Export'}</span>
          </Button>

          {/* Add New Package — Super Admin only */}
          {isSuperAdmin && (
            <Button
              onClick={openCreate}
              size="sm"
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add New Package</span>
            </Button>
          )}

          {/* Assign Package to Patient — Super Admin only */}
          {isSuperAdmin && (
            <Button
              onClick={() => { setAssignStep(1); setAssignDialogOpen(true) }}
              size="sm"
              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Assign Package</span>
            </Button>
          )}
        </div>
      </div>

      {/* ── Body: main content + right sidebar ───────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Main Content ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 min-w-0">

          {/* Revenue & Stats Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Revenue */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border border-purple-200 shadow-sm p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className="h-12 w-12 rounded-xl bg-purple-500 flex items-center justify-center shrink-0 shadow-sm">
                <IndianRupee className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-purple-700 font-medium">Total Revenue</p>
                <p className="text-2xl font-bold text-purple-900">{formatCurrency(filteredAssignments.reduce((sum, pp) => sum + pp.netAmount, 0))}</p>
                <p className="text-xs text-purple-600 mt-1">{filteredAssignments.length} packages</p>
              </div>
            </div>

            {/* Pending Collection */}
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl border border-orange-200 shadow-sm p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className="h-12 w-12 rounded-xl bg-orange-500 flex items-center justify-center shrink-0 shadow-sm">
                <AlertTriangle className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-orange-700 font-medium">Pending Collection</p>
                <p className="text-2xl font-bold text-orange-900">{formatCurrency(filteredAssignments.filter(pp => pp.paymentStatus === 'pending' || pp.paymentStatus === 'partial').reduce((sum, pp) => sum + (pp.dueAmount || 0), 0))}</p>
                <p className="text-xs text-orange-600 mt-1">{filteredAssignments.filter(pp => pp.paymentStatus === 'pending' || pp.paymentStatus === 'partial').length} pending</p>
              </div>
            </div>

            {/* Avg Package Value */}
            <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl border border-teal-200 shadow-sm p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className="h-12 w-12 rounded-xl bg-teal-500 flex items-center justify-center shrink-0 shadow-sm">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-teal-700 font-medium">Avg Package Value</p>
                <p className="text-2xl font-bold text-teal-900">{formatCurrency(filteredAssignments.length > 0 ? Math.round(filteredAssignments.reduce((sum, pp) => sum + pp.netAmount, 0) / filteredAssignments.length) : 0)}</p>
                <p className="text-xs text-teal-600 mt-1">per assignment</p>
              </div>
            </div>
          </div>

          {/* KPI Cards — colorful 5-status lifecycle (PACKAGE-LIFECYCLE-LOGIC) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Total Packages */}
            <button
              type="button"
              onClick={() => setFilterStatus('all')}
              className="text-left bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-xl border border-blue-200 shadow-sm p-5 flex items-center gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className="h-12 w-12 rounded-xl bg-blue-500 flex items-center justify-center shrink-0 shadow-sm">
                <Package className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-blue-700 font-medium">Total Packages</p>
                <p className="text-2xl font-bold text-blue-900">{totalPackages}</p>
              </div>
            </button>

            {/* Active Packages */}
            <button
              type="button"
              onClick={() => setFilterStatus('active')}
              className={`text-left rounded-xl border shadow-sm p-5 flex items-center gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all ${filterStatus === 'active' ? 'bg-green-50 border-green-400 ring-2 ring-green-200' : 'bg-white border-green-200'}`}
            >
              <div className="h-12 w-12 rounded-xl bg-green-500 flex items-center justify-center shrink-0 shadow-sm">
                <CheckCircle2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-green-700 font-medium">Active</p>
                <p className="text-2xl font-bold text-green-900">{activePackages}</p>
              </div>
            </button>

            {/* Expiring Soon */}
            <button
              type="button"
              onClick={() => setFilterStatus('expiring')}
              className={`text-left rounded-xl border shadow-sm p-5 flex items-center gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all ${filterStatus === 'expiring' ? 'bg-orange-50 border-orange-400 ring-2 ring-orange-200' : 'bg-white border-orange-200'}`}
            >
              <div className="h-12 w-12 rounded-xl bg-orange-500 flex items-center justify-center shrink-0 shadow-sm">
                <AlertTriangle className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-orange-700 font-medium">Expiring Soon</p>
                <p className="text-2xl font-bold text-orange-900">{expiringSoon}</p>
              </div>
            </button>

            {/* Pending Payment */}
            <button
              type="button"
              onClick={() => setFilterStatus('pending_payment')}
              className={`text-left rounded-xl border shadow-sm p-5 flex items-center gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all ${filterStatus === 'pending_payment' ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-200' : 'bg-white border-rose-200'}`}
            >
              <div className="h-12 w-12 rounded-xl bg-rose-500 flex items-center justify-center shrink-0 shadow-sm">
                <IndianRupee className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-rose-700 font-medium">Pending Payment</p>
                <p className="text-2xl font-bold text-rose-900">{pendingPaymentPackages}</p>
              </div>
            </button>

            {/* Expired */}
            <button
              type="button"
              onClick={() => setFilterStatus('expired')}
              className={`text-left rounded-xl border shadow-sm p-5 flex items-center gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all ${filterStatus === 'expired' ? 'bg-red-50 border-red-400 ring-2 ring-red-200' : 'bg-white border-red-200'}`}
            >
              <div className="h-12 w-12 rounded-xl bg-red-500 flex items-center justify-center shrink-0 shadow-sm">
                <XCircle className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-red-700 font-medium">Expired</p>
                <p className="text-2xl font-bold text-red-900">{expiredPackages}</p>
              </div>
            </button>
          </div>

          {/* Filter Row — Enhanced */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Patient filter */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">👤 Select Patient</label>
                <div className="relative">
                  <select
                    value={filterPatient}
                    onChange={(e) => setFilterPatient(e.target.value)}
                    title="Filter packages by patient"
                    className="w-full appearance-none border-2 border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 bg-white hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8 transition-colors"
                  >
                    <option value="all">All Patients</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>{p.childName}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
              </div>

              {/* Therapy filter */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">🎯 Therapy Type</label>
                <div className="relative">
                  <select
                    value={filterTherapy}
                    onChange={(e) => setFilterTherapy(e.target.value)}
                    title="Filter packages by therapy type"
                    className="w-full appearance-none border-2 border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 bg-white hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8 transition-colors"
                  >
                    <option value="all">All Therapy</option>
                    {therapyTypeOptions.map((t) => (
                      <option key={t} value={t}>{getTherapyStyle(t).icon} {t}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
              </div>

              {/* Status filter */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">📊 Package Status</label>
                <div className="relative">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    title="Filter packages by status"
                    className="w-full appearance-none border-2 border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 bg-white hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8 transition-colors"
                  >
                    <option value="all">All Status</option>
                    <option value="active">✓ Active</option>
                    <option value="expiring">⚠️ Expiring Soon</option>
                    <option value="pending_payment">💰 Pending Payment</option>
                    <option value="expired">✗ Expired</option>
                    <option value="completed">✓✓ Completed</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
              </div>

              {/* Filter + Reset buttons */}
              <div className="flex items-end gap-2">
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 px-4 flex-1"
                  onClick={() => fetchPackages()}
                >
                  <Filter className="h-3.5 w-3.5" />
                  Filter
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 px-4 flex-1 text-gray-600 border-gray-300 hover:bg-gray-50"
                  onClick={() => {
                    setFilterPatient('all')
                    setFilterTherapy('all')
                    setFilterStatus('all')
                    fetchPackages()
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reset
                </Button>
              </div>
            </div>

            {/* Active Filters Indicator */}
            {(filterPatient !== 'all' || filterTherapy !== 'all' || filterStatus !== 'all') && (
              <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-gray-600">🏷️ Active Filters:</span>
                <div className="flex flex-wrap gap-2">
                  {filterPatient !== 'all' && (
                    <div className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-medium">
                      👤 {patients.find(p => p.id === filterPatient)?.childName}
                      <button onClick={() => setFilterPatient('all')} className="ml-1 text-red-600 hover:text-red-700">×</button>
                    </div>
                  )}
                  {filterTherapy !== 'all' && (
                    <div className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium">
                      🎯 {filterTherapy}
                      <button onClick={() => setFilterTherapy('all')} className="ml-1 text-red-600 hover:text-red-700">×</button>
                    </div>
                  )}
                  {filterStatus !== 'all' && (
                    <div className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs font-medium">
                      📊 {filterStatus.replace('_', ' ')}
                      <button onClick={() => setFilterStatus('all')} className="ml-1 text-red-600 hover:text-red-700">×</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Package Table — assignments only (filtered) */}
          {filteredAssignments.length > 0 ? (
            <>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                <table className="min-w-[1000px] w-full text-sm border-separate border-spacing-0 table-fixed">
                  <colgroup>
                    <col style={{ width: '180px' }} />
                    <col style={{ width: '140px' }} />
                    <col style={{ width: '320px' }} />
                    <col style={{ width: '120px' }} />
                    <col style={{ width: '140px' }} />
                    <col style={{ width: '110px' }} />
                    <col style={{ width: '120px' }} />
                    <col style={{ width: '180px' }} />
                    <col style={{ width: '140px' }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b-2 border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                      <th className="align-middle text-left px-4 py-4 font-bold text-gray-700 uppercase text-xs tracking-wider">👤 Patient</th>
                      <th className="align-middle text-left px-4 py-4 font-bold text-gray-700 uppercase text-xs tracking-wider">🎯 Therapy</th>
                      <th className="align-middle text-left px-4 py-4 font-bold text-gray-700 uppercase text-xs tracking-wider">📦 Package</th>
                      <th className="align-middle text-left px-4 py-4 font-bold text-gray-700 uppercase text-xs tracking-wider">📈 Sessions</th>
                      <th className="align-middle text-left px-4 py-4 font-bold text-gray-700 uppercase text-xs tracking-wider">📅 Validity</th>
                      <th className="align-middle text-right px-4 py-4 font-bold text-gray-700 uppercase text-xs tracking-wider">💰 Amount</th>
                      <th className="align-middle text-right px-4 py-4 font-bold text-gray-700 uppercase text-xs tracking-wider">🏷️ Discount</th>
                      <th className="align-middle text-left px-4 py-4 font-bold text-gray-700 uppercase text-xs tracking-wider">📊 Status</th>
                      <th className="align-middle text-left px-4 py-4 font-bold text-gray-700 uppercase text-xs tracking-wider">⚙️ Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                  {paginatedAssignments.map((pp) => {
                    const ts = getTherapyStyle((pp.therapyType ?? pp.package?.therapyType) || '')
                    const remaining = pp.sessionsPurchased - pp.sessionsCompleted - pp.sessionsExpired
                    const derivedStatus = getAssignmentStatus(pp)
                    const statusLabel = derivedStatus === 'expiring' ? 'Expiring Soon'
                      : derivedStatus === 'active' ? 'Active'
                      : derivedStatus === 'pending_payment' ? 'Pending Payment'
                      : derivedStatus === 'completed' ? 'Completed' : 'Expired'
                    const payBadge = getPaymentBadge(pp)
                    return (
                      <tr key={pp.id} className="hover:bg-blue-50 hover:shadow-sm transition-all border-l-4 border-transparent hover:border-blue-500 hover:border-l-4">
                        <td className="w-[180px] min-w-[180px] max-w-[180px] px-4 py-3 align-middle overflow-hidden">
                          <div className="flex items-center gap-3 min-w-0">
                            <PatientAvatar name={pp.patient?.childName || 'Unknown'} color={`hsl(${(pp.patient?.childName || '').charCodeAt(0) * 7 % 360}, 60%, 45%)`} />
                            <div className="min-w-0 max-w-full overflow-hidden">
                              <p className="font-semibold text-blue-600 hover:underline cursor-pointer leading-tight truncate">
                                {pp.patient?.childName || 'Unknown'}
                              </p>
                              <p className="text-xs text-gray-500 truncate">{pp.patient?.patientId}</p>
                              <p className="text-xs text-gray-400 truncate">{pp.patient?.gender || ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="w-[140px] min-w-[140px] max-w-[140px] px-4 py-3 align-middle overflow-hidden">
                          <div className="flex h-full items-center gap-2 min-w-0">
                            <div className={`h-8 w-8 rounded-full ${ts.bg} flex items-center justify-center text-base`}>
                              {ts.icon}
                            </div>
                            <span className={`text-xs font-semibold leading-none truncate max-w-full ${ts.text}`}>{(pp.therapyType ?? pp.package?.therapyType) || '—'}</span>
                          </div>
                        </td>
                        <td className="w-[320px] min-w-[320px] max-w-[320px] px-4 py-3 align-middle overflow-hidden">
                          <div className="space-y-1 max-w-full min-w-0">
                            <p className="font-semibold text-gray-900 truncate">{(pp.name ?? pp.package?.name) || 'Package'}</p>
                            <p className="text-xs text-gray-500 truncate">{formatCurrency(pp.netAmount)}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 min-w-[120px] align-middle">
                          <div className="flex h-full flex-col justify-center items-start gap-1">
                            <p className="text-sm font-semibold text-gray-900">{pp.sessionsCompleted} / {pp.sessionsPurchased}</p>
                            <span className={`inline-flex items-center justify-center rounded-full px-2 py-1 text-[10px] font-semibold ${remaining === 0 ? 'bg-gray-100 text-gray-500' : remaining <= 2 ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700'}`}>
                              {remaining} left
                            </span>
                            {!!pp.sessionsUnscheduled && pp.sessionsUnscheduled > 0 && (
                              <span
                                className="inline-flex items-center justify-center rounded-full px-2 py-1 text-[10px] font-semibold bg-red-100 text-red-700"
                                title="Purchased sessions that have never been placed on the calendar"
                              >
                                ⚠ {pp.sessionsUnscheduled} not scheduled
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 min-w-[140px] align-middle">
                          <div className="flex h-full flex-col justify-center gap-1 leading-tight">
                            <p className="text-sm font-semibold text-gray-900">
                              {pp.startDate ? format(new Date(pp.startDate), 'dd MMM yyyy') : 'N/A'}
                            </p>
                            <p className="text-xs text-gray-500">
                              to {pp.endDate ? format(new Date(pp.endDate), 'dd MMM yyyy') : 'N/A'}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 min-w-[120px] align-middle text-right">
                          <p className="text-sm font-semibold text-gray-900">{formatCurrency(pp.netAmount)}</p>
                        </td>
                        <td className="px-4 py-3 min-w-[110px] align-middle text-right">
                          <p className="text-sm text-gray-500">{pp.discountAmount > 0 ? formatCurrency(pp.discountAmount) : '—'}</p>
                        </td>
                        <td className="px-4 py-3 min-w-[180px] align-middle">
                          <div className="flex h-full flex-col justify-center gap-2">
                            <p className="text-sm font-semibold text-gray-900 truncate">{statusLabel}</p>
                            <span className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${payBadge.className}`}>
                              {payBadge.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 relative z-10 min-w-[140px] align-middle">
                          <div className="flex h-full items-center justify-center gap-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                const phone = (pp.patient?.mobile || '').replace(/\D/g, '')
                                if (!phone) { toast.error('No mobile number found for this patient'); return }
                                const pkgName = pp.name ?? pp.package?.name ?? 'Package'
                                const therapyType = pp.therapyType ?? pp.package?.therapyType ?? 'N/A'
                                const sessions = `${pp.sessionsCompleted}/${pp.sessionsPurchased}`
                                const remaining = pp.sessionsPurchased - pp.sessionsCompleted - (pp.sessionsExpired || 0)
                                const amount = pp.netAmount || 0
                                const startDate = pp.startDate ? new Date(pp.startDate).toLocaleDateString('en-IN') : 'N/A'
                                const endDate = pp.endDate ? new Date(pp.endDate).toLocaleDateString('en-IN') : 'N/A'
                                const message = `*Package Details*\n\nPatient: ${pp.patient?.childName || 'N/A'} (${pp.patient?.patientId || ''})\nPackage: ${pkgName}\nTherapy Type: ${therapyType}\nSessions: ${sessions} (${remaining} remaining)\nAmount: ₹${amount.toLocaleString('en-IN')}\nValidity: ${startDate} to ${endDate}\nStatus: ${pp.status || 'active'}`
                                const waUrl = `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`
                                window.open(waUrl, '_blank')
                              }}
                              className="h-8 w-8 rounded-lg flex items-center justify-center cursor-pointer pointer-events-auto hover:bg-green-50 text-green-600 transition-colors border border-transparent hover:border-green-200"
                              title="Send WhatsApp"
                              aria-label="Send WhatsApp"
                            >
                              <MessageCircle className="h-4 w-4 pointer-events-none" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                openEditAssignment(pp)
                              }}
                              className="h-8 w-8 rounded-lg flex items-center justify-center cursor-pointer pointer-events-auto hover:bg-blue-50 text-blue-600 transition-colors border border-transparent hover:border-blue-200"
                              title="Edit Package"
                              aria-label="Edit Package"
                            >
                              <Pencil className="h-4 w-4 pointer-events-none" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteTarget(pp)
                                setDeleteDialogOpen(true)
                              }}
                              className="h-8 w-8 rounded-lg flex items-center justify-center cursor-pointer pointer-events-auto hover:bg-red-50 text-red-600 transition-colors border border-transparent hover:border-red-200"
                              title="Delete Package"
                              aria-label="Delete Package"
                            >
                              <Trash2 className="h-4 w-4 pointer-events-none" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="px-4 py-4 border-t border-gray-100 bg-gray-50 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <p className="text-xs text-gray-500">
                      Showing {Math.min((currentPage - 1) * pageSize + 1, filteredAssignments.length)} - {Math.min(currentPage * pageSize, filteredAssignments.length)} of {filteredAssignments.length} package assignments
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>Rows per page:</span>
                      <Select value={`${pageSize}`} onValueChange={(value) => { setPageSize(Number(value)); setCurrentPage(1) }}>
                        <SelectTrigger className="h-8 min-w-[84px] rounded-md border border-gray-200 bg-white px-2 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Pagination aria-label="Package assignments pagination">
                    <PaginationContent>
                      <PaginationPrevious
                        aria-disabled={currentPage === 1}
                        className={currentPage === 1 ? 'pointer-events-none opacity-40' : undefined}
                        onClick={(event) => {
                          event.preventDefault()
                          setCurrentPage((page) => Math.max(1, page - 1))
                        }}
                      />
                      {Array.from({ length: totalPages }).map((_, index) => {
                        const page = index + 1
                        return (
                          <PaginationItem key={page}>
                            <PaginationLink
                              href="#"
                              isActive={page === currentPage}
                              onClick={(event) => {
                                event.preventDefault()
                                setCurrentPage(page)
                              }}
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        )
                      })}
                      <PaginationNext
                        aria-disabled={currentPage === totalPages}
                        className={currentPage === totalPages ? 'pointer-events-none opacity-40' : undefined}
                        onClick={(event) => {
                          event.preventDefault()
                          setCurrentPage((page) => Math.min(totalPages, page + 1))
                        }}
                      />
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          ) : (
            /* Dedicated empty-state OUTSIDE the table */
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-16 text-center">
              <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-500">
                {assignments.length === 0
                  ? 'No package assignments found. Assign a package to a patient to get started.'
                  : 'No records match the selected filters. Try adjusting or resetting filters.'}
              </p>
              {(filterPatient !== 'all' || filterTherapy !== 'all' || filterStatus !== 'all' || debouncedQuery) && (
                <button
                  onClick={() => { setFilterPatient('all'); setFilterTherapy('all'); setFilterStatus('all'); clear() }}
                  className="mt-3 text-xs text-blue-600 hover:underline"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}

          {/* Bottom Cards: Package Expiry Reminder + Automated Reminders */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Package Expiry Reminder */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                <Calendar className="h-6 w-6 text-orange-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">Package Expiry Reminder</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {expiringCount} package{expiringCount === 1 ? '' : 's'} will expire in the next 15 days.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => { setFilterStatus('expiring'); if (typeof window !== 'undefined') window.scrollTo({ top: 600, behavior: 'smooth' }) }}
                className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3"
              >
                View Expiring Packages
              </Button>
            </div>

            {/* Automated Reminders */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                <MessageCircle className="h-6 w-6 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">Automated Reminders</p>
                {/* TODO: Backend integration required */}
                <p className="text-xs text-gray-500 mt-0.5">
                  WhatsApp reminders are sent before 1 day of appointment and package expiry.
                </p>
              </div>
              <Button size="sm" className="shrink-0 bg-green-600 hover:bg-green-700 text-white text-xs px-3">
                Manage Templates
              </Button>
            </div>
          </div>
        </div>

        {/* ── Right Sidebar ───────────────────────────────────────────────────── */}
        <aside className="w-72 shrink-0 border-l border-gray-200 bg-white overflow-y-auto hidden lg:flex flex-col">

          {/* Package Details Card */}
          <div className="bg-blue-600 rounded-none p-5 flex flex-col gap-3">
            <h3 className="text-base font-bold text-white">Package Details</h3>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-blue-100 text-xs leading-relaxed">
                  Select a package to view complete details, session history and payments.
                </p>
              </div>
              <div className="text-4xl shrink-0">🎁</div>
            </div>
          </div>

          <div className="p-4 space-y-5">

            {/* Quick Summary */}
            <div>
              <h4 className="text-sm font-semibold text-gray-800 mb-3">Quick Summary</h4>
              <div className="space-y-2">
                {[
                  { label: 'Total Packages', value: String(totalPackages), color: 'text-gray-900' },
                  { label: 'Active Assignments', value: String(activePackages), color: 'text-green-600' },
                  { label: 'Expiring Soon', value: String(expiringSoon), color: 'text-orange-500' },
                  { label: 'Expired', value: String(expiredPackages), color: 'text-red-500' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between py-1">
                    <span className="text-xs text-gray-500">{label}</span>
                    <span className={`text-sm font-bold ${color}`}>{value}</span>
                  </div>
                ))}
                {/* Progress bar — active / total assignments (capped at 100%) */}
                <div className="w-full h-2 rounded-full bg-gray-100 mt-1">
                  <div className="h-2 rounded-full bg-green-500" style={{ width: totalPackages ? `${Math.min(100, (activePackages / totalPackages) * 100)}%` : '0%' }} />
                </div>
              </div>
            </div>

            <hr className="border-gray-100" />

            {/* Popular Packages */}
            <div>
              <h4 className="text-sm font-semibold text-gray-800 mb-3">Popular Packages</h4>
              <div className="space-y-3">
                {packages.slice(0, 6).map((pkg) => {
                  const ts = getTherapyStyle(pkg.therapyType)
                  return (
                    <div key={pkg.id} className="flex items-center gap-3 group">
                      <div className={`h-8 w-8 rounded-full ${ts.bg} flex items-center justify-center text-base shrink-0`}>
                        {ts.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <p className={`text-xs font-semibold ${ts.text} truncate`}>{pkg.name}</p>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold ${pkg.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {pkg.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400">{pkg.sessionCount} sessions - {formatCurrency(pkg.amount)}</p>
                      </div>
                      {/* 3-dot menu for CRUD actions */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center shrink-0 transition-colors" title="Package actions">
                            <MoreVertical className="h-4 w-4 text-gray-500" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem className="gap-2 text-sm cursor-pointer" onClick={() => openEdit(pkg)}>
                            <Pencil className="h-3.5 w-3.5" /> Edit Package
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 text-sm cursor-pointer" onClick={() => handleDuplicate(pkg)} disabled={saving}>
                            <Plus className="h-3.5 w-3.5" /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 text-sm cursor-pointer text-red-600" onClick={() => openDeleteTemplate(pkg)}>
                            <Trash2 className="h-3.5 w-3.5" /> Delete Package
                          </DropdownMenuItem>
                          {/* Toggle Active/Inactive */}
                          {pkg.isActive ? (
                            <DropdownMenuItem className="gap-2 text-sm cursor-pointer text-orange-600" onClick={() => { setStatusTarget(pkg); setDeactivateOpen(true) }}>
                              Deactivate Package
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem className="gap-2 text-sm cursor-pointer text-green-600" onClick={() => { setStatusTarget(pkg); setActivateOpen(true) }}>
                              Activate Package
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )
                })}
                {packages.length === 0 && (
                  <p className="text-xs text-gray-400">No packages created yet.</p>
                )}
              </div>
            </div>

          </div>
        </aside>
      </div>

      {/* ── Dialogs (all preserved from original) ────────────────────────────── */}

      {/* Create/Edit Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        setCreateDialogOpen(open)
        if (!open) setEditingAssignmentId(null)
      }}>
        <DialogContent className="w-[95vw] sm:w-full max-w-3xl max-h-[90vh] sm:max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-4 sm:px-6 pt-6 pb-2">
            <DialogTitle>{editingPackage || editingAssignmentId ? 'Edit Package' : 'Create Package'}</DialogTitle>
            <DialogDescription>
              {editingAssignmentId
                ? 'Update this package assignment. Only this assignment is affected.'
                : editingPackage
                ? 'Update package template details.'
                : 'Create a new therapy package template.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-4 sm:px-6 py-4 overflow-y-auto flex-1 min-h-0">
            <div className="space-y-2">
              <Label>Package Name *</Label>
              <Input
                placeholder="e.g., Basic Speech Therapy Package"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            {/* Multiple Therapy Types toggle — new-package creation only */}
            {!editingPackage && !editingAssignmentId && (
              <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                <div>
                  <Label className="cursor-pointer">Multiple Therapy Types</Label>
                  <p className="text-xs text-muted-foreground">Bundle e.g. Speech x10, OT x5, ABA x8 into one package.</p>
                </div>
                <Switch checked={isBundle} onCheckedChange={setIsBundle} />
              </div>
            )}

            {isBundle && !editingPackage && !editingAssignmentId ? (
              <div className="space-y-3">
                <Label>Therapy Types *</Label>
                <div className="space-y-3">
                  {bundleTypes.map((bt, i) => {
                    const countError = bt.sessionCount <= 0 ? 'Session count must be greater than 0.' : null
                    const durationError = bt.sessionDuration <= 0 ? 'Session duration must be greater than 0.' : null
                    return (
                      <div key={i} className="rounded-lg border border-gray-200 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-gray-800">Therapy Type #{i + 1}</p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive gap-1.5 h-7 px-2"
                            disabled={bundleTypes.length <= 1}
                            onClick={() => setBundleTypes((prev) => prev.filter((_, idx) => idx !== i))}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remove Therapy
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1fr] gap-3">
                          <div className="space-y-1.5 min-w-0">
                            <Label className="text-xs">Therapy Type *</Label>
                            {therapyTypeOptions.includes(bt.therapyType) ? (
                              <Select
                                value={bt.therapyType}
                                onValueChange={(v) => setBundleTypes((prev) => prev.map((r, idx) => idx === i ? { ...r, therapyType: v === '__custom__' ? '' : v } : r))}
                              >
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {therapyTypeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                  <SelectItem value="__custom__" className="text-primary font-medium">+ Custom Therapy Type</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="space-y-1">
                                <Input
                                  autoFocus
                                  placeholder="Enter custom therapy type"
                                  value={bt.therapyType}
                                  onChange={(e) => setBundleTypes((prev) => prev.map((r, idx) => idx === i ? { ...r, therapyType: e.target.value } : r))}
                                />
                                <button
                                  type="button"
                                  className="text-xs text-primary hover:underline"
                                  onClick={() => setBundleTypes((prev) => prev.map((r, idx) => idx === i ? { ...r, therapyType: therapyTypeOptions[0] } : r))}
                                >
                                  ← Choose from list
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Session Count *</Label>
                            <Input
                              type="number"
                              placeholder="e.g. 10"
                              value={bt.sessionCount}
                              onChange={(e) => setBundleTypes((prev) => prev.map((r, idx) => idx === i ? { ...r, sessionCount: parseInt(e.target.value) || 0 } : r))}
                              className={countError ? 'border-destructive' : undefined}
                            />
                            {countError ? (
                              <p className="text-xs text-destructive">{countError}</p>
                            ) : (
                              <p className="text-xs text-muted-foreground">Number of sessions included for this therapy.</p>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Session Duration (Minutes) *</Label>
                            <Input
                              type="number"
                              placeholder="e.g. 30"
                              value={bt.sessionDuration}
                              onChange={(e) => setBundleTypes((prev) => prev.map((r, idx) => idx === i ? { ...r, sessionDuration: parseInt(e.target.value) || 0 } : r))}
                              className={durationError ? 'border-destructive' : undefined}
                            />
                            {durationError ? (
                              <p className="text-xs text-destructive">{durationError}</p>
                            ) : (
                              <p className="text-xs text-muted-foreground">Duration of each session in minutes.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setBundleTypes((prev) => [...prev, { therapyType: 'Speech Therapy', sessionCount: 5, sessionDuration: 30 }])}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Another Therapy Type
                </Button>

                {/* Package Summary — quick at-a-glance verification before saving */}
                <div className="rounded-lg bg-muted/40 border border-gray-200 p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-700">Package Summary</p>
                  <div className="space-y-1">
                    {bundleTypes.map((bt, i) => (
                      <div key={i} className="flex items-center justify-between text-xs text-gray-600">
                        <span>{bt.therapyType || '—'}</span>
                        <span>{bt.sessionCount} × {bt.sessionDuration} mins</span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-gray-200 text-center">
                    <div>
                      <p className="text-sm font-bold text-gray-800">{bundleTypes.length}</p>
                      <p className="text-[11px] text-muted-foreground">Therapy Types</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">{bundleTypes.reduce((s, bt) => s + (bt.sessionCount || 0), 0)}</p>
                      <p className="text-[11px] text-muted-foreground">Total Sessions</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">
                        {bundleTypes.length > 0 ? Math.round(bundleTypes.reduce((s, bt) => s + (bt.sessionDuration || 0), 0) / bundleTypes.length) : 0} mins
                      </p>
                      <p className="text-[11px] text-muted-foreground">Avg. Duration</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Therapy Type *</Label>
                  {therapyTypeOptions.includes(form.therapyType) ? (
                    <Select
                      value={form.therapyType}
                      onValueChange={(v) => setForm(prev => ({ ...prev, therapyType: v === '__custom__' ? '' : v }))}
                    >
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {therapyTypeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        <SelectItem value="__custom__" className="text-primary font-medium">+ Custom Therapy Type</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="space-y-1">
                      <Input
                        autoFocus
                        placeholder="Enter custom therapy type"
                        value={form.therapyType}
                        onChange={(e) => setForm(prev => ({ ...prev, therapyType: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => setForm(prev => ({ ...prev, therapyType: therapyTypeOptions[0] }))}
                      >
                        ← Choose from list
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Session Count</Label>
                    <Input type="number" value={form.sessionCount} onChange={(e) => setForm(prev => ({ ...prev, sessionCount: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Session Duration (min)</Label>
                    <Input type="number" value={form.sessionDuration} onChange={(e) => setForm(prev => ({ ...prev, sessionDuration: parseInt(e.target.value) || 0 }))} />
                  </div>
                </div>
              </>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount (₹)</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-2">
                <Label>Discount (%)</Label>
                <Input type="number" value={form.discount} onChange={(e) => setForm(prev => ({ ...prev, discount: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Validity (Days)</Label>
              <Input type="number" value={form.validityDays} onChange={(e) => setForm(prev => ({ ...prev, validityDays: parseInt(e.target.value) || 0 }))} />
            </div>
          </div>
          <DialogFooter className="px-4 sm:px-6 py-4 border-t">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : (editingPackage || editingAssignmentId) ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Package Dialog — Step-based layout */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
          {/* Sticky header with step indicator */}
          <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-gray-100">
            <DialogTitle>Assign Package</DialogTitle>
            <DialogDescription>Create a package assignment with optional session scheduling.</DialogDescription>
            {/* Step indicator */}
            <div className="flex items-center gap-2 mt-3">
              {[
                { num: 1, label: 'Patient' },
                { num: 2, label: 'Package' },
                { num: 3, label: 'Schedule' },
              ].map((s, i) => (
                <React.Fragment key={s.num}>
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    assignStep === s.num ? 'bg-blue-600 text-white' : assignStep > s.num ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {assignStep > s.num ? <Check className="h-3 w-3" /> : <span>{s.num}</span>}
                    {s.label}
                  </div>
                  {i < 2 && <div className={`h-px w-6 ${assignStep > s.num ? 'bg-green-400' : 'bg-gray-200'}`} />}
                </React.Fragment>
              ))}
            </div>
          </DialogHeader>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ─── STEP 1: Patient Selection ─── */}
          {assignStep === 1 && (
            <div className="space-y-4 max-w-lg mx-auto">
              <div className="text-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Select Patient</h3>
                <p className="text-sm text-gray-500">Choose the patient to assign a package to.</p>
              </div>
              <div className="space-y-2">
                <Label>Search Patient</Label>
                <Input
                  placeholder="Search by name, ID, mobile..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Select Patient *</Label>
                <Select
                  value={assignForm.patientId}
                  onValueChange={(v) => setAssignForm((prev) => ({ ...prev, patientId: v }))}
                >
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select a patient" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.patientId} - {p.childName} ({p.mobile})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {assignForm.patientId && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
                  <Check className="h-4 w-4 inline mr-1" />
                  Selected: {patients.find(p => p.id === assignForm.patientId)?.childName}
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 2: Package Selection (Image 1 reference card design) ─── */}
          {assignStep === 2 && (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Select Package</h3>
                <p className="text-sm text-gray-500">Choose a therapy package to assign.</p>
              </div>

              {packages.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-lg">
                  No packages available. Create one first.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[46vh] overflow-y-auto pr-1 pb-1">
                  {packages.map((pkg) => {
                    const accent = getPackageAccent(pkg)
                    const perSession = pricePerSession(pkg.amount, pkg.sessionCount)
                    const isSelected = assignForm.packageId === pkg.id
                    return (
                      <button
                        key={pkg.id}
                        type="button"
                        onClick={() => setAssignForm((prev) => ({ ...prev, packageId: pkg.id }))}
                        aria-pressed={isSelected}
                        className={`relative text-left overflow-hidden rounded-lg border bg-white shadow-sm transition-all duration-150 ${
                          isSelected
                            ? 'border-gray-900 ring-2 ring-gray-900 ring-offset-2 -translate-y-0.5 shadow-md'
                            : 'border-gray-200 hover:border-gray-400 hover:shadow-md hover:-translate-y-0.5'
                        }`}
                      >
                        {(pkg.therapyTypes?.length ?? 0) > 0 && (
                          <span className="absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-white/90 text-gray-700 shadow-sm">
                            Multiple Types
                          </span>
                        )}
                        {/* Colored header band — package name */}
                        <div className={`${accent.band} ${accent.bandText} px-3 py-2 text-center`}>
                          <p className="text-sm font-bold uppercase tracking-wide leading-tight truncate">
                            {pkg.name}
                          </p>
                        </div>

                        {/* Colored price band — total price */}
                        <div className={`${accent.band} ${accent.bandText} px-2 pb-3 pt-0 text-center border-t border-white/20`}>
                          <p className={`font-extrabold leading-none tracking-tight whitespace-nowrap ${pkg.amount >= 10000 ? 'text-2xl' : 'text-3xl'}`}>
                            {formatRupees(pkg.amount)}
                          </p>
                        </div>

                        {/* White body — per-session price, sessions, duration */}
                        <div className="px-3 py-3 space-y-1.5 text-center bg-white">
                          <p className="text-sm font-medium text-gray-800">
                            {formatRupees(perSession)} Per Session
                          </p>
                          <p className="text-sm font-medium text-gray-800">
                            {pkg.sessionCount} {pkg.sessionCount === 1 ? 'Session' : 'Sessions'}
                          </p>
                          <p className="text-xs text-gray-500">
                            Duration {pkg.sessionDuration} Min
                          </p>
                        </div>

                        {/* Selection checkmark badge (top-right, overlapping the header band) */}
                        {isSelected && (
                          <div className={`absolute top-1.5 right-1.5 h-6 w-6 rounded-full ${accent.check} flex items-center justify-center shadow ring-2 ring-white`}>
                            <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {selectedPackage && (
                <div className="grid grid-cols-1 gap-4 pt-2">
                  <div className="space-y-2">
                    <Label>Discount (₹)</Label>
                    <Input
                      type="number"
                      value={assignForm.discountAmount === 0 ? '' : assignForm.discountAmount}
                      onChange={(e) => setAssignForm((prev) => ({ ...prev, discountAmount: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }))}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 3: Session Scheduling ─── */}
          {assignStep === 3 && selectedPackage && (
            <div className="space-y-4">
              {/* Package Assign Date — controls ONLY package validity/start/expiry
                  (see handleAssign, sent as `startDate` to PATCH /api/packages).
                  Deliberately independent from the session dates below: changing
                  it does not shift or regenerate the schedule, and generating/
                  editing session dates does not touch it. */}
              <div className="rounded-lg border border-gray-200 bg-blue-50/40 p-3 space-y-2">
                <Label className="flex items-center gap-1.5">
                  Package Assign Date <span className="text-red-500">*</span>
                </Label>
                <DatePicker
                  value={assignForm.startDate}
                  onChange={(v) => setAssignForm((prev) => ({ ...prev, startDate: v }))}
                  placeholder="Pick the package assign date"
                />
                <p className="text-xs text-gray-500">
                  Used for this package&apos;s validity, start date, and expiry date only — it has no effect on the session dates scheduled below.
                </p>
              </div>

              <div className="text-center mb-2">
                <h3 className="text-lg font-semibold text-gray-900">Schedule Sessions</h3>
                <p className="text-sm text-gray-500">
                  {selectedPackage.name} - {sessions.length} sessions
                  {isBundlePackage ? ` across ${bundleBlocks.length} therapy types` : ''}. Leave blank to skip scheduling.
                </p>
              </div>

              {/* Auto-generate */}
              <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-blue-600" />
                    <Label htmlFor="auto-gen-switch" className="text-sm font-medium cursor-pointer">Auto-generate schedule</Label>
                  </div>
                  <Switch id="auto-gen-switch" checked={autoGenerate} onCheckedChange={setAutoGenerate} />
                </div>
                {autoGenerate && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground">Frequency</Label>
                        <Select value={frequency} onValueChange={(v) => setFrequency(v as ScheduleFrequency)}>
                          <SelectTrigger className="w-full h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="interval">Every N days</SelectItem>
                            <SelectItem value="custom_days">Custom Days</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {frequency === 'interval' && (
                        <div className="space-y-1.5">
                          <Label className="text-[11px] text-muted-foreground">Every N days</Label>
                          <Input
                            type="number"
                            min={1}
                            value={customDays}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => setCustomDays(Math.max(1, parseInt(e.target.value) || 1))}
                            className="h-9"
                          />
                        </div>
                      )}
                      {frequency !== 'custom_days' && (
                        <div className="space-y-1.5">
                          <Label className="text-[11px] text-muted-foreground">Preferred Time</Label>
                          <Input type="time" value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} className="h-9" />
                        </div>
                      )}
                    </div>

                    {frequency === 'custom_days' && (
                      <div className="space-y-2 rounded-md border border-gray-100 bg-white p-2.5">
                        <Label className="text-[11px] text-muted-foreground">Select Days</Label>
                        <div className="flex flex-wrap gap-2">
                          {WEEKDAYS.map((d) => {
                            const active = selectedWeekDays.includes(d.key)
                            return (
                              <button
                                key={d.key}
                                type="button"
                                onClick={() => {
                                  setSelectedWeekDays((prev) =>
                                    active ? prev.filter((k) => k !== d.key) : [...prev, d.key],
                                  )
                                  if (!active) {
                                    setWeekdayTimes((prev) => ({ [d.key]: '10:00', ...prev }))
                                  }
                                }}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                  active
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                                }`}
                              >
                                {d.label}
                              </button>
                            )
                          })}
                        </div>
                        {selectedWeekDays.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground pt-1">Select at least one weekday.</p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                            {WEEKDAYS.filter((d) => selectedWeekDays.includes(d.key)).map((d) => (
                              <div key={d.key} className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">{d.label} Time</Label>
                                <Input
                                  type="time"
                                  value={weekdayTimes[d.key] || '10:00'}
                                  onChange={(e) => setWeekdayTimes((prev) => ({ ...prev, [d.key]: e.target.value }))}
                                  className="h-9"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end gap-2">
                      <Button size="sm" type="button" variant="outline" onClick={autoAssignTherapists} className="gap-1.5">
                        <UserCog className="h-3.5 w-3.5" /> Auto-Assign Therapists
                      </Button>
                      <Button size="sm" type="button" onClick={generateSchedule} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
                        <CalendarClock className="h-3.5 w-3.5" /> Generate
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Session rows — grouped per therapy-type block for a bundle
                  package, or a single flat list for a plain package. */}
              {groupedSessions ? (
                <div className="space-y-5 max-h-[46vh] overflow-y-auto pr-1">
                  {groupedSessions.map(({ block, rows }) => {
                    const ts = getTherapyStyle(block.therapyType)
                    const opts = therapistsForType(block.therapyType)
                    return (
                      <div key={block.id} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={`h-6 w-6 rounded-full ${ts.bg} flex items-center justify-center text-xs shrink-0`}>{ts.icon}</span>
                          <p className="text-sm font-semibold text-gray-800">
                            {block.therapyType}
                            <span className="text-xs font-normal text-muted-foreground ml-1.5">({rows.length} session{rows.length === 1 ? '' : 's'})</span>
                          </p>
                        </div>
                        <div className="hidden sm:grid grid-cols-[80px_1.5fr_1fr_1.5fr] gap-2 text-[11px] font-medium text-muted-foreground px-1">
                          <span>Session #</span><span>Date</span><span>Time</span><span>Therapist</span>
                        </div>
                        <div className="space-y-2">
                          {rows.map((s) => (
                            <div key={s.index} className="grid grid-cols-1 sm:grid-cols-[80px_1.5fr_1fr_1.5fr] gap-2 items-center rounded-md border border-gray-100 bg-white p-2">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center justify-center h-6 min-w-[2rem] px-2 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">#{s.groupSessionNumber}</span>
                              </div>
                              <DatePicker value={s.date} onChange={(v) => updateSession(s.index, { date: v })} placeholder="Pick date" buttonSize="sm" />
                              <Input type="time" value={s.time} onChange={(e) => updateSession(s.index, { time: e.target.value })} className="h-9" />
                              <Select value={s.therapistName} onValueChange={(v) => updateSession(s.index, { therapistName: v })}>
                                <SelectTrigger className="h-9"><SelectValue placeholder="Therapist" /></SelectTrigger>
                                <SelectContent className="max-h-60">
                                  {opts.length > 0 ? (
                                    opts.map((t) => (<SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>))
                                  ) : (
                                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No therapists available for this therapy type.</div>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="hidden sm:grid grid-cols-[80px_1.5fr_1fr_1.5fr] gap-2 text-[11px] font-medium text-muted-foreground px-1">
                    <span>Session #</span><span>Date</span><span>Time</span><span>Therapist</span>
                  </div>
                  <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                    {sessions.map((s) => (
                      <div key={s.index} className="grid grid-cols-1 sm:grid-cols-[80px_1.5fr_1fr_1.5fr] gap-2 items-center rounded-md border border-gray-100 bg-white p-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center h-6 min-w-[2rem] px-2 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">#{s.index}</span>
                        </div>
                        <DatePicker value={s.date} onChange={(v) => updateSession(s.index, { date: v })} placeholder="Pick date" buttonSize="sm" />
                        <Input type="time" value={s.time} onChange={(e) => updateSession(s.index, { time: e.target.value })} className="h-9" />
                        <Select value={s.therapistName} onValueChange={(v) => updateSession(s.index, { therapistName: v })}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Therapist" /></SelectTrigger>
                          <SelectContent className="max-h-60">
                            {therapistsForSelectedPackage.length > 0 ? (
                              therapistsForSelectedPackage.map((t) => (<SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>))
                            ) : (
                              <div className="px-2 py-1.5 text-xs text-muted-foreground">No therapists available for this therapy type.</div>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3 but no package selected (shouldn't happen but safe fallback) */}
          {assignStep === 3 && !selectedPackage && (
            <div className="text-center py-8 text-sm text-gray-500">Please go back and select a package.</div>
          )}
          </div>

          {/* Sticky footer with step navigation */}
          <DialogFooter className="shrink-0 border-t border-gray-100 px-6 py-4 bg-white flex items-center justify-between">
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              {assignStep > 1 && (
                <Button variant="outline" onClick={() => setAssignStep(assignStep - 1)} disabled={saving}>
                  Back
                </Button>
              )}
              {assignStep < 3 && (
                <Button
                  onClick={() => setAssignStep(assignStep + 1)}
                  disabled={(assignStep === 1 && !assignForm.patientId) || (assignStep === 2 && !assignForm.packageId)}
                  className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Next
                </Button>
              )}
              {assignStep === 3 && (
                <Button
                  onClick={handleAssign}
                  disabled={saving || !assignForm.startDate}
                  className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                >
                  {saving ? (
                    <><RefreshCw className="h-4 w-4 animate-spin" /> Saving…</>
                  ) : (
                    <><UserPlus className="h-4 w-4" /> Assign</>
                  )}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Package</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.package?.name || 'this package'}&quot; for {deleteTarget?.patient?.childName || 'this patient'}? All appointments and sessions generated from this package will be cancelled and removed from the scheduler too. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Activate Package ActionDialog (Task A1) */}
      <ActionDialog
        open={activateOpen}
        onOpenChange={setActivateOpen}
        module="packages"
        recordId={statusTarget?.id || ''}
        actionType="activated"
        actionLabel="Activate Package"
        description={
          statusTarget
            ? `Activate the package template "${statusTarget.name}" so it can be assigned to patients. A reason is required.`
            : 'Activate this package template. A reason is required.'
        }
        variant="success"
        onConfirm={confirmActivate}
      />

      {/* Deactivate Package ActionDialog (Task A1) */}
      <ActionDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        module="packages"
        recordId={statusTarget?.id || ''}
        actionType="deactivated"
        actionLabel="Deactivate Package"
        description={
          statusTarget
            ? `Deactivate the package template "${statusTarget.name}". It will no longer be available for new assignments. A reason is required.`
            : 'Deactivate this package template. A reason is required.'
        }
        variant="destructive"
        onConfirm={confirmDeactivate}
      />

      {/* Delete Package Template Confirmation (Task 64) */}
      <AlertDialog open={deleteTemplateOpen} onOpenChange={setDeleteTemplateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Package Template</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTemplateAssignments > 0
                ? `This package is assigned to ${deleteTemplateAssignments} patient(s). You cannot delete it while it has active assignments. Please deactivate the package instead, or remove all assignments first.`
                : `Are you sure you want to delete "${deleteTemplateTarget?.name}"? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            {deleteTemplateAssignments > 0 ? (
              <AlertDialogAction
                onClick={() => {
                  setDeleteTemplateOpen(false)
                  if (deleteTemplateTarget) {
                    setStatusTarget(deleteTemplateTarget)
                    setDeactivateOpen(true)
                  }
                }}
                className="bg-orange-600 hover:bg-orange-700"
              >
                Deactivate Instead
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                onClick={handleDeleteTemplate}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleting ? 'Deleting…' : 'Delete Package'}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}