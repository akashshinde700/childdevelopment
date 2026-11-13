'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { format, addDays, subDays, startOfWeek, endOfWeek } from 'date-fns'
import {
  IndianRupee,
  Plus,
  CheckCircle2,
  XCircle,
  Eye,
  Brain,
  Filter,
  User,
  UserX,
  Clock,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Calendar,
  MessageCircle,
  Bell,
  Search,
  Users,
  Copy,
  List,
  LayoutGrid,
  FileText,
  Menu,
  Coffee,
  Utensils,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { CalendarScheduler } from './CalendarScheduler'
import { SESSION_SLOTS, calculateUtilization } from '@/lib/session-slots'
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
import { ActionDialog } from '@/components/ui/action-dialog'
import { useToast } from '@/hooks/use-toast'
import { authFetch } from '@/lib/api-client'
import { takesTherapySessions } from '@/lib/therapists'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'
import { useAppStore, getRoleLabel, resolveDisplayDesignation } from '@/store/app-store'

// ─── Types ────────────────────────────────────────────────────────────────────

// Session/appointment "type" values that are too generic to be useful on
// their own (e.g. every walk-in session defaults to "therapy" regardless of
// the assigned therapist's actual specialization). When we see one of these,
// fall back to the assigned therapist's real role — the same label shown in
// User Management — instead of the generic word.
const GENERIC_THERAPY_TYPES = new Set(['therapy', 'consultation', ''])

function resolveTherapyLabel(
  rawType: string | null | undefined,
  therapistName: string | null | undefined,
  therapists: { name: string; role: string; secondaryRole?: string | null; therapyType?: string | null }[]
): string {
  const raw = (rawType || '').trim()
  if (raw && !GENERIC_THERAPY_TYPES.has(raw.toLowerCase())) {
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

interface Patient {
  id: string
  patientId: string
  childName: string
  mobile: string
}

interface TherapySession {
  id: string
  patientId: string
  patientPackageId: string | null
  therapistName: string | null
  therapyType: string | null
  appointmentId: string | null
  roomId: string | null
  date: string
  startTime: string | null
  endTime: string | null
  status: string
  subjective: string | null
  objective: string | null
  assessment: string | null
  plan: string | null
  notes: string | null
  createdAt: string
  patient?: { childName: string; patientId: string; mobile?: string }
}

interface PatientPackage {
  id: string
  packageId: string
  sessionsPurchased: number
  sessionsCompleted: number
  netAmount: number
  startDate: string
  endDate: string
  status: string
  package: { name: string; therapyType: string; sessionCount: number }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { dot: string; text: string; bg: string; border: string }> = {
  completed:   { dot: '#22c55e', text: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  upcoming:    { dot: '#f59e0b', text: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  planned:     { dot: '#f59e0b', text: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  in_progress: { dot: '#3b82f6', text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  cancelled:   { dot: '#ef4444', text: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  no_show:     { dot: '#ef4444', text: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  accepted:    { dot: '#3b82f6', text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  rescheduled: { dot: '#8b5cf6', text: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe' },
}

function StatusPill({ status }: { status: string }) {
  const c = STATUS_COLORS[status] || { dot: '#6b7280', text: '#374151', bg: '#f9fafb', border: '#e5e7eb' }
  const labels: Record<string, string> = {
    planned: 'Planned', in_progress: 'In Progress', completed: 'Completed',
    cancelled: 'Cancelled', no_show: 'No Show', accepted: 'Accepted', rescheduled: 'Rescheduled',
    upcoming: 'Upcoming',
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      {labels[status] || status}
    </span>
  )
}

// Avatar placeholder with initials
function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const colors = ['#0F7A87', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6']
  const color = colors[name.charCodeAt(0) % colors.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.35, flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

// Donut chart (SVG)
function DonutChart({ completed, upcoming, cancelled, available }: {
  completed: number; upcoming: number; cancelled: number; available: number
}) {
  const total = completed + upcoming + cancelled + available || 1
  const r = 52, cx = 68, cy = 68, stroke = 14
  const circumference = 2 * Math.PI * r
  const segments = [
    { value: completed, color: '#22c55e' },
    { value: upcoming, color: '#f59e0b' },
    { value: cancelled, color: '#ef4444' },
    { value: available, color: '#3b82f6' },
  ]
  let offset = 0
  return (
    <svg width={136} height={136} viewBox="0 0 136 136">
      {segments.map((seg, i) => {
        const pct = seg.value / total
        const dash = pct * circumference
        const gap = circumference - dash
        const rotate = (offset / total) * 360 - 90
        offset += seg.value
        return (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={0}
            transform={`rotate(${rotate}, ${cx}, ${cy})`}
            strokeLinecap="butt"
          />
        )
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={22} fontWeight={700} fill="#111827">{total}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fill="#6b7280">Total</text>
    </svg>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SessionsPage() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<TherapySession[]>([])
  const [loading, setLoading] = useState(true)
  const [patientFilter, setPatientFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [therapyFilter, setTherapyFilter] = useState<string>('all')
  const [therapistFilter, setTherapistFilter] = useState<string>('all')
  const [roomFilter, setRoomFilter] = useState<string>('all')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [patients, setPatients] = useState<Patient[]>([])
  const { query: patientSearch, debouncedQuery: debouncedPatientSearch, setQuery: setPatientSearch } = useDebouncedSearch('')
  const [therapists, setTherapists] = useState<{ id: string; name: string; role: string; secondaryRole?: string | null; therapyType?: string | null; designation?: string | null }[]>([])
  const [therapistSearch, setTherapistSearch] = useState('')
  const [therapistsLoading, setTherapistsLoading] = useState(true)
  const [patientPackages, setPatientPackages] = useState<PatientPackage[]>([])
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day')
  const [currentDate, setCurrentDate] = useState(new Date())
  const { searchQuery: globalSearchQuery, setSearchQuery: setGlobalSearchQuery, user, navigate } = useAppStore()
  const { query: headerSearch, debouncedQuery: debouncedHeaderSearch, setQuery: setHeaderSearch } = useDebouncedSearch(globalSearchQuery)

  // Only Super Admin can create new sessions
  const canAddSession = user?.role === 'super_admin'

  // Clear the global search query once consumed as this page's initial search
  useEffect(() => {
    if (globalSearchQuery) setGlobalSearchQuery('')
  }, [])

  // Action dialog — converted to ActionDialog (Task A1)
  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [actionSession, setActionSession] = useState<TherapySession | null>(null)
  const [actionType, setActionType] = useState<'complete' | 'reschedule' | 'no_show' | 'cancel' | null>(null)
  const [showReschedulePanel, setShowReschedulePanel] = useState(false)
  const [quickActionOpen, setQuickActionOpen] = useState(false)
  const [quickActionType, setQuickActionType] = useState<'copy' | 'therapist' | 'room' | null>(null)
  const [copyForm, setCopyForm] = useState({ sourcePatientId: '', targetPatientId: '', startDate: format(new Date(), 'yyyy-MM-dd') })

  // New session dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [viewSession, setViewSession] = useState<TherapySession | null>(null)
  const [showViewReschedule, setShowViewReschedule] = useState(false)
  const [viewRescheduleDate, setViewRescheduleDate] = useState('')
  const [viewRescheduleTime, setViewRescheduleTime] = useState('10:00')
  const [confirmingViewDelete, setConfirmingViewDelete] = useState(false)
  const [viewDeleting, setViewDeleting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [viewRescheduling, setViewRescheduling] = useState(false)
  const EMPTY_FORM = {
    patientId: '', patientPackageId: '', therapistName: '', therapyType: '',
    date: format(new Date(), 'yyyy-MM-dd'), startTime: '09:00', endTime: '10:00',
    status: 'planned', subjective: '', objective: '', assessment: '', plan: '', notes: '',
    // Pay-per-session charge — only used when no package covers the session.
    fee: '', feePaid: false, feePaymentMode: 'cash',
  }
  const [form, setForm] = useState(EMPTY_FORM)

  // Opening the dialog always starts from a blank form: it used to keep the
  // previously typed patient selected, so the next session could silently be
  // booked against the wrong child.
  const openAddSession = (preset?: Partial<typeof EMPTY_FORM>) => {
    setForm({ ...EMPTY_FORM, date: format(new Date(), 'yyyy-MM-dd'), ...preset })
    setPatientSearch('')
    setPatientPackages([])
    setDialogOpen(true)
  }
  const { toast } = useToast()

  // ── Data Fetching ──────────────────────────────────────────────────────────

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try {
      // Always fetch ALL sessions (no status filter) so the KPI cards show
      // stable numbers regardless of the selected status filter. The status
      // filter is applied client-side to the table only. (SESSIONS-KPI-STABLE-NUMBERS)
      const params = new URLSearchParams({ limit: '100' })
      if (patientFilter && patientFilter !== 'all') params.set('patientId', patientFilter)
      if (debouncedHeaderSearch) params.set('search', debouncedHeaderSearch)
      const res = await authFetch(`/api/sessions?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setSessions(json.sessions || [])
      }
    } catch (err) {
      const isNetwork = err instanceof TypeError && err.message.toLowerCase().includes('failed to fetch')
      if (isNetwork) {
        console.warn('Sessions: network unavailable (dev server may be restarting).')
      } else {
        console.error('Failed to fetch sessions:', err)
      }
    }
    finally { setLoading(false) }
  }, [patientFilter, debouncedHeaderSearch])

  const fetchPatients = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '200', search: debouncedPatientSearch })
      const res = await authFetch(`/api/patients?${params.toString()}`)
      if (res.ok) { const json = await res.json(); setPatients(json.patients || []) }
    } catch { /* silent */ }
  }, [debouncedPatientSearch])

  const fetchTherapists = useCallback(async () => {
    setTherapistsLoading(true)
    try {
      const res = await authFetch('/api/users')
      if (res.ok) {
        const json = await res.json()
        const therapistRoles = new Set(['therapist_speech', 'therapist_ot', 'therapist_behavioral', 'therapist_remedial'])
        const loaded = Array.isArray(json) ? json.filter(u => u?.name && takesTherapySessions(u, [...therapistRoles]) && u.isActive !== false) : []
        setTherapists(loaded)
      }
    } catch { /* silent */ }
    finally { setTherapistsLoading(false) }
  }, [])

  // Fetch patient packages when a patient is selected in the form
  const fetchPatientPackages = useCallback(async (pid: string) => {
    if (!pid) { setPatientPackages([]); return }
    try {
      const res = await authFetch(`/api/packages?type=assignments&patientId=${pid}&limit=50`)
      if (res.ok) {
        const json = await res.json()
        const active = (json.assignments || []).filter((pp: PatientPackage) => pp.status === 'active')
        setPatientPackages(active)
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchSessions() }, [fetchSessions])
  useEffect(() => { fetchPatients() }, [fetchPatients])
  useEffect(() => { fetchTherapists() }, [fetchTherapists])
  useEffect(() => { if (form.patientId) fetchPatientPackages(form.patientId) }, [form.patientId, fetchPatientPackages])

  // ── Computed stats ─────────────────────────────────────────────────────────
  // All stats are computed from the SAME base (all loaded sessions) so the
  // counts and percentages are consistent: Total = Completed + Upcoming +
  // Cancelled + Other.

  const totalCount = sessions.length
  const completedCount = sessions.filter(s => s.status === 'completed').length
  const upcomingCount = sessions.filter(s => s.status === 'planned' || s.status === 'upcoming' || s.status === 'accepted').length
  const cancelledCount = sessions.filter(s => s.status === 'cancelled' || s.status === 'no_show').length
  const rescheduledCount = sessions.filter(s => s.status === 'rescheduled').length
  const totalTherapists = therapists.length

  // Room options are derived from whatever roomId values actually appear on
  // fetched sessions (roomId is a free-text field on Appointment, not a
  // master Room table) — mirrors how the therapist filter is populated.
  const roomOptions = Array.from(new Set(sessions.map(s => s.roomId).filter((r): r is string => !!r))).sort()

  // Table display list — apply all filters client-side so the KPI cards
  // (which use the full `sessions` array) stay stable when the filter changes.
  const displaySessions = sessions.filter(s => {
    // Apply status filter
    if (statusFilter && statusFilter !== 'all' && s.status !== statusFilter) return false
    // Apply therapy type filter
    if (therapyFilter && therapyFilter !== 'all' && s.therapyType !== therapyFilter) return false
    // Apply therapist filter
    if (therapistFilter && therapistFilter !== 'all' && s.therapistName !== therapistFilter) return false
    // Apply room filter
    if (roomFilter && roomFilter !== 'all' && s.roomId !== roomFilter) return false
    // Apply patient filter
    if (patientFilter && patientFilter !== 'all' && s.patientId !== patientFilter) return false
    return true
  })

  // Sessions for selected date (day view) — apply all filters
  const dateStr = format(currentDate, 'yyyy-MM-dd')
  const daySessions = sessions.filter(s => {
    // Apply date filter
    if (format(new Date(s.date), 'yyyy-MM-dd') !== dateStr) return false
    // Apply therapy type filter
    if (therapyFilter && therapyFilter !== 'all' && s.therapyType !== therapyFilter) return false
    // Apply therapist filter
    if (therapistFilter && therapistFilter !== 'all' && s.therapistName !== therapistFilter) return false
    // Apply room filter
    if (roomFilter && roomFilter !== 'all' && s.roomId !== roomFilter) return false
    // Apply patient filter
    if (patientFilter && patientFilter !== 'all' && s.patientId !== patientFilter) return false
    // Apply status filter
    if (statusFilter && statusFilter !== 'all' && s.status !== statusFilter) return false
    return true
  })

  // Unique therapists in filtered day sessions
  const dayTherapists = Array.from(new Set(daySessions.map(s => s.therapistName).filter(Boolean))) as string[]

  // Time slots for grid
  const timeSlots = Array.from({ length: 10 }, (_, i) => {
    const h = 9 + i
    return `${h.toString().padStart(2, '0')}:00`
  })

  // Sessions grouped by therapist × time
  function getSessionAt(therapist: string, time: string) {
    return daySessions.find(s => s.therapistName === therapist && s.startTime?.startsWith(time.slice(0, 2)))
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!form.patientId) { toast({ title: 'Error', description: 'Please select a patient', variant: 'destructive' }); return }
    if (creating) return // double-click guard — a second POST would create a duplicate session
    setCreating(true)
    try {
      const res = await authFetch('/api/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          patientPackageId: form.patientPackageId || null,
          // A package session is already paid for through the package.
          fee: form.patientPackageId ? null : (parseFloat(form.fee) || null),
          feePaid: form.patientPackageId ? false : form.feePaid,
        }),
      })
      if (res.ok) {
        toast({ title: 'Session created successfully' })
        setDialogOpen(false)
        setForm({ ...EMPTY_FORM, date: format(new Date(), 'yyyy-MM-dd') })
        setPatientPackages([])
        fetchSessions()
      } else {
        const json = await res.json()
        toast({ title: 'Error', description: json.error || 'Failed to create session', variant: 'destructive' })
      }
    } catch { toast({ title: 'Error', description: 'Failed to create session', variant: 'destructive' }) }
    finally { setCreating(false) }
  }

  const updateStatus = async (id: string, status: string) => {
    const res = await authFetch('/api/sessions', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to update session')
    }
    await fetchSessions()
  }

  const openActionDialog = (session: TherapySession, type: 'complete' | 'reschedule' | 'no_show' | 'cancel') => {
    setActionSession(session)
    setActionType(type)
    setActionDialogOpen(true)
  }

  // Admin reschedule for a cancelled session viewed in the Session Details dialog —
  // actually moves it to a new date/time and brings it back to 'scheduled'.
  const handleViewReschedule = async () => {
    if (!viewSession || !viewRescheduleDate || !viewRescheduleTime) {
      toast({ title: 'Please pick a new date and time', variant: 'destructive' })
      return
    }
    if (viewRescheduling) return // double-click guard
    setViewRescheduling(true)
    const [h, m] = viewRescheduleTime.split(':').map(Number)
    const endMinutes = h * 60 + m + 45
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`
    try {
      const res = await authFetch('/api/sessions', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: viewSession.id, status: 'scheduled',
          date: `${viewRescheduleDate}T${viewRescheduleTime}:00`,
          startTime: viewRescheduleTime, endTime,
        }),
      })
      if (res.ok) {
        toast({ title: 'Session rescheduled' })
        setShowViewReschedule(false)
        setViewRescheduleDate('')
        setViewRescheduleTime('10:00')
        setViewDialogOpen(false)
        await fetchSessions()
      } else {
        const err = await res.json().catch(() => ({}))
        toast({ title: 'Error', description: err.error || 'Failed to reschedule session', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' })
    } finally {
      setViewRescheduling(false)
    }
  }

  const handleViewDelete = async () => {
    if (!viewSession) return
    setViewDeleting(true)
    try {
      const res = await authFetch(`/api/sessions?id=${viewSession.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast({ title: 'Cancelled session deleted' })
        setConfirmingViewDelete(false)
        setViewDialogOpen(false)
        await fetchSessions()
      } else {
        const err = await res.json().catch(() => ({}))
        toast({ title: 'Error', description: err.error || 'Failed to delete session', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' })
    } finally {
      setViewDeleting(false)
    }
  }

  // ActionDialog onConfirm — performs the actual status change. ActionDialog
  // handles success/error toasts + dialog close.
  const submitAction = async () => {
    if (!actionSession || !actionType) return
    const map: Record<string, string> = {
      complete: 'completed',
      reschedule: 'rescheduled',
      no_show: 'no_show',
      cancel: 'cancelled',
    }
    const newStatus = map[actionType]
    try {
      await updateStatus(actionSession.id, newStatus)
    } finally {
      setActionSession(null)
      setActionType(null)
    }
  }

  const getCleanPhone = (phone?: string) => (phone || '').replace(/\D/g, '')

  const buildSessionReminderMessage = (session: TherapySession) => {
    const patientName = session.patient?.childName || session.patientId || 'Patient'
    const sessionDate = session.date ? format(new Date(session.date), 'dd MMM yyyy') : 'N/A'
    const sessionTime = `${session.startTime || 'N/A'} - ${session.endTime || 'N/A'}`
    const therapistName = session.therapistName || 'your therapist'

    return `Hello,

This is a reminder for ${patientName}'s therapy session scheduled on ${sessionDate} at ${sessionTime} with ${therapistName}.

Please arrive on time or contact us if you need to reschedule.

Thank you.`
  }

  const openWhatsApp = (phone: string, text: string) => {
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  }

  const handleWhatsAppBulkReminder = () => {
    const text = 'Hello,\n\nPlease review the upcoming therapy session schedule and notify us if any changes are needed.\n\nThank you.'
    openWhatsApp('', text)
    toast({ title: 'Opening WhatsApp', description: 'Use the prefilled message to send bulk reminders.' })
  }

  const handleWhatsAppNotifications = () => {
    const text = 'Hello,\n\nPlease check the latest therapy session notifications and confirm your availability.\n\nThank you.'
    openWhatsApp('', text)
    toast({ title: 'Opening WhatsApp', description: 'A WhatsApp message is ready for you to send.' })
  }

  const handleSendWhatsAppReminder = () => {
    const nextSession = displaySessions.find(s => ['planned', 'upcoming', 'accepted'].includes(s.status) && getCleanPhone(s.patient?.mobile))
    if (!nextSession) {
      toast({ title: 'No eligible session found', description: 'No upcoming session with a valid mobile number is available.', variant: 'destructive' })
      return
    }

    const phone = getCleanPhone(nextSession.patient?.mobile)
    if (!phone) {
      toast({ title: 'No mobile number found', description: 'This session does not have a valid patient phone number.', variant: 'destructive' })
      return
    }

    openWhatsApp(phone, buildSessionReminderMessage(nextSession))
    toast({ title: 'Opening WhatsApp', description: 'A reminder message is ready to send.' })
  }

  // ActionDialog props derived from current actionType
  const actionDialogProps = (() => {
    switch (actionType) {
      case 'complete':
        return { actionLabel: 'Complete Session', variant: 'success' as const, actionLogType: 'completed', description: 'Mark this therapy session as completed. A reason or note is required.' }
      case 'reschedule':
        return { actionLabel: 'Reschedule Session', variant: 'warning' as const, actionLogType: 'rescheduled', description: 'Mark this session for rescheduling. A reason is required.' }
      case 'no_show':
        return { actionLabel: 'Mark as No Show', variant: 'warning' as const, actionLogType: 'no_show', description: 'Mark this session as a no-show. A reason is required.' }
      case 'cancel':
        return { actionLabel: 'Cancel Session', variant: 'destructive' as const, actionLogType: 'cancelled', description: 'Cancel this therapy session. A reason is required.' }
      default:
        return { actionLabel: 'Session Action', variant: 'default' as const, actionLogType: 'action', description: '' }
    }
  })()

  const filteredTherapists = therapists.filter(t => t.name.toLowerCase().includes(therapistSearch.toLowerCase()))

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Inter', sans-serif" }}>

      {/* ── Top Header Bar ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200 px-4 sm:px-6 py-2 flex items-center flex-wrap gap-y-2 justify-between gap-4">
        {/* Left: Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Calendar size={22} color="#0F7A87" />
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>
              Therapy Session Plan
            </h1>
            <p className="hidden sm:block" style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
              Plan, manage and track therapy sessions efficiently
            </p>
          </div>

          {/* Reschedule panel (shown when Cancelled / No Show KPI toggled) */}
          {showReschedulePanel && (
            <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: 12, padding: '12px 16px', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Reschedule — Cancelled / No Show / Rescheduled</div>
              <div>
                {sessions.filter(s => ['cancelled', 'no_show', 'rescheduled'].includes(s.status)).length === 0 ? (
                  <div style={{ color: '#6b7280' }}>No cancelled, no-show or rescheduled sessions found.</div>
                ) : (
                  sessions.filter(s => ['cancelled', 'no_show', 'rescheduled'].includes(s.status)).slice(0, 6).map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{s.patient?.childName || s.patientId}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{format(new Date(s.date), 'dd MMM yyyy')} • {s.startTime || '—'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => openActionDialog(s, 'reschedule')}
                          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #f59e0b', background: '#fff', color: '#b45309', cursor: 'pointer', fontWeight: 700 }}
                        >
                          Reschedule
                        </button>
                        <button
                          onClick={() => openActionDialog(s, 'cancel')}
                          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ef4444', background: '#fff', color: '#ef4444', cursor: 'pointer', fontWeight: 700 }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        {/* Center: WhatsApp bulk reminder */}
        <button
          onClick={handleWhatsAppBulkReminder}
          className="hidden md:flex"
          style={{
            alignItems: 'center', gap: 8,
            background: '#25d366', color: '#fff', border: 'none',
            padding: '9px 18px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          <MessageCircle size={16} />
          WhatsApp Bulk Reminder
        </button>
        {/* Right: Search + icons */}
        <div className="flex items-center flex-wrap gap-3">
          <div style={{ position: 'relative' }} className="w-full sm:w-auto">
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              placeholder="Search by patient, therapist..."
              value={headerSearch}
              onChange={e => setHeaderSearch(e.target.value)}
              className="w-full sm:w-[220px]"
              style={{
                paddingLeft: 32, paddingRight: 12, height: 36, border: '1px solid #e5e7eb',
                borderRadius: 8, fontSize: 13, background: '#f9fafb', outline: 'none', color: '#374151',
              }}
            />
          </div>
          <button style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            onClick={handleWhatsAppNotifications}
          >
            <MessageCircle size={20} color="#25d366" />
          </button>
          <button style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <Bell size={20} color="#6b7280" />
            <span style={{
              position: 'absolute', top: 0, right: 0, width: 16, height: 16, borderRadius: '50%',
              background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>8</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar name="Admin" size={32} />
            <div className="hidden sm:block" style={{ lineHeight: 1.2 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Admin</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>Super Admin</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0 }}>
        {/* ── Main Content ──────────────────────────────────────────────────── */}
        <div style={{ flex: 1, padding: '24px 24px 24px 24px', minWidth: 0 }}>

          {/* Status Legend */}
          <div style={{
            background: 'linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%)',
            borderRadius: 12, border: '1px solid #bbf7d0', padding: '12px 16px', marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }}></div>
              <span style={{ color: '#065f46', fontWeight: 500 }}>Completed</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }}></div>
              <span style={{ color: '#78350f', fontWeight: 500 }}>Upcoming/Planned</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }}></div>
              <span style={{ color: '#7f1d1d', fontWeight: 500 }}>Cancelled/No Show</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0F7A87' }}></div>
              <span style={{ color: '#312e81', fontWeight: 500 }}>High Utilization</span>
            </div>
          </div>

          {/* KPI Cards */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'stretch', overflowX: 'auto', paddingBottom: 8 }}>
            {[
              {
                label: 'Total Sessions',
                value: totalCount,
                sub: 'All loaded',
                color: '#0F7A87',
                bg: '#E9F4F5',
                icon: <Calendar size={28} color="#0F7A87" />,
                onClick: () => { setStatusFilter('all'); setShowReschedulePanel(false) },
              },
              {
                label: 'Completed',
                value: completedCount,
                sub: `${totalCount ? ((completedCount / totalCount) * 100).toFixed(1) : '0.0'}%`,
                color: '#22c55e',
                bg: '#f0fdf4',
                icon: <CheckCircle2 size={28} color="#22c55e" />,
                onClick: () => { setStatusFilter('completed'); setShowReschedulePanel(false) },
              },
              {
                label: 'Upcoming',
                value: upcomingCount,
                sub: `${totalCount ? ((upcomingCount / totalCount) * 100).toFixed(1) : '0.0'}%`,
                color: '#f59e0b',
                bg: '#fffbeb',
                icon: <Clock size={28} color="#f59e0b" />,
                onClick: () => { setStatusFilter('planned'); setShowReschedulePanel(false) },
              },
              {
                label: 'Cancelled / No Show',
                value: cancelledCount,
                sub: `${totalCount ? ((cancelledCount / totalCount) * 100).toFixed(1) : '0.0'}%`,
                color: '#ef4444',
                bg: '#fef2f2',
                icon: <XCircle size={28} color="#ef4444" />,
                onClick: () => { setStatusFilter('cancelled'); setShowReschedulePanel(prev => !prev) },
              },
              {
                label: 'Rescheduled',
                value: rescheduledCount,
                sub: `${totalCount ? ((rescheduledCount / totalCount) * 100).toFixed(1) : '0.0'}%`,
                color: '#8b5cf6',
                bg: '#f5f3ff',
                icon: <ChevronUp size={28} color="#8b5cf6" />,
                onClick: () => { setStatusFilter('rescheduled'); setShowReschedulePanel(true) },
              },
              {
                label: 'Total Therapists',
                value: totalTherapists,
                sub: 'Active',
                color: '#8b5cf6',
                bg: '#f5f3ff',
                icon: <Users size={28} color="#8b5cf6" />,
                onClick: () => { setShowReschedulePanel(false) },
              },
            ].map((kpi, i) => (
              <div
                key={i}
                onClick={kpi.onClick}
                style={{
                  background: '#fff', borderRadius: 12, padding: '18px 20px',
                  border: '1px solid #e5e7eb', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', gap: 8,
                  transition: 'all .2s ease',
                  minWidth: 160, flex: '0 0 160px'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(99, 102, 241, 0.12)'
                  e.currentTarget.style.borderColor = '#B8DEE1'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.borderColor = '#e5e7eb'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: kpi.color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{kpi.label}</span>
                  <div style={{ background: kpi.bg, padding: '8px 8px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {kpi.icon}
                  </div>
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{kpi.value}</div>
                <div style={{ fontSize: 12, color: kpi.color, fontWeight: 600 }}>{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* Date nav + filter bar */}
          <div style={{
            background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
            padding: '14px 18px', marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            {/* Date nav */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setCurrentDate(prev => subDays(prev, 1))}
                title="Previous day (Keyboard: ← )"
                style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 6px', cursor: 'pointer', transition: 'all .2s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.borderColor = '#d1d5db' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = '#e5e7eb' }}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setCurrentDate(prev => addDays(prev, 1))}
                title="Next day (Keyboard: → )"
                style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 6px', cursor: 'pointer', transition: 'all .2s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.borderColor = '#d1d5db' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = '#e5e7eb' }}
              >
                <ChevronRight size={16} />
              </button>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#111827', minWidth: 180, paddingLeft: 8 }}>
                {format(currentDate, 'dd MMM yyyy')} <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>— {format(currentDate, 'EEEE')}</span>
              </span>
              <button
                onClick={() => setCurrentDate(new Date())}
                title="Jump to today"
                style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#0B5A64', transition: 'all .2s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#E9F4F5'; e.currentTarget.style.borderColor = '#B8DEE1' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = '#e5e7eb' }}
              >
                Today
              </button>
            </div>

            {/* Filters */}
            <select
              value={patientFilter}
              onChange={e => setPatientFilter(e.target.value)}
              title="Filter sessions by patient"
              style={{ height: 36, border: patientFilter !== 'all' ? '2px solid #0B5A64' : '1px solid #e5e7eb', borderRadius: 7, padding: '0 12px', fontSize: 13, background: '#fff', color: '#374151', outline: 'none', fontWeight: patientFilter !== 'all' ? 600 : 500, transition: 'all .2s' }}
            >
              <option value="all">All Patients</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.childName}</option>)}
            </select>

            <select
              value={therapyFilter}
              onChange={e => setTherapyFilter(e.target.value)}
              title="Filter sessions by therapy type"
              style={{ height: 36, border: therapyFilter !== 'all' ? '2px solid #0B5A64' : '1px solid #e5e7eb', borderRadius: 7, padding: '0 12px', fontSize: 13, background: '#fff', color: '#374151', outline: 'none', fontWeight: therapyFilter !== 'all' ? 600 : 500, transition: 'all .2s' }}
            >
              <option value="all">All Therapies</option>
              <option value="Speech Therapy">Speech Therapy</option>
              <option value="Occupational Therapy">Occupational Therapy</option>
              <option value="Behavioral Therapy">Behavioral Therapy</option>
              <option value="Special Education">Special Education</option>
            </select>

            <select
              value={therapistFilter}
              onChange={e => setTherapistFilter(e.target.value)}
              title="Filter sessions by therapist"
              style={{ height: 36, border: therapistFilter !== 'all' ? '2px solid #0B5A64' : '1px solid #e5e7eb', borderRadius: 7, padding: '0 12px', fontSize: 13, background: '#fff', color: '#374151', outline: 'none', fontWeight: therapistFilter !== 'all' ? 600 : 500, transition: 'all .2s' }}
            >
              <option value="all">All Therapists</option>
              {therapists.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>

            <select
              value={roomFilter}
              onChange={e => setRoomFilter(e.target.value)}
              title="Filter sessions by room"
              style={{ height: 36, border: roomFilter !== 'all' ? '2px solid #0B5A64' : '1px solid #e5e7eb', borderRadius: 7, padding: '0 12px', fontSize: 13, background: '#fff', color: '#374151', outline: 'none', fontWeight: roomFilter !== 'all' ? 600 : 500, transition: 'all .2s' }}
            >
              <option value="all">All Rooms</option>
              {roomOptions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            {/* Day/Week/Month toggle */}
            <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 2, marginLeft: 'auto' }}>
              {(['day', 'week', 'month'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  style={{
                    padding: '5px 14px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    background: viewMode === m ? '#0F7A87' : 'transparent',
                    color: viewMode === m ? '#fff' : '#6b7280',
                    transition: 'all .15s',
                  }}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            {canAddSession && (
              <button
                onClick={() => openAddSession()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: '#0F7A87', color: '#fff', border: 'none',
                  padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}
              >
                <Plus size={15} />
                Add Session
              </button>
            )}
          </div>

          {/* Active Filters Indicator */}
          {(statusFilter !== 'all' || therapyFilter !== 'all' || therapistFilter !== 'all' || roomFilter !== 'all' || patientFilter !== 'all') && (
            <div style={{
              background: '#E9F4F5', borderRadius: 12, border: '1px solid #B8DEE1',
              padding: '12px 16px', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#0B5A64' }}>Active Filters:</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {statusFilter !== 'all' && (
                  <span style={{
                    fontSize: 12, fontWeight: 500, color: '#0B5A64',
                    background: '#fff', padding: '4px 10px', borderRadius: 6,
                    border: '1px solid #B8DEE1', display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    Status: {statusFilter}
                    <button onClick={() => setStatusFilter('all')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontWeight: 700 }}>×</button>
                  </span>
                )}
                {therapyFilter !== 'all' && (
                  <span style={{
                    fontSize: 12, fontWeight: 500, color: '#0B5A64',
                    background: '#fff', padding: '4px 10px', borderRadius: 6,
                    border: '1px solid #B8DEE1', display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    Therapy: {therapyFilter}
                    <button onClick={() => setTherapyFilter('all')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontWeight: 700 }}>×</button>
                  </span>
                )}
                {therapistFilter !== 'all' && (
                  <span style={{
                    fontSize: 12, fontWeight: 500, color: '#0B5A64',
                    background: '#fff', padding: '4px 10px', borderRadius: 6,
                    border: '1px solid #B8DEE1', display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    Therapist: {therapistFilter}
                    <button onClick={() => setTherapistFilter('all')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontWeight: 700 }}>×</button>
                  </span>
                )}
                {roomFilter !== 'all' && (
                  <span style={{
                    fontSize: 12, fontWeight: 500, color: '#0B5A64',
                    background: '#fff', padding: '4px 10px', borderRadius: 6,
                    border: '1px solid #B8DEE1', display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    Room: {roomFilter}
                    <button onClick={() => setRoomFilter('all')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontWeight: 700 }}>×</button>
                  </span>
                )}
                {patientFilter !== 'all' && (
                  <span style={{
                    fontSize: 12, fontWeight: 500, color: '#0B5A64',
                    background: '#fff', padding: '4px 10px', borderRadius: 6,
                    border: '1px solid #B8DEE1', display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    Patient: {patientFilter}
                    <button onClick={() => setPatientFilter('all')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontWeight: 700 }}>×</button>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Calendar Scheduler View (45-min fixed slots) ─────────────────── */}
          {viewMode === 'day' && (
            <CalendarScheduler
              sessions={sessions.map(s => ({
                id: s.id,
                therapistName: s.therapistName || '',
                patientName: s.patient?.childName || 'Unknown',
                patientId: s.patientId,
                startTime: s.startTime || '',
                endTime: s.endTime || '',
                date: s.date || '',
                status: s.status || 'scheduled',
                therapyType: s.therapyType || '',
                roomId: s.roomId,
                appointmentId: s.appointmentId,
              }))}
              therapists={therapists}
              patients={patients}
              leaves={[]}
              selectedDate={format(currentDate, 'yyyy-MM-dd')}
              onSessionCreated={() => fetchSessions()}
              onSessionUpdated={() => fetchSessions()}
              onSessionDeleted={() => fetchSessions()}
            />
          )}

          {/* ── Session Grid (Day View) ──────────────────────────────────────── */}
          {viewMode === 'day' && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              {loading ? (
                <div style={{ padding: 40 }}><Skeleton className="h-64 w-full" /></div>
              ) : dayTherapists.length === 0 ? (
                /* Fallback: list view when no grid data */
                <SessionListView
                  sessions={sessions.filter(s => {
                    let ok = true
                    if (patientFilter && patientFilter !== 'all') ok = ok && s.patientId === patientFilter
                    if (statusFilter !== 'all') ok = ok && s.status === statusFilter
                    if (headerSearch) {
                      const q = headerSearch.toLowerCase()
                      ok = ok && (
                        (s.patient?.childName || '').toLowerCase().includes(q) ||
                        (s.therapistName || '').toLowerCase().includes(q)
                      )
                    }
                    return ok
                  })}
                  expandedRow={expandedRow}
                  setExpandedRow={setExpandedRow}
                  openView={(s) => { setViewSession(s); setViewDialogOpen(true); setShowViewReschedule(false); setConfirmingViewDelete(false) }}
                  openActionDialog={openActionDialog}
                  therapists={therapists}
                />
              ) : (
                <>
                  {/* Grid header */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: `80px repeat(${dayTherapists.length}, 1fr)`,
                    borderBottom: '2px solid #e5e7eb',
                    background: '#f9fafb',
                  }}>
                    <div style={{ padding: '14px 16px', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Time</div>
                    {dayTherapists.map(name => {
                      const t = therapists.find(th => th.name === name)
                      // Calculate sessions for this therapist
                      const therapistSessionsCount = daySessions.filter(s => s.therapistName === name).length
                      const maxSessions = timeSlots.length
                      const utilization = maxSessions > 0 ? Math.round((therapistSessionsCount / maxSessions) * 100) : 0

                      return (
                        <div key={name} style={{
                          padding: '12px 12px', borderLeft: '1px solid #e5e7eb',
                          display: 'flex', alignItems: 'center', gap: 10,
                          background: '#fff'
                        }}>
                          <Avatar name={name} size={40} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{name}</div>
                            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{t ? resolveDisplayDesignation(t.designation, t.role, t.secondaryRole) : ''}</div>
                            <div style={{
                              fontSize: 10, fontWeight: 600, color: utilization > 70 ? '#ef4444' : utilization > 40 ? '#f59e0b' : '#10b981',
                              background: utilization > 70 ? '#fef2f2' : utilization > 40 ? '#fffbeb' : '#f0fdf4',
                              padding: '2px 6px', borderRadius: 4, display: 'inline-block'
                            }}>
                              {utilization}% Scheduled
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Time rows */}
                  {timeSlots.map(slot => (
                    <div key={slot} style={{
                      display: 'grid',
                      gridTemplateColumns: `80px repeat(${dayTherapists.length}, 1fr)`,
                      borderBottom: '1px solid #f3f4f6',
                    }}>
                      <div style={{ padding: '10px 16px', fontSize: 12, fontWeight: 600, color: '#6b7280', alignSelf: 'center' }}>
                        {parseInt(slot) >= 12 ? `${parseInt(slot) > 12 ? parseInt(slot) - 12 : 12}:00 PM` : `${parseInt(slot)}:00 AM`}
                      </div>
                      {dayTherapists.map(name => {
                        const s = getSessionAt(name, slot)
                        return (
                          <div key={name} style={{ borderLeft: '1px solid #f3f4f6', padding: '6px 8px', minHeight: 60, display: 'flex', alignItems: 'center', background: s ? (s.status === 'completed' ? '#f0fdf4' : s.status === 'cancelled' || s.status === 'no_show' ? '#fef2f2' : '#fffbeb') : 'transparent' }}>
                            {s ? (
                              <div
                                onClick={() => { setViewSession(s); setViewDialogOpen(true); setShowViewReschedule(false); setConfirmingViewDelete(false) }}
                                style={{
                                  background: s.status === 'completed' ? '#ffffff' : s.status === 'cancelled' || s.status === 'no_show' ? '#ffffff' : '#ffffff',
                                  border: `2px solid ${s.status === 'completed' ? '#bbf7d0' : s.status === 'cancelled' || s.status === 'no_show' ? '#fecaca' : '#fde68a'}`,
                                  borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
                                  width: '100%',
                                  transition: 'all .2s ease',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                }}
                                onMouseEnter={e => {
                                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)'
                                  e.currentTarget.style.transform = 'scale(1.02)'
                                }}
                                onMouseLeave={e => {
                                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'
                                  e.currentTarget.style.transform = 'scale(1)'
                                }}
                              >
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{s.patient?.childName}</div>
                                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1 }}>{s.startTime} - {s.endTime}</div>
                                <div style={{ fontSize: 10, color: '#0B5A64', fontWeight: 600, marginTop: 2 }}>{resolveTherapyLabel(s.therapyType, s.therapistName, therapists)}</div>
                                <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                                  {s.status === 'completed' && <span title="Completed" style={{ display: 'inline-flex' }}><CheckCircle2 size={11} color="#22c55e" /></span>}
                                  {(s.status === 'planned' || s.status === 'upcoming' || s.status === 'accepted') && <span title="Upcoming" style={{ display: 'inline-flex' }}><Clock size={11} color="#f59e0b" /></span>}
                                  {(s.status === 'cancelled' || s.status === 'no_show') && <span title="Cancelled/No Show" style={{ display: 'inline-flex' }}><XCircle size={11} color="#ef4444" /></span>}
                                </div>
                              </div>
                            ) : (
                              <div
                                onClick={() => openAddSession({ therapistName: name, date: dateStr, startTime: slot })}
                                style={{
                                  height: '100%', width: '100%', border: '2px dashed #d1d5db', borderRadius: 8,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', 
                                  opacity: 0.4, transition: 'all .2s ease', position: 'relative'
                                }}
                                title="Add session"
                                onMouseEnter={e => {
                                  e.currentTarget.style.background = '#f3f4f6'
                                  e.currentTarget.style.opacity = '0.7'
                                  e.currentTarget.style.borderColor = '#9ca3af'
                                }}
                                onMouseLeave={e => {
                                  e.currentTarget.style.background = 'transparent'
                                  e.currentTarget.style.opacity = '0.4'
                                  e.currentTarget.style.borderColor = '#d1d5db'
                                }}
                              >
                                <Plus size={16} color="#9ca3af" />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                  {/* Legend */}
                  <div style={{
                    padding: '12px 20px', borderTop: '1px solid #e5e7eb',
                    display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
                  }}>
                    {[
                      { color: '#22c55e', label: 'Completed' },
                      { color: '#f59e0b', label: 'Upcoming' },
                      { color: '#ef4444', label: 'Cancelled / No Show' },
                      { color: '#3b82f6', label: 'Available Slot' },
                      { color: '#d1d5db', label: 'Break / Lunch' },
                    ].map(item => (
                      <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, display: 'inline-block' }} />
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                  {/* Bottom info strip */}
                  <div style={{
                    padding: '10px 20px', background: '#f8fafc', borderTop: '1px solid #e5e7eb',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280' }}>
                      <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#e0e7ff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>ℹ</span>
                      Click on any session to view details, take notes or mark as completed.
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280' }}>
                      <MessageCircle size={14} color="#25d366" />
                      Use WhatsApp option to send session details to parents.
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Week / Month views — list fallback */}
          {viewMode !== 'day' && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', fontSize: 14, color: '#6b7280' }}>
                {/* Deliberately a list, not a calendar grid, for week/month — all real data */}
                {viewMode === 'week' ? `Week view: ${format(startOfWeek(currentDate), 'dd MMM')} – ${format(endOfWeek(currentDate), 'dd MMM yyyy')}` : `Month view: ${format(currentDate, 'MMMM yyyy')}`}
              </div>
              <SessionListView
                sessions={displaySessions}
                expandedRow={expandedRow}
                setExpandedRow={setExpandedRow}
                openView={(s) => { setViewSession(s); setViewDialogOpen(true); setShowViewReschedule(false); setConfirmingViewDelete(false) }}
                openActionDialog={openActionDialog}
                therapists={therapists}
              />
            </div>
          )}
        </div>

        {/* ── Right Sidebar ──────────────────────────────────────────────────── */}
        <div style={{ width: 260, flexShrink: 0, padding: '24px 20px 24px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Session Plan Summary */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 16 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#111827' }}>Session Plan Summary</h3>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <DonutChart
                completed={completedCount}
                upcoming={upcomingCount}
                cancelled={cancelledCount}
                available={Math.max(0, sessions.length - completedCount - upcomingCount - cancelledCount - rescheduledCount)}
              />
            </div>
            {[
              { label: 'Completed', value: completedCount, color: '#22c55e' },
              { label: 'Upcoming', value: upcomingCount, color: '#f59e0b' },
              { label: 'Cancelled / No Show', value: cancelledCount, color: '#ef4444' },
              { label: 'Available Slots', value: Math.max(0, sessions.length - completedCount - upcomingCount - cancelledCount - rescheduledCount), color: '#3b82f6' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#374151' }}>{item.label}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>
                  {item.value} ({sessions.length ? ((item.value / sessions.length) * 100).toFixed(1) : '0.0'}%)
                </span>
              </div>
            ))}
            <div style={{ marginTop: 10, fontSize: 10, color: '#9ca3af' }}>*Percentages are based on total sessions</div>
          </div>

          {/* Quick Actions */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
              <span style={{ fontSize: 16 }}>⚡</span>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>Quick Actions</h3>
            </div>
            {[
              { icon: <Plus size={14} />, label: 'Add New Session', action: () => openAddSession(), superAdminOnly: true },
              { icon: <Copy size={14} />, label: 'Copy Session Plan', action: () => { setQuickActionType('copy'); setQuickActionOpen(true) } },
              { icon: <Users size={14} />, label: 'View Therapist Availability', action: () => { setQuickActionType('therapist'); setQuickActionOpen(true) } },
              { icon: <LayoutGrid size={14} />, label: 'Room Schedule', action: () => { setQuickActionType('room'); setQuickActionOpen(true) } },
            ].filter(qa => !qa.superAdminOnly || canAddSession).map((qa, i) => (
              <button
                key={i}
                onClick={qa.action}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                  background: 'none', border: 'none', padding: '7px 4px', cursor: 'pointer',
                  fontSize: 13, color: '#374151', textAlign: 'left', borderRadius: 6,
                  transition: 'background .12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <span style={{ color: '#0F7A87' }}>{qa.icon}</span>
                {qa.label}
              </button>
            ))}
            <button
              onClick={handleSendWhatsAppReminder}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                background: '#25d366', color: '#fff', border: 'none',
                padding: '9px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', marginTop: 8,
              }}
            >
              <MessageCircle size={15} />
              Send WhatsApp Reminder
            </button>
          </div>

          {/* Today's Therapists */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 16 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#111827' }}>Today's Therapists</h3>
            {therapists.length === 0 ? (
              <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>No therapists loaded yet.</p>
            ) : (
              therapists.slice(0, 4).map(t => {
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar name={t.name} size={30} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{t.name}</div>
                        <div style={{ fontSize: 10, color: '#6b7280' }}>{resolveDisplayDesignation(t.designation, t.role, t.secondaryRole)}</div>
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                      background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0',
                    }}>On Duty</span>
                  </div>
                )
              })
            )}
            <button
              onClick={() => navigate('employees')}
              style={{
                marginTop: 8, background: 'none', border: 'none', color: '#0F7A87',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
              }}
            >
              View All Therapists →
            </button>
          </div>
        </div>
      </div>

      {/* ── New Session Dialog ────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {/* A half-filled session form must not vanish on a stray tap beside
            it — especially on a tablet. Closing is Cancel, Esc or the X. */}
        <DialogContent
          className="max-w-lg max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>New Therapy Session</DialogTitle>
            <DialogDescription>Create a new therapy session with SOAP notes.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Patient *</Label>
              <Input placeholder="Search patients..." value={patientSearch} onChange={e => setPatientSearch(e.target.value)} />
              <Select value={form.patientId} onValueChange={v => setForm(prev => ({ ...prev, patientId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a patient" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {patients.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.patientId} - {p.childName} ({p.mobile})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Patient Package</Label>
              <Select value={form.patientPackageId || '__none__'} onValueChange={v => setForm(prev => ({ ...prev, patientPackageId: v === '__none__' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Select package (optional)" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="__none__">No package</SelectItem>
                  {patientPackages.map(pp => (
                    <SelectItem key={pp.id} value={pp.id}>
                      {pp.package?.name || 'Package'} - {pp.sessionsCompleted}/{pp.sessionsPurchased} sessions (₹{new Intl.NumberFormat('en-IN').format(pp.netAmount)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {patientPackages.length === 0 && form.patientId && (
                <p className="text-xs text-muted-foreground">No active packages for this patient.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Therapist Name</Label>
              <Select value={form.therapistName || ''} onValueChange={v => setForm(prev => ({ ...prev, therapistName: v }))}>
                <SelectTrigger><SelectValue placeholder="Select therapist" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <div className="px-3 py-2">
                    <Input placeholder="Search therapists..." value={therapistSearch} onChange={e => setTherapistSearch(e.target.value)} />
                  </div>
                  {therapistsLoading ? (
                    <div className="px-3 py-3 text-sm text-muted-foreground">Loading therapists...</div>
                  ) : filteredTherapists.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-muted-foreground">No therapists found</div>
                  ) : (
                    filteredTherapists.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Therapy Type</Label>
              <Select value={form.therapyType} onValueChange={v => setForm(prev => ({ ...prev, therapyType: v }))}>
                <SelectTrigger><SelectValue placeholder="Select therapy type" /></SelectTrigger>
                <SelectContent>
                  {['Speech Therapy', 'Occupational Therapy', 'Behavioral Therapy', 'Special Education', 'ABA Therapy', 'Physiotherapy', 'Counseling'].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input type="time" value={form.startTime} onChange={e => setForm(prev => ({ ...prev, startTime: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input type="time" value={form.endTime} onChange={e => setForm(prev => ({ ...prev, endTime: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(prev => ({ ...prev, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['planned', 'in_progress', 'completed', 'cancelled'].map(s => (
                    <SelectItem key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* ── Session charge (pay-per-session patients) ──
                Hidden when a package covers the session: that is already
                paid for, so charging again would double-bill. */}
            {!form.patientPackageId && (
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center gap-2">
                  <IndianRupee className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Session Charge</span>
                  <span className="text-xs text-muted-foreground">(optional)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Price (₹)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="decimal"
                      placeholder="e.g. 800"
                      value={form.fee}
                      onChange={e => setForm(prev => ({ ...prev, fee: e.target.value }))}
                    />
                  </div>
                  {parseFloat(form.fee) > 0 && (
                    <div className="space-y-2">
                      <Label>Payment</Label>
                      <Select
                        value={form.feePaid ? 'paid' : 'unpaid'}
                        onValueChange={v => setForm(prev => ({ ...prev, feePaid: v === 'paid' }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unpaid">Unpaid — bill it</SelectItem>
                          <SelectItem value="paid">Paid now</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                {parseFloat(form.fee) > 0 && form.feePaid && (
                  <div className="space-y-2">
                    <Label>Payment Mode</Label>
                    <Select
                      value={form.feePaymentMode}
                      onValueChange={v => setForm(prev => ({ ...prev, feePaymentMode: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card'], ['bank_transfer', 'Bank Transfer'], ['cheque', 'Cheque']].map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {parseFloat(form.fee) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {form.feePaid
                      ? 'An invoice is raised and marked paid — it appears in Billing and Payments.'
                      : 'An invoice is raised as pending — collect it from Billing when the parent pays.'}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">SOAP Notes</span>
              </div>
              {[
                { key: 'subjective', label: 'Subjective (S)', placeholder: "Patient's reported symptoms..." },
                { key: 'objective', label: 'Objective (O)', placeholder: 'Observable data, test results...' },
                { key: 'assessment', label: 'Assessment (A)', placeholder: 'Clinical judgment, evaluation...' },
                { key: 'plan', label: 'Plan (P)', placeholder: 'Treatment plan, next steps...' },
              ].map(field => (
                <div key={field.key} className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{field.label}</Label>
                  <Textarea
                    placeholder={field.placeholder}
                    value={(form as any)[field.key]}
                    onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                    rows={2}
                  />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea placeholder="Additional notes..." value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>{creating ? 'Creating…' : 'Create Session'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Action Confirmation Dialog (ActionDialog) ──────────────────────────── */}
      <ActionDialog
        open={actionDialogOpen}
        onOpenChange={setActionDialogOpen}
        module="sessions"
        recordId={actionSession?.id || ''}
        actionType={actionDialogProps.actionLogType}
        actionLabel={actionDialogProps.actionLabel}
        description={
          actionDialogProps.description +
          (actionSession ? ` — ${actionSession.patient?.childName || 'Unknown'} (${actionSession.therapyType || 'Session'})` : '')
        }
        variant={actionDialogProps.variant}
        onConfirm={submitAction}
      />

      {/* ── View Session Dialog ──────────────────────────────────────────────── */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-[850px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Session Details</DialogTitle>
            <DialogDescription>
              {viewSession?.patient?.childName} — {viewSession && format(new Date(viewSession.date), 'dd MMM yyyy')}
            </DialogDescription>
          </DialogHeader>
          {viewSession && (
            <div className="space-y-3 py-1">
              {/* Compact patient/therapist/date/status info — 3 columns */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Patient', value: viewSession.patient?.childName, sub: viewSession.patient?.patientId },
                  { label: 'Therapist', value: viewSession.therapistName || '-' },
                  { label: 'Therapy Type', value: resolveTherapyLabel(viewSession.therapyType, viewSession.therapistName, therapists) || '-' },
                  { label: 'Date', value: format(new Date(viewSession.date), 'dd MMM yyyy') },
                  { label: 'Time', value: viewSession.startTime && viewSession.endTime ? `${viewSession.startTime} - ${viewSession.endTime}` : '-' },
                ].map(item => (
                  <div key={item.label}>
                    <p className="text-[11px] text-muted-foreground leading-tight">{item.label}</p>
                    <p className="text-sm font-medium leading-tight">{item.value}</p>
                    {item.sub && <p className="text-[11px] text-muted-foreground leading-tight">{item.sub}</p>}
                  </div>
                ))}
                <div>
                  <p className="text-[11px] text-muted-foreground leading-tight">Status</p>
                  <div className="mt-0.5"><StatusPill status={viewSession.status} /></div>
                </div>
              </div>

              {/* SOAP Notes — 2-column grid (Subjective | Objective, Assessment | Plan) */}
              <div className="pt-2 border-t">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">SOAP Notes</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { label: 'Subjective (S)', value: viewSession.subjective },
                    { label: 'Objective (O)', value: viewSession.objective },
                    { label: 'Assessment (A)', value: viewSession.assessment },
                    { label: 'Plan (P)', value: viewSession.plan },
                  ].map(s => (
                    <div key={s.label}>
                      <p className="text-[11px] font-medium text-muted-foreground mb-0.5">{s.label}</p>
                      <div className="rounded-md border p-2 max-h-[90px] overflow-y-auto text-sm whitespace-pre-wrap bg-slate-50">
                        {s.value ? s.value : <span className="text-muted-foreground italic">Not recorded</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Additional Notes — compact */}
              {viewSession.notes && (
                <div className="pt-2 border-t">
                  <p className="text-[11px] font-medium text-muted-foreground mb-0.5">Additional Notes</p>
                  <div className="rounded-md border p-2 max-h-[80px] overflow-y-auto text-sm whitespace-pre-wrap bg-slate-50">
                    {viewSession.notes}
                  </div>
                </div>
              )}

              {/* Session Summary */}
              <div className="pt-2 border-t bg-blue-50 rounded-md p-2">
                <p className="text-[11px] font-medium text-blue-900 mb-1">📊 Session Summary</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-blue-600 font-semibold">Duration</p>
                    <p className="text-blue-900">{viewSession.startTime && viewSession.endTime ? (() => {
                      const start = new Date(`2000-01-01 ${viewSession.startTime}`)
                      const end = new Date(`2000-01-01 ${viewSession.endTime}`)
                      const mins = Math.round((end.getTime() - start.getTime()) / 60000)
                      return `${mins} min`
                    })() : '-'}</p>
                  </div>
                  <div>
                    <p className="text-blue-600 font-semibold">Status</p>
                    <p className="text-blue-900 capitalize">{viewSession.status.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <p className="text-blue-600 font-semibold">Created</p>
                    <p className="text-blue-900">{format(new Date(viewSession.createdAt), 'dd MMM')}</p>
                  </div>
                </div>
              </div>
              {/* Admin Reschedule form — cancelled sessions only */}
              {viewSession.status === 'cancelled' && showViewReschedule && (
                <div className="pt-2 border-t">
                  <div className="rounded-md border border-purple-200 bg-purple-50 p-3 space-y-2">
                    <p className="text-xs font-semibold text-purple-900">Reschedule this session</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px]">New Date</Label>
                        <Input type="date" value={viewRescheduleDate} onChange={e => setViewRescheduleDate(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-[11px]">New Time</Label>
                        <Input type="time" value={viewRescheduleTime} onChange={e => setViewRescheduleTime(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setShowViewReschedule(false)}>Cancel</Button>
                      <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={handleViewReschedule} disabled={viewRescheduling}>{viewRescheduling ? 'Rescheduling…' : 'Confirm Reschedule'}</Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Delete confirmation — cancelled sessions only */}
              {viewSession.status === 'cancelled' && confirmingViewDelete && (
                <div className="pt-2 border-t">
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-2">
                    <p className="text-xs font-semibold text-red-900">Delete this cancelled session?</p>
                    <p className="text-[11px] text-red-700">This action cannot be undone.</p>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setConfirmingViewDelete(false)} disabled={viewDeleting}>Cancel</Button>
                      <Button size="sm" variant="destructive" onClick={handleViewDelete} disabled={viewDeleting}>
                        {viewDeleting ? 'Deleting...' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'space-between' }}>
              <Button variant="outline" onClick={() => { setViewDialogOpen(false); setShowViewReschedule(false); setConfirmingViewDelete(false) }} style={{ flex: 1 }}>Close</Button>
              {viewSession && viewSession.status !== 'completed' && viewSession.status !== 'cancelled' && (
                <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                  <Button
                    onClick={() => { openActionDialog(viewSession, 'complete'); setViewDialogOpen(false) }}
                    style={{ background: '#22c55e', color: '#fff', flex: 1 }}
                  >
                    <CheckCircle2 size={14} style={{ marginRight: 6 }} />
                    Complete
                  </Button>
                  <Button
                    onClick={() => { openActionDialog(viewSession, 'reschedule'); setViewDialogOpen(false) }}
                    variant="outline"
                    style={{ flex: 1 }}
                  >
                    <Clock size={14} style={{ marginRight: 6 }} />
                    Reschedule
                  </Button>
                  <Button
                    onClick={() => { openActionDialog(viewSession, 'cancel'); setViewDialogOpen(false) }}
                    variant="outline"
                    style={{ flex: 1, color: '#ef4444', borderColor: '#fecaca' }}
                  >
                    <XCircle size={14} style={{ marginRight: 6 }} />
                    Cancel
                  </Button>
                </div>
              )}
              {viewSession && viewSession.status === 'cancelled' && (
                <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                  <Button
                    onClick={() => { setShowViewReschedule(v => !v); setConfirmingViewDelete(false) }}
                    variant="outline"
                    style={{ flex: 1, color: '#7c3aed', borderColor: '#ddd6fe' }}
                  >
                    <RotateCcw size={14} style={{ marginRight: 6 }} />
                    Reschedule
                  </Button>
                  <Button
                    onClick={() => { setConfirmingViewDelete(v => !v); setShowViewReschedule(false) }}
                    variant="outline"
                    style={{ flex: 1, color: '#ef4444', borderColor: '#fecaca' }}
                  >
                    <Trash2 size={14} style={{ marginRight: 6 }} />
                    Delete
                  </Button>
                </div>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Action Dialog (Copy plan / Therapist availability / Room schedule) */}
      <Dialog open={quickActionOpen} onOpenChange={setQuickActionOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{quickActionType === 'copy' ? 'Copy Session Plan' : quickActionType === 'therapist' ? 'Therapist Availability' : 'Room Schedule'}</DialogTitle>
            <DialogDescription>
              {quickActionType === 'copy' && 'Copy sessions from one patient to another or duplicate for a date range.'}
              {quickActionType === 'therapist' && 'Quick view of therapist availability on a selected date.'}
              {quickActionType === 'room' && 'View or export room schedule for a selected date.'}
            </DialogDescription>
          </DialogHeader>

          {quickActionType === 'copy' && (
            <div className="grid gap-3 py-2">
              <div className="space-y-2">
                <Label>Source Patient</Label>
                <Select value={copyForm.sourcePatientId} onValueChange={v => setCopyForm(prev => ({ ...prev, sourcePatientId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select source patient" /></SelectTrigger>
                  <SelectContent>
                    {patients.map(p => <SelectItem key={p.id} value={p.id}>{p.childName} ({p.patientId})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target Patient</Label>
                <Select value={copyForm.targetPatientId} onValueChange={v => setCopyForm(prev => ({ ...prev, targetPatientId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select target patient" /></SelectTrigger>
                  <SelectContent>
                    {patients.map(p => <SelectItem key={p.id} value={p.id}>{p.childName} ({p.patientId})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={copyForm.startDate} onChange={e => setCopyForm(prev => ({ ...prev, startDate: e.target.value }))} />
              </div>
            </div>
          )}

          {quickActionType === 'therapist' && (
            <div className="grid gap-3 py-2">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={format(currentDate, 'yyyy-MM-dd')} onChange={e => setCurrentDate(new Date(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Therapists</Label>
                <div style={{ maxHeight: 220, overflow: 'auto' }}>
                  {therapists.length === 0 ? <div className="text-sm text-muted-foreground">No therapists loaded</div> : therapists.map(t => {
                    const count = sessions.filter(s => s.therapistName === t.name && format(new Date(s.date), 'yyyy-MM-dd') === format(currentDate, 'yyyy-MM-dd')).length
                    return (
                      <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                        <div>{t.name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{count} sessions</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {quickActionType === 'room' && (
            <div className="grid gap-3 py-2">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={format(currentDate, 'yyyy-MM-dd')} onChange={e => setCurrentDate(new Date(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Room</Label>
                <Select onValueChange={() => {}}>
                  <SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="room1">Room 1</SelectItem>
                    <SelectItem value="room2">Room 2</SelectItem>
                    <SelectItem value="room3">Room 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickActionOpen(false)}>Close</Button>
            {quickActionType === 'copy' && <Button onClick={async () => { setQuickActionOpen(false); toast({ title: 'Copied session plan (mock)', description: 'This is a client-side mock action' }) }}>Copy</Button>}
            {quickActionType === 'therapist' && <Button onClick={() => { setQuickActionOpen(false); setViewMode('day'); toast({ title: 'Opened therapist availability' }) }}>Open Scheduler</Button>}
            {quickActionType === 'room' && <Button onClick={() => { setQuickActionOpen(false); toast({ title: 'Room schedule shown (mock)' }) }}>View</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Session List Sub-component ───────────────────────────────────────────────

function SessionListView({
  sessions, expandedRow, setExpandedRow, openView, openActionDialog, therapists,
}: {
  sessions: TherapySession[]
  expandedRow: string | null
  setExpandedRow: (id: string | null) => void
  openView: (s: TherapySession) => void
  openActionDialog: (s: TherapySession, type: 'complete' | 'reschedule' | 'no_show' | 'cancel') => void
  therapists: { name: string; role: string }[]
}) {
  if (sessions.length === 0) {
    return (
      <div style={{ padding: '64px 24px', textAlign: 'center', color: '#6b7280' }}>
        <div style={{ fontSize: 16, color: '#9ca3af', marginBottom: 12 }}>📅</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 4 }}>No sessions scheduled</div>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16, maxWidth: 400, margin: '0 auto 16px' }}>
          Get started by creating your first therapy session. Click <strong>Add Session</strong> button to create one.
        </p>
        <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 0 }}>Sessions will appear here once you start scheduling therapies.</p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
          <TableHead className="w-8" style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }} />
          <TableHead style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>👤 Patient</TableHead>
          <TableHead style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>👨‍⚕️ Therapist</TableHead>
          <TableHead style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🎯 Therapy</TableHead>
          <TableHead style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📅 Date</TableHead>
          <TableHead style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>⏰ Time</TableHead>
          <TableHead style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</TableHead>
          <TableHead className="text-right" style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚙️ Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map(session => (
          <React.Fragment key={session.id}>
            <TableRow
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => setExpandedRow(expandedRow === session.id ? null : session.id)}
            >
              <TableCell>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  {expandedRow === session.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </Button>
              </TableCell>
              <TableCell>
                <div>
                  <p className="font-medium text-sm">{session.patient?.childName || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">{session.patient?.patientId}</p>
                </div>
              </TableCell>
              <TableCell className="text-sm">{session.therapistName || <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell>
                {(() => {
                  const label = resolveTherapyLabel(session.therapyType, session.therapistName, therapists)
                  return label
                    ? <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, background: '#E9F4F5', color: '#0B5A64', fontWeight: 500 }}>{label}</span>
                    : <span className="text-muted-foreground">—</span>
                })()}
              </TableCell>
              <TableCell className="text-sm">{format(new Date(session.date), 'dd MMM yyyy')}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {session.startTime && session.endTime ? `${session.startTime} - ${session.endTime}` : '—'}
              </TableCell>
              <TableCell>
                <StatusPill status={session.status} />
                {session.status === 'cancelled' && session.notes && (
                  <div className="text-xs text-muted-foreground mt-1">Reason: {session.notes}</div>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); openView(session) }} title="View">
                    <Eye size={14} />
                  </Button>
                  {session.status !== 'completed' && session.status !== 'cancelled' && (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); openActionDialog(session, 'complete') }} title="Complete">
                        <CheckCircle2 size={14} style={{ color: '#22c55e' }} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); openActionDialog(session, 'reschedule') }} title="Reschedule">
                        <Clock size={14} style={{ color: '#f59e0b' }} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); openActionDialog(session, 'no_show') }} title="No Show">
                        <UserX size={14} style={{ color: '#f59e0b' }} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); openActionDialog(session, 'cancel') }} title="Cancel">
                        <XCircle size={14} style={{ color: '#ef4444' }} />
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
            {expandedRow === session.id && (
              <TableRow style={{ background: '#f8fafc' }}>
                <TableCell colSpan={8}>
                  <div style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                      {[
                        { label: 'Subjective', value: session.subjective },
                        { label: 'Objective', value: session.objective },
                        { label: 'Assessment', value: session.assessment },
                        { label: 'Plan', value: session.plan },
                      ].filter(x => x.value).map(x => (
                        <div key={x.label}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 2 }}>{x.label}</p>
                          <p style={{ fontSize: 13 }}>{x.value}</p>
                        </div>
                      ))}
                      {session.notes && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 2 }}>Notes</p>
                          <p style={{ fontSize: 13 }}>{session.notes}</p>
                        </div>
                      )}
                      {!session.subjective && !session.objective && !session.assessment && !session.plan && !session.notes && (
                        <p style={{ fontSize: 13, color: '#9ca3af', gridColumn: '1 / -1' }}>No SOAP notes recorded for this session.</p>
                      )}
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </React.Fragment>
        ))}
      </TableBody>
    </Table>
  )
}