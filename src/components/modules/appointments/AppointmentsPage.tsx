'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Bell,
  MessageCircle,
  CalendarDays,
  Loader2,
  X,
  Phone,
  Plus,
  RotateCcw,
  ChevronDown,
  MoreVertical,
  Eye,
  CalendarClock,
  UserX,
  History,
  CheckSquare,
  Package,
  TrendingUp,
  FileText,
  Trash2,
  Download,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar } from '@/components/ui/calendar'
import { DatePicker } from '@/components/ui/date-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ActionDialog } from '@/components/ui/action-dialog'
import { SearchInput } from '@/components/ui/search-input'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'
import { toast } from 'sonner'
import { authFetch } from '@/lib/api-client'
import { takesTherapySessions } from '@/lib/therapists'
import { useAppStore, canDeleteAppointments, getRoleLabel, resolveDisplayDesignation } from '@/store/app-store'
import { useSystemConfig, clearConfigCache } from '@/hooks/use-system-config'
import { RESCHEDULE_STAFF_ROLES } from '@/lib/reschedule'
import { RescheduleRequestsPanel, type PendingRescheduleRequest } from './RescheduleRequestsPanel'

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Patient {
  id: string
  patientId: string
  childName: string
  mobile: string
}

interface Appointment {
  id: string
  patientId: string
  title: string
  date: string
  startTime: string
  endTime: string
  therapistId: string | null
  status: string
  type: string | null
  notes: string | null
  sessionFocus?: string | null
  goalTargeted?: string | null
  progressAchieved?: string | null
  sessionRemarks?: string | null
  patient?: Patient
  patientPackageId?: string | null
}

type RangeFilter = 'today' | 'week' | 'month'

interface Therapist {
  id: string
  name: string
  role: string
  secondaryRole?: string | null
  therapyType?: string | null
  designation?: string | null
  isActive?: boolean
}

// Appointment "type" values that are too generic to be useful on their own
// (e.g. every walk-in appointment defaults to "therapy" regardless of the
// assigned therapist's actual specialization). When we see one of these,
// fall back to the assigned therapist's real role — the same label shown in
// User Management — instead of the generic word.
const GENERIC_APPT_TYPES = new Set(['therapy', 'consultation', ''])

// Appointments store a type KEY ("speech", "play-therapy"). Where the
// clinic's own label list isn't at hand, turn the key into something a
// person can read instead of printing "occupational" or "play-therapy".
const KNOWN_TYPE_LABELS: Record<string, string> = {
  speech: 'Speech Therapy',
  occupational: 'Occupational Therapy',
  behavioral: 'Behavioral Therapy',
}
function readableTypeKey(key: string): string {
  if (KNOWN_TYPE_LABELS[key]) return KNOWN_TYPE_LABELS[key]
  // Already a label (has a capital or a space) — leave it alone.
  if (/[A-Z ]/.test(key)) return key
  return key.split(/[-_]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}

function resolveAppointmentTypeLabel(
  rawType: string | null | undefined,
  therapistName: string | null | undefined,
  therapists: Therapist[]
): string {
  const raw = (rawType || '').trim()
  if (raw && !GENERIC_APPT_TYPES.has(raw.toLowerCase())) {
    return readableTypeKey(raw)
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

// ─── Schedule config ───────────────────────────────────────────────────────
const SLOT_DURATION_MIN = 45  // Each appointment slot is 45 minutes
const DAY_START = '08:00'     // 8:00 AM
const DAY_END = '22:00'       // 10:00 PM

// Continuous time slots from DAY_START to DAY_END — no lunch break, every
// clinic hour is bookable. `<=` (not `<`) so a duration that divides the
// day evenly (e.g. 30 min) includes DAY_END itself as the last row.
function generateTimeSlots(): string[] {
  const slots: string[] = []
  const [startH, startM] = DAY_START.split(':').map(Number)
  const [endH, endM] = DAY_END.split(':').map(Number)
  const endMin = endH * 60 + endM
  let currentMin = startH * 60 + startM

  while (currentMin <= endMin) {
    const h = Math.floor(currentMin / 60)
    const m = currentMin % 60
    slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
    currentMin += SLOT_DURATION_MIN
  }
  return slots
}

const TIME_ROWS = generateTimeSlots()

// ─── STATUS HELPERS ───────────────────────────────────────────────────────────

function getStatusCfg(status: string) {
  switch (status) {
    case 'confirmed':
      return { dot: 'bg-green-500', text: 'text-green-600', label: 'Confirmed', badge: 'bg-green-100 text-green-700', cardBorder: 'border-l-2 border-l-green-400 bg-white', icon: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> }
    case 'scheduled':
      return { dot: 'bg-blue-400', text: 'text-blue-600', label: 'Scheduled', badge: 'bg-blue-100 text-blue-700', cardBorder: 'border-l-2 border-l-blue-300 bg-white', icon: <Clock className="w-3.5 h-3.5 text-blue-400" /> }
    case 'pending':
      return { dot: 'bg-amber-400', text: 'text-amber-600', label: 'Pending', badge: 'bg-amber-100 text-amber-700', cardBorder: 'border-l-2 border-l-amber-400 bg-amber-50/70', icon: <Clock className="w-3.5 h-3.5 text-amber-400" /> }
    case 'cancelled':
      return { dot: 'bg-red-500', text: 'text-red-500', label: 'Cancelled', badge: 'bg-red-100 text-red-700', cardBorder: 'border-l-2 border-l-red-400 bg-red-50/70', icon: <XCircle className="w-3.5 h-3.5 text-red-400" /> }
    case 'completed':
      return { dot: 'bg-green-500', text: 'text-green-600', label: 'Completed', badge: 'bg-green-100 text-green-700', cardBorder: 'border-l-2 border-l-green-400 bg-green-50/70', icon: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> }
    case 'no_show':
      return { dot: 'bg-orange-500', text: 'text-orange-600', label: 'No Show', badge: 'bg-orange-100 text-orange-700', cardBorder: 'border-l-2 border-l-orange-400 bg-orange-50/70', icon: <XCircle className="w-3.5 h-3.5 text-orange-400" /> }
    case 'rescheduled':
      return { dot: 'bg-purple-500', text: 'text-purple-600', label: 'Rescheduled', badge: 'bg-purple-100 text-purple-700', cardBorder: 'border-l-2 border-l-purple-400 bg-purple-50/70', icon: <RotateCcw className="w-3.5 h-3.5 text-purple-400" /> }
    default:
      return { dot: 'bg-gray-400', text: 'text-gray-600', label: status, badge: 'bg-gray-100 text-gray-700', cardBorder: 'border-l-2 border-l-gray-300 bg-white', icon: <Clock className="w-3.5 h-3.5 text-gray-400" /> }
  }
}

// Row background color based on appointment status — used in the table view.
// Completed = green, Rescheduled = orange, Cancelled = red, Scheduled = sky blue, No Show = purple.
function getRowBgClass(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-green-50 hover:bg-green-100'
    case 'rescheduled':
      return 'bg-orange-50 hover:bg-orange-100'
    case 'cancelled':
      return 'bg-red-50 hover:bg-red-100'
    case 'scheduled':
      return 'bg-sky-50 hover:bg-sky-100'
    case 'no_show':
      return 'bg-purple-50 hover:bg-purple-100'
    default:
      return 'hover:bg-gray-50'
  }
}

function formatTimeDisplay(time24: string): string {
  if (!time24) return ''
  const [h, m] = time24.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
}

// ─── AVATAR ───────────────────────────────────────────────────────────────────

function TherapistAvatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name.split(' ').slice(0, 2).map((n) => n[0]).join('')
  const palette = [
    'bg-orange-200 text-orange-800',
    'bg-teal-200 text-teal-800',
    'bg-purple-200 text-purple-800',
    'bg-pink-200 text-pink-800',
    'bg-emerald-200 text-emerald-800',
  ]
  const color = palette[name.charCodeAt(0) % palette.length]
  const sz =
    size === 'sm' ? 'w-7 h-7 text-[10px]' :
    size === 'md' ? 'w-9 h-9 text-xs' :
    'w-12 h-12 text-sm'
  return (
    <div className={`${sz} rounded-full ${color} flex items-center justify-center font-bold shrink-0`}>
      {initials}
    </div>
  )
}

// ─── APPOINTMENT CARD (grid) ──────────────────────────────────────────────────

interface AptCardProps {
  name: string
  start: string
  end: string
  status: string
  selected?: boolean
  onClick: () => void
}

function AptCard({ name, start, end, status, selected, onClick }: AptCardProps) {
  const cfg = getStatusCfg(status)
  return (
    <div
      onClick={onClick}
      className={`rounded-lg px-2.5 py-2 mb-1 cursor-pointer transition-all shadow-sm ${cfg.cardBorder} ${selected ? 'ring-2 ring-blue-400' : 'hover:shadow-md'}`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-800 truncate leading-tight">{name}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">{formatTimeDisplay(start)} - {formatTimeDisplay(end)}</p>
          <span className={`text-[10px] font-medium ${cfg.text}`}>{cfg.label}</span>
        </div>
        <div className="shrink-0 mt-0.5">{cfg.icon}</div>
      </div>
    </div>
  )
}

// ─── DETAIL ROW ───────────────────────────────────────────────────────────────

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-4 shrink-0 flex items-center justify-center text-blue-500">{icon}</span>
      <span className="text-[11px] text-gray-500 w-20 shrink-0">{label}</span>
      <span className="text-[11px] text-gray-800 font-semibold flex-1">{value}</span>
    </div>
  )
}

// ─── RANGE HELPER (Task 17) ──────────────────────────────────────────────────

function computeRange(anchor: Date, range: RangeFilter): { start: Date; end: Date } {
  if (range === 'week') {
    return {
      start: startOfWeek(anchor, { weekStartsOn: 1 }),
      end: endOfWeek(anchor, { weekStartsOn: 1 }),
    }
  }
  if (range === 'month') {
    return {
      start: startOfMonth(anchor),
      end: endOfMonth(anchor),
    }
  }
  return { start: anchor, end: anchor }
}

// ─── UPCOMING APPOINTMENTS PANEL ───────────────────────────────────────────────
// A flat, chronological list of every not-yet-happened appointment across all
// dates (as opposed to the Schedule tab, which is scoped to one day/week/month).

interface UpcomingAppointmentsPanelProps {
  therapists: Therapist[]
  items: Appointment[]
  loading: boolean
  error: string | null
}

function UpcomingAppointmentsPanel({ therapists, items, loading, error }: UpcomingAppointmentsPanelProps) {
  // Day-wise filter — '' means "all upcoming days". Pagination is applied on
  // top of whatever the day filter leaves.
  const [dayFilter, setDayFilter] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10

  const filteredItems = dayFilter
    ? items.filter((a) => format(new Date(a.date), 'yyyy-MM-dd') === dayFilter)
    : items

  useEffect(() => {
    setPage(1)
  }, [dayFilter])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const paginatedItems = filteredItems.slice((page - 1) * pageSize, page * pageSize)

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-12 text-center">
        <Loader2 className="w-6 h-6 mx-auto text-gray-300 animate-spin mb-2" />
        <p className="text-sm text-gray-500">Loading upcoming appointments…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-12 text-center">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b-2 border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-800">Upcoming Appointments ({filteredItems.length})</h3>
        <div className="flex items-center gap-2">
          <DatePicker value={dayFilter} onChange={setDayFilter} placeholder="Filter by day" buttonSize="sm" className="w-40" />
          {dayFilter && (
            <button
              onClick={() => setDayFilter('')}
              className="text-xs font-medium text-blue-600 hover:underline shrink-0"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="py-12 text-center">
          <CalendarDays className="w-10 h-10 mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-semibold text-gray-600">
            No upcoming appointments{dayFilter ? ' on this day' : ''}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-400 bg-gray-100">
                  <th className="text-left px-4 py-2.5 font-bold text-gray-700 border-r border-gray-300 last:border-r-0">Patient</th>
                  <th className="text-left px-4 py-2.5 font-bold text-gray-700 border-r border-gray-300 last:border-r-0">Date</th>
                  <th className="text-left px-4 py-2.5 font-bold text-gray-700 border-r border-gray-300 last:border-r-0">Time</th>
                  <th className="text-left px-4 py-2.5 font-bold text-gray-700 border-r border-gray-300 last:border-r-0">Therapist</th>
                  <th className="text-left px-4 py-2.5 font-bold text-gray-700 border-r border-gray-300 last:border-r-0">Type</th>
                  <th className="text-left px-4 py-2.5 font-bold text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((apt, idx) => (
                  <tr key={apt.id} className={`border-b-2 border-gray-300 hover:bg-blue-50/50 ${idx % 2 === 1 ? 'bg-gray-50/60' : ''}`}>
                    <td className="px-4 py-2.5 border-r border-gray-200">
                      <p className="font-medium text-gray-800">{apt.patient?.childName || apt.title || 'Unknown'}</p>
                      <p className="text-xs text-gray-500">{apt.patient?.patientId}</p>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 border-r border-gray-200">{format(new Date(apt.date), 'dd MMM yyyy')}</td>
                    <td className="px-4 py-2.5 text-gray-700 border-r border-gray-200">{formatTimeDisplay(apt.startTime)} - {formatTimeDisplay(apt.endTime)}</td>
                    <td className="px-4 py-2.5 text-gray-700 border-r border-gray-200">
                      {apt.therapistId ? (
                        <>
                          <p>{apt.therapistId}</p>
                          {(() => {
                            const match = therapists.find((t) => t.name === apt.therapistId)
                            const label = match ? resolveDisplayDesignation(match.designation, match.role, match.secondaryRole) : ''
                            return label ? <p className="text-xs text-gray-400">{label}</p> : null
                          })()}
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 border-r border-gray-200">{resolveAppointmentTypeLabel(apt.type, apt.therapistId, therapists) || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${getStatusCfg(apt.status).badge}`}>
                        {getStatusCfg(apt.status).label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t-2 border-gray-200">
              <p className="text-xs text-gray-500">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredItems.length)} of {filteredItems.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-600" />
                </button>
                <span className="text-xs font-medium text-gray-600">Page {page} of {totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [therapistFilter, setTherapistFilter] = useState<string>('all')
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('today')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientSearch, setPatientSearch] = useState('')
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10
  const [activeView, setActiveView] = useState<'schedule' | 'upcoming'>('schedule')

  // ── Dynamic config (falls back to hardcoded while loading) ──
  const { items: configApptTypes, loading: apptTypesLoading } = useSystemConfig('appointment_types')
  const { items: configApptStatuses, loading: apptStatusesLoading } = useSystemConfig('appointment_statuses')
  const APPT_TYPES_FALLBACK = [
    { key: 'consultation', label: 'Consultation' },
    { key: 'therapy', label: 'Therapy' },
    { key: 'assessment', label: 'Assessment' },
    { key: 'speech', label: 'Speech Therapy' },
    { key: 'occupational', label: 'Occupational Therapy' },
    { key: 'behavioral', label: 'Behavioral Therapy' },
  ]
  const APPT_STATUSES_FALLBACK = [
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'no_show', label: 'No Show' },
    { key: 'rescheduled', label: 'Rescheduled' },
  ]
  const apptTypeOptions = (!apptTypesLoading && configApptTypes.length > 0)
    ? configApptTypes.map((t) => ({ key: t.key, label: t.label }))
    : APPT_TYPES_FALLBACK
  // Appointments store the type KEY (e.g. "speech"); show its label.
  const apptTypeLabel = (key: string | null | undefined) =>
    (key && apptTypeOptions.find((t) => t.key === key)?.label) || key || ''

  // "+ Add new type" straight from the appointment form (Super Admin — the
  // same people who manage Settings → System Config, where it also shows up).
  const [addTypeOpen, setAddTypeOpen] = useState(false)
  const [newTypeLabel, setNewTypeLabel] = useState('')
  const [addingType, setAddingType] = useState(false)
  const addAppointmentType = async () => {
    const label = newTypeLabel.trim().replace(/\s+/g, ' ')
    if (!label) return
    const existing = apptTypeOptions.find((t) => t.label.toLowerCase() === label.toLowerCase())
    if (existing) {
      setForm((prev) => ({ ...prev, type: existing.key }))
      setAddTypeOpen(false)
      setNewTypeLabel('')
      return
    }
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `type-${Date.now()}`
    setAddingType(true)
    try {
      const res = await authFetch('/api/config/item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'appointment_types', key, label, sortOrder: apptTypeOptions.length + 1 }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Could not add the appointment type')
      }
      clearConfigCache()
      setForm((prev) => ({ ...prev, type: key }))
      setAddTypeOpen(false)
      setNewTypeLabel('')
      toast.success(`"${label}" added to appointment types`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the appointment type')
    } finally {
      setAddingType(false)
    }
  }

  const apptStatusOptions = (!apptStatusesLoading && configApptStatuses.length > 0)
    ? configApptStatuses.map((s) => ({ key: s.key, label: s.label }))
    : APPT_STATUSES_FALLBACK
  const [fetchError, setFetchError] = useState(false)
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const { searchQuery: globalSearchQuery, setSearchQuery: setGlobalSearchQuery, user } = useAppStore()
  const canManage = user?.role === 'super_admin' || user?.role === 'admin'
  // Cancelled-appointment popup: who can reschedule from it (mirrors the
  // backend's ADMIN_ONLY_STATUSES role check) and who can additionally delete.
  const canManageCancelled = canManage || user?.role === 'receptionist'
  const canDeleteAppt = canDeleteAppointments(user?.role)
  // The appointments API already scopes therapist_* roles to their own
  // appointments (see GET /api/appointments) — the grid must match that by
  // showing only their own column, not every therapist's (empty) column.
  const isTherapistRole = !!user?.role && (user.role.startsWith('therapist') || user.role === 'psychologist')

  // Reusable debounced search — replaces the old 400ms timer logic.
  const { query, debouncedQuery, setQuery, isDebouncing, clear } = useDebouncedSearch(globalSearchQuery)

  // Action dialog state (Task 6 & 7)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [noShowOpen, setNoShowOpen] = useState(false)
  const [actionTarget, setActionTarget] = useState<Appointment | null>(null)
  // Action history for the selected appointment (fetched from /api/action-log)
  const [actionHistory, setActionHistory] = useState<Array<{
    id: string; actionType: string; notes: string; performedByName: string; userRole: string; timestamp: string
  }>>([])
  const [rescheduleForm, setRescheduleForm] = useState({ date: '', startTime: '10:00', endTime: '10:45', therapistId: '' })
  // Bumped after every appointment action so the parents' reschedule-request
  // panel re-fetches (a reschedule approves the request server-side).
  const [rescheduleRequestsKey, setRescheduleRequestsKey] = useState(0)
  // Cancelled-appointment popup + delete-confirmation state
  const [cancelledMenuOpenId, setCancelledMenuOpenId] = useState<string | null>(null)
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<Appointment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [rescheduledToday, setRescheduledToday] = useState(0)
  // Upcoming Appointments (all future dates, not scoped to the Schedule
  // tab's selected day/week/month) — fetched independently so the KPI card
  // stays accurate even before the user opens the Upcoming tab.
  const [upcomingItems, setUpcomingItems] = useState<Appointment[]>([])
  const [upcomingLoading, setUpcomingLoading] = useState(true)
  const [upcomingError, setUpcomingError] = useState<string | null>(null)
  const [sessionForm, setSessionForm] = useState({
    sessionFocus: '',
    goalTargeted: '',
    progressAchieved: '',
    sessionRemarks: '',
    actualDuration: 45,
  })

  // Sync global search to local searchQuery (preserves cross-module search behaviour)
  useEffect(() => {
    if (globalSearchQuery) {
      setQuery(globalSearchQuery)
      setGlobalSearchQuery('')
    }
  }, [globalSearchQuery, setGlobalSearchQuery, setQuery])

  // ── Form state ──────────────────────────────────────
  const [form, setForm] = useState({
    patientId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '10:00',
    endTime: '10:45',
    therapist: '',
    type: 'consultation',
    notes: '',
    plannedDuration: 45,
    isHistorical: false,
    patientPackageId: '',
  })

  // Packages available for the currently-selected patient in the create-
  // appointment form — lets a manually-created session link to a package
  // (patientPackageId) instead of always being created unlinked. Without
  // this, every manually-scheduled session (as opposed to ones auto-created
  // by the "Assign Package" wizard) permanently has patientPackageId = null,
  // which is exactly what made Package Info show 0 used / 12 not-scheduled
  // for sessions that were actually completed.
  const [formPatientPackages, setFormPatientPackages] = useState<Array<{ id: string; name: string | null; sessionsPurchased: number; sessionsCompletedActual?: number; sessionsRemaining?: number }>>([])
  useEffect(() => {
    if (!form.patientId) {
      setFormPatientPackages([])
      return
    }
    let cancelled = false
    authFetch(`/api/patient-packages?patientId=${form.patientId}`)
      .then((res) => (res.ok ? res.json() : { packages: [] }))
      .then((json) => {
        if (cancelled) return
        const packages = json.packages || []
        setFormPatientPackages(packages)
        // Auto-select when there's exactly one package still open (not
        // fully used up) and nothing chosen yet — mirrors the same
        // auto-select the Invoice form does for its sole unpaid package.
        // The link is what makes a session actually count against the
        // package's Used/Remaining/"not scheduled" figures, and it's easy
        // to forget since it's an optional field — this is exactly what
        // caused two real patients' fully-purchased sessions to keep
        // showing "not scheduled" even after appointments were meant to be
        // booked for them.
        const openPackages = packages.filter((p: { sessionsPurchased: number; sessionsCompletedActual?: number }) =>
          (p.sessionsCompletedActual ?? 0) < p.sessionsPurchased)
        if (openPackages.length === 1 && !form.patientPackageId) {
          setForm((prev) => (prev.patientPackageId ? prev : { ...prev, patientPackageId: openPackages[0].id }))
        }
      })
      .catch(() => { if (!cancelled) setFormPatientPackages([]) })
    return () => { cancelled = true }
  }, [form.patientId])

  // ── API calls ───────────────────────────────────────

  const fetchAppointments = useCallback(async () => {
    setLoading(true)
    setFetchError(false)
    try {
      const { start, end } = computeRange(selectedDate, rangeFilter)
      const params = new URLSearchParams()
      params.set('startDate', format(start, 'yyyy-MM-dd'))
      params.set('endDate', format(end, 'yyyy-MM-dd'))
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (therapistFilter !== 'all') params.set('therapistId', therapistFilter)
      if (debouncedQuery) params.set('search', debouncedQuery)
      params.set('limit', '500')
      const res = await authFetch(`/api/appointments?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setAppointments(json.appointments || [])
      } else if (res.status !== 401) {
        // 401 is handled by authFetch (auto-logout); other errors set the error flag
        setFetchError(true)
      }
    } catch (err) {
      // "Failed to fetch" — server unreachable or network error.
      // Don't crash the page; show a retry option instead.
      console.error('Failed to fetch appointments:', err)
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [selectedDate, rangeFilter, statusFilter, therapistFilter, debouncedQuery])

  const fetchUpcoming = useCallback(async () => {
    setUpcomingLoading(true)
    setUpcomingError(null)
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      const res = await authFetch(`/api/appointments?startDate=${today}&limit=500`)
      if (!res.ok) throw new Error('Failed to load upcoming appointments')
      const data = await res.json()
      const list: Appointment[] = Array.isArray(data) ? data : data.appointments || []
      const upcoming = list
        .filter((a) => !['cancelled', 'completed', 'no_show'].includes(a.status))
        // Descending — farthest-out date/time first.
        .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime))
      setUpcomingItems(upcoming)
    } catch (err) {
      console.error('Failed to fetch upcoming appointments:', err)
      setUpcomingError('Failed to load upcoming appointments.')
    } finally {
      setUpcomingLoading(false)
    }
  }, [])

  const fetchPatients = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '200', search: patientSearch })
      const res = await authFetch(`/api/patients?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setPatients(json.patients || [])
      }
    } catch (err) {
      const isNetwork = err instanceof TypeError && err.message.toLowerCase().includes('failed to fetch')
      if (isNetwork) {
        console.warn('Patients: network unavailable (dev server may be restarting).')
      } else {
        console.error('Failed to fetch patients:', err)
      }
    }
  }, [patientSearch])

  const fetchTherapists = useCallback(async () => {
    try {
      const res = await authFetch('/api/users')
      if (res.ok) {
        const json = await res.json()
        const therapistRoles = new Set(['therapist_speech', 'therapist_ot', 'therapist_behavioral', 'therapist_remedial', 'psychologist'])
        // isActive !== false (not a strict === true) so accounts predating
        // this field default to visible rather than vanishing.
        const loaded = Array.isArray(json) ? json.filter((u: Therapist) => u?.name && takesTherapySessions(u, [...therapistRoles]) && u.isActive !== false) : []
        setTherapists(loaded)
      }
    } catch { /* silent */ }
  }, [])

  // Rescheduled-today count — derived from the appointments list by STATUS
  // (not the action log). Counting by status ensures the box reflects the
  // current set of appointments that are still in the 'rescheduled' state and
  // dated today, rather than historical action-log entries which would
  // over-count (an appointment rescheduled then completed still has an old
  // 'rescheduled' action-log row). (RESCHEDULED-TODAY-BOX-FIX)
  const rescheduledTodayCount = useMemo(() => appointments.filter((a) => {
    if (a.status !== 'rescheduled') return false
    const today = format(new Date(), 'yyyy-MM-dd')
    return format(new Date(a.date), 'yyyy-MM-dd') === today
  }).length, [appointments])

  // Kept for back-compat with any callers — now a no-op that syncs the derived
  // count into the existing state variable so the UI binding stays unchanged.
  const fetchRescheduledToday = useCallback(async () => {
    setRescheduledToday(rescheduledTodayCount)
  }, [rescheduledTodayCount])

  useEffect(() => { fetchAppointments() }, [fetchAppointments])
  useEffect(() => { fetchUpcoming() }, [fetchUpcoming])
  useEffect(() => { fetchPatients() }, [fetchPatients])
  useEffect(() => { fetchTherapists() }, [fetchTherapists])
  useEffect(() => { fetchRescheduledToday() }, [fetchRescheduledToday])

  useEffect(() => {
    setCurrentPage(1)
  }, [appointments.length])

  // ── Create appointment ──────────────────────────────

  const handleCreate = async () => {
    if (!form.patientId) {
      toast.error('Please select a patient')
      return
    }
    if (creating) return
    setCreating(true)
    try {
      const res = await authFetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          therapistId: form.therapist || null,
          title: `Appointment - ${form.type}`,
          patientPackageId: form.patientPackageId || undefined,
        }),
      })
      if (res.ok) {
        toast.success('Appointment scheduled successfully')
        setDialogOpen(false)
        setForm({ patientId: '', date: format(selectedDate, 'yyyy-MM-dd'), startTime: '10:00', endTime: '10:45', therapist: '', type: 'consultation', notes: '', plannedDuration: 45, isHistorical: false, patientPackageId: '' })
        fetchAppointments()
        fetchUpcoming()
      } else {
        const json = await res.json()
        toast.error(json.error || 'Failed to create appointment')
      }
    } catch {
      toast.error('Failed to create appointment')
    } finally {
      setCreating(false)
    }
  }

  // ── Task 6 / 7 action handlers ─────────────────────

  const openReschedule = (apt: Appointment) => {
    setActionTarget(apt)
    const baseDate =
      typeof apt.date === 'string' && apt.date.length >= 10
        ? apt.date.slice(0, 10)
        : format(new Date(), 'yyyy-MM-dd')
    setRescheduleForm({
      date: baseDate,
      startTime: apt.startTime || '10:00',
      endTime: apt.endTime || '10:45',
      therapistId: apt.therapistId || '',
    })
    setRescheduleOpen(true)
  }

  // Approve a parent's request: open the normal reschedule dialog on that
  // appointment, prefilled with the parent's preferred slot (keeping the
  // appointment's own duration). Saving it approves the request.
  const openRescheduleFromRequest = (req: PendingRescheduleRequest) => {
    openReschedule(req.appointment as Appointment)
    const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    const duration = Math.max(toMin(req.appointment.endTime) - toMin(req.appointment.startTime), SLOT_DURATION_MIN)
    setRescheduleForm((prev) => {
      const next = { ...prev }
      if (req.preferredDate) next.date = format(new Date(req.preferredDate), 'yyyy-MM-dd')
      if (req.preferredTime) {
        const end = toMin(req.preferredTime) + duration
        next.startTime = req.preferredTime
        next.endTime = `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
      }
      return next
    })
  }

  const openCancel = (apt: Appointment) => {
    setActionTarget(apt)
    setCancelOpen(true)
  }

  const openComplete = (apt: Appointment) => {
    setActionTarget(apt)
    setSessionForm({
      sessionFocus: apt.sessionFocus || '',
      goalTargeted: apt.goalTargeted || '',
      progressAchieved: apt.progressAchieved || '',
      sessionRemarks: apt.sessionRemarks || '',
      actualDuration: 45,
    })
    setCompleteOpen(true)
  }

  const openNoShow = (apt: Appointment) => {
    setActionTarget(apt)
    setNoShowOpen(true)
  }

  const refreshAfterAction = (updated: Appointment | null) => {
    setRescheduleRequestsKey((k) => k + 1)
    fetchAppointments()
    fetchRescheduledToday()
    fetchUpcoming()
    if (updated) {
      setSelectedAppointment((prev) => (prev && prev.id === updated.id ? updated : prev))
      // Refresh action history after a status change
      fetchActionHistory(updated.id)
    }
  }

  // Fetch action history for a specific appointment from /api/action-log
  const fetchActionHistory = async (appointmentId: string) => {
    try {
      const res = await authFetch(`/api/action-log?module=appointments&recordId=${appointmentId}`)
      if (res.ok) {
        const json = await res.json()
        setActionHistory(json.logs || [])
      }
    } catch {
      // Silent — action history is a nice-to-have
    }
  }

  // When selectedAppointment changes, fetch its action history
  useEffect(() => {
    if (selectedAppointment?.id) {
      fetchActionHistory(selectedAppointment.id)
    } else {
      setActionHistory([])
    }
  }, [selectedAppointment?.id])

  // onConfirm handlers — ActionDialog handles success/error toasts + dialog close.
  // Each handler receives the user-entered notes and saves them to the appointment's
  // notes field so they persist in the record (not just in ActionLog).
  const confirmReschedule = async (notes: string) => {
    if (!actionTarget) return
    if (!rescheduleForm.date || !rescheduleForm.startTime || !rescheduleForm.endTime) {
      throw new Error('Please pick a new date and time slot')
    }
    const res = await authFetch('/api/appointments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: actionTarget.id,
        // Lands back on 'scheduled' — a concrete new slot is being set here,
        // so this is the reschedule APPROVAL, not a pending request. See
        // ADMIN_ONLY_STATUSES / isRescheduleAction in the appointments API.
        status: 'scheduled',
        date: rescheduleForm.date,
        startTime: rescheduleForm.startTime,
        endTime: rescheduleForm.endTime,
        ...(rescheduleForm.therapistId ? { therapistId: rescheduleForm.therapistId } : {}),
        notes: notes.trim(),
      }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json.error || 'Failed to reschedule appointment')
    }
    const updated = (await res.json()) as Appointment
    setActionTarget(null)
    refreshAfterAction(updated)
  }

  // Delete a cancelled appointment (transaction handled server-side).
  // Removes it from local state immediately so every view sharing
  // `appointments` (grid, table, counts) updates without a page refresh.
  const confirmDeleteAppointment = async () => {
    if (!deleteConfirmTarget) return
    const id = deleteConfirmTarget.id
    setDeleting(true)
    try {
      const res = await authFetch(`/api/appointments?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'Failed to delete appointment')
      }
      setAppointments((prev) => prev.filter((a) => a.id !== id))
      setUpcomingItems((prev) => prev.filter((a) => a.id !== id))
      setSelectedAppointment((prev) => (prev && prev.id === id ? null : prev))
      setDeleteConfirmTarget(null)
      toast.success('Appointment deleted successfully')
      fetchRescheduledToday()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete appointment')
    } finally {
      setDeleting(false)
    }
  }

  const confirmCancel = async (notes: string) => {
    if (!actionTarget) return
    const reason = notes.trim() || 'Cancelled — see action log entry'
    const res = await authFetch('/api/appointments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: actionTarget.id,
        status: 'cancelled',
        cancellationReason: reason,
      }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json.error || 'Failed to cancel appointment')
    }
    const updated = (await res.json()) as Appointment
    setActionTarget(null)
    refreshAfterAction(updated)
  }

  const confirmComplete = async (notes: string) => {
    if (!actionTarget) return
    const focus = sessionForm.sessionFocus.trim()
    const goal = sessionForm.goalTargeted.trim()
    const progress = sessionForm.progressAchieved.trim()
    const remarks = sessionForm.sessionRemarks.trim()
    if (!focus || !goal || !progress || !remarks) {
      throw new Error('Please fill in all session details')
    }
    const res = await authFetch('/api/appointments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: actionTarget.id,
        status: 'completed',
        sessionFocus: focus,
        goalTargeted: goal,
        progressAchieved: progress,
        sessionRemarks: remarks,
        actualDuration: sessionForm.actualDuration,
        notes: notes.trim(),
      }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      let msg = json.error || 'Failed to complete appointment'
      if (Array.isArray(json.missing) && json.missing.length > 0) {
        msg += ` (missing: ${json.missing.join(', ')})`
      }
      throw new Error(msg)
    }
    const updated = (await res.json()) as Appointment
    setActionTarget(null)
    refreshAfterAction(updated)
  }

  // Revert a completed appointment back to "scheduled" — the linked
  // package's Used Sessions count is decremented server-side (symmetric to
  // the increment on completion), so Package Info reflects the undo
  // immediately once refreshAfterAction re-fetches.
  const [undoingCompleteId, setUndoingCompleteId] = useState<string | null>(null)
  const handleUndoComplete = async (apt: Appointment) => {
    if (undoingCompleteId) return
    if (!confirm('Undo completion for this session? It will return to "Scheduled" and its package session count will be reduced by one.')) return
    setUndoingCompleteId(apt.id)
    try {
      const res = await authFetch('/api/appointments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: apt.id, status: 'scheduled' }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        toast.error(json.error || 'Failed to undo completion')
        return
      }
      const updated = (await res.json()) as Appointment
      toast.success('Completion undone')
      refreshAfterAction(updated)
    } catch {
      toast.error('Failed to undo completion')
    } finally {
      setUndoingCompleteId(null)
    }
  }

  const confirmNoShow = async (notes: string) => {
    if (!actionTarget) return
    const res = await authFetch('/api/appointments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: actionTarget.id,
        status: 'no_show',
        notes: notes.trim(),
      }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json.error || 'Failed to mark as no show')
    }
    const updated = (await res.json()) as Appointment
    setActionTarget(null)
    refreshAfterAction(updated)
  }

  // ── Export to Excel (respects currently active filters — appointments
  // state is already scoped by date range / status / therapist / search) ──
  const [exportingAppointments, setExportingAppointments] = useState(false)
  const handleExportAppointments = async () => {
    if (exportingAppointments) return
    setExportingAppointments(true)
    try {
      const headers = ['Patient', 'Patient ID', 'Session/Title', 'Date', 'Start Time', 'End Time', 'Therapist', 'Designation', 'Type', 'Status', 'Notes']
      const rows = appointments.map((apt) => [
        apt.patient?.childName || apt.title || 'Unknown',
        apt.patient?.patientId || '',
        apt.title || '',
        format(new Date(apt.date), 'dd MMM yyyy'),
        formatTimeDisplay(apt.startTime),
        formatTimeDisplay(apt.endTime),
        apt.therapistId || '',
        (() => {
          const match = therapists.find((t) => t.name === apt.therapistId)
          return match ? resolveDisplayDesignation(match.designation, match.role, match.secondaryRole) : ''
        })(),
        resolveAppointmentTypeLabel(apptTypeLabel(apt.type), apt.therapistId, therapists),
        getStatusCfg(apt.status).label,
        apt.notes || '',
      ])
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      ws['!cols'] = [
        { wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 10 },
        { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 30 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Appointments')
      XLSX.writeFile(wb, 'Appointments.xlsx')
    } finally {
      setExportingAppointments(false)
    }
  }

  // ── Derived stats ───────────────────────────────────
  const total = appointments.length
  const cancelled = useMemo(() => appointments.filter(a => a.status === 'cancelled').length, [appointments])
  const completed = useMemo(() => appointments.filter(a => a.status === 'completed').length, [appointments])
  // Derived from `upcomingItems`, which scans ALL future appointments
  // regardless of date range — unlike `appointments` above, which is scoped
  // to the Schedule tab's selected day/week/month. Using that range-scoped
  // count made this KPI card show a tiny number (e.g. 3) while the Upcoming
  // Appointments panel below correctly listed 156.
  const upcomingCount = upcomingItems.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const paginatedAppointments = useMemo(
    () => appointments.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [appointments, currentPage, pageSize]
  )

  // Grid helpers
  // Therapists see only their own column; admins/receptionists see up to 4.
  const gridTherapists = useMemo(
    () => (isTherapistRole ? therapists.filter(t => t.name === user?.name) : therapists.slice(0, 4)),
    [therapists, isTherapistRole, user?.name]
  )

  // Match appointments to a time slot (45-min intervals). Grouped by
  // therapistId first via useMemo so each cell only filters that therapist's
  // (much smaller) appointment list instead of the full array — the exact
  // same per-slot window-matching logic is preserved to avoid any drift from
  // the grid's actual (break-aware) slot boundaries.
  const appointmentsByTherapist = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const a of appointments) {
      if (!a.therapistId) continue
      if (!map.has(a.therapistId)) map.set(a.therapistId, [])
      map.get(a.therapistId)!.push(a)
    }
    return map
  }, [appointments])

  const aptsFor = (therapistId: string, slotStart: string) =>
    (appointmentsByTherapist.get(therapistId) || []).filter(a => {
      const [slotH, slotM] = slotStart.split(':').map(Number)
      const slotStartMin = slotH * 60 + slotM
      const slotEndMin = slotStartMin + SLOT_DURATION_MIN
      const [aptH, aptM] = (a.startTime || '00:00').split(':').map(Number)
      const aptStartMin = aptH * 60 + aptM
      return aptStartMin >= slotStartMin && aptStartMin < slotEndMin
    })

  // Range-aware date label (Task 17)
  const dateLabel = (() => {
    if (rangeFilter === 'today') return format(selectedDate, 'd MMMM yyyy, EEEE')
    const { start, end } = computeRange(selectedDate, rangeFilter)
    return `${format(start, 'd MMM yyyy')} – ${format(end, 'd MMM yyyy')}`
  })()

  // Range-aware KPI title (Task 17)
  const kpiRangeTitle =
    rangeFilter === 'today'
      ? "Today's Appointments"
      : rangeFilter === 'week'
        ? "This Week's Appointments"
        : "This Month's Appointments"

  // ── Loading skeleton ────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <Skeleton className="h-[500px] w-full rounded-2xl" />
      </div>
    )
  }

  // ── Error state (server unreachable / network error) ─────
  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <XCircle className="h-8 w-8 text-red-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Connection Error</h2>
        <p className="text-sm text-gray-500 max-w-md">
          Unable to fetch appointments. The server may be restarting or there may be a network issue.
        </p>
        <Button onClick={() => fetchAppointments()} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
          <RotateCcw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">

      {/* ══════════════════════ HEADER ══════════════════════ */}
      <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center flex-wrap gap-y-2 justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
            <CalendarDays className="w-4.5 h-4.5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 leading-tight">Appointments</h1>
            <p className="text-xs text-gray-500">Manage sessions and reminders</p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border border-green-500 text-green-600 text-sm font-medium hover:bg-green-50 transition-colors">
            <MessageCircle className="w-4 h-4" />
            WhatsApp Bulk Reminder
          </button>

          <SearchInput
            value={query}
            onChange={setQuery}
            onClear={clear}
            loading={isDebouncing || loading}
            placeholder="Search by patient, therapist..."
            className="w-full sm:w-56"
          />

          <button className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 relative shrink-0">
            <Bell className="w-4.5 h-4.5 text-gray-500" />
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 text-white text-[8px] rounded-full flex items-center justify-center font-bold">8</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4 space-y-4">

        {user && RESCHEDULE_STAFF_ROLES.includes(user.role) && (
          <RescheduleRequestsPanel refreshKey={rescheduleRequestsKey} onApprove={openRescheduleFromRequest} />
        )}

        {/* ══════════════════════ KPI CARDS ══════════════════════ */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Today's Appointments — blue gradient */}
          <div className="stat-card-premium stat-grad-blue flex items-center justify-between p-3">
            <div className="relative z-10">
              <p className="text-xs text-white/80 font-medium">{kpiRangeTitle}</p>
              <p className="text-2xl font-bold text-white mt-1">{total}</p>
              <p className="text-[11px] text-white/70 font-medium mt-1 cursor-pointer hover:underline">View today</p>
            </div>
            <div className="stat-icon-premium relative z-10">
              <CalendarDays className="w-6 h-6 text-white" />
            </div>
          </div>

          {/* Upcoming Appointments — sky gradient, jumps to the Upcoming tab */}
          <div
            className="stat-card-premium stat-grad-blue flex items-center justify-between p-3 cursor-pointer"
            onClick={() => setActiveView('upcoming')}
          >
            <div className="relative z-10">
              <p className="text-xs text-white/80 font-medium">Upcoming Appointments</p>
              <p className="text-2xl font-bold text-white mt-1">{upcomingCount}</p>
              <p className="text-[11px] text-white/70 font-medium mt-1 hover:underline">View upcoming</p>
            </div>
            <div className="stat-icon-premium relative z-10">
              <Clock className="w-6 h-6 text-white" />
            </div>
          </div>

          {/* Cancelled — red/pink gradient */}
          <div className="stat-card-premium stat-grad-red flex items-center justify-between p-3">
            <div className="relative z-10">
              <p className="text-xs text-white/80 font-medium">Cancelled</p>
              <p className="text-2xl font-bold text-white mt-1">{cancelled}</p>
              <p className="text-[11px] text-white/70 mt-1">{total ? Math.round((cancelled / total) * 100) : 0}%</p>
            </div>
            <div className="stat-icon-premium relative z-10">
              <XCircle className="w-6 h-6 text-white" />
            </div>
          </div>

          {/* Rescheduled Today — purple gradient */}
          <div className="stat-card-premium stat-grad-purple flex items-center justify-between p-3">
            <div className="relative z-10">
              <p className="text-xs text-white/80 font-medium">Rescheduled Today</p>
              <p className="text-2xl font-bold text-white mt-1">{rescheduledToday}</p>
              <p className="text-[11px] text-white/70 mt-1">moved to other days</p>
            </div>
            <div className="stat-icon-premium relative z-10">
              <RotateCcw className="w-6 h-6 text-white" />
            </div>
          </div>

          {/* Completed — green/teal gradient */}
          <div className="stat-card-premium stat-grad-green flex items-center justify-between p-3">
            <div className="relative z-10">
              <p className="text-xs text-white/80 font-medium">Completed</p>
              <p className="text-2xl font-bold text-white mt-1">{completed}</p>
              <p className="text-[11px] text-white/70 mt-1">{total ? Math.round((completed / total) * 100) : 0}%</p>
            </div>
            <div className="stat-icon-premium relative z-10">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        {/* ══════════════════════ VIEW TABS ══════════════════════ */}
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden bg-white">
          <button
            onClick={() => setActiveView('schedule')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeView === 'schedule' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Schedule
          </button>
          <button
            onClick={() => setActiveView('upcoming')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeView === 'upcoming' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Upcoming Appointments
          </button>
        </div>

        {activeView === 'schedule' && (
        <>
        {/* ══════════════════════ FILTER BAR ══════════════════════ */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3 flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setSelectedDate(d => addDays(d, -1))}
            className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>

          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button className="text-sm font-semibold text-gray-800 hover:text-blue-600 transition-colors whitespace-nowrap">
                {dateLabel}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={d => { if (d) { setSelectedDate(d); setCalendarOpen(false) } }}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <button
            onClick={() => setSelectedDate(d => addDays(d, 1))}
            className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50"
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>

          <button
            onClick={() => setSelectedDate(new Date())}
            className="px-4 py-1.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
          >
            Today
          </button>

          {/* Today / Weekly / Monthly range toggle (Task 17) */}
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
            {(['today', 'week', 'month'] as RangeFilter[]).map((r) => (
              <button
                key={r}
                onClick={() => setRangeFilter(r)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  rangeFilter === r
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {r === 'today' ? 'Today' : r === 'week' ? 'Weekly' : 'Monthly'}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Therapist filter — meaningless for a therapist login (they only
              ever see their own appointments), so hide it entirely there. */}
          {!isTherapistRole && (
            <Select value={therapistFilter} onValueChange={setTherapistFilter}>
              <SelectTrigger className="w-40 h-8 text-sm border-gray-200 bg-white">
                <SelectValue placeholder="All Therapists" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Therapists</SelectItem>
                {therapists.map(t => (
                  <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-8 text-sm border-gray-200 bg-white">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {apptStatusOptions.map((s) => (
                <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            onClick={() => {
              setDialogOpen(true)
              setForm(prev => ({ ...prev, date: format(selectedDate, 'yyyy-MM-dd') }))
            }}
            className="flex items-center gap-2 px-5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Appointment
          </button>
        </div>

        {/* ══════════════════════ GRID + PANEL ══════════════════════ */}
        <div className="flex gap-4 min-h-0" style={{ height: 'calc(100vh - 340px)' }}>

          {/* ── Schedule Grid ── */}
          <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">

            {/* Therapist column headers */}
            <div
              className="grid border-b-2 border-gray-200 bg-gray-50/80 shrink-0"
              style={{ gridTemplateColumns: `88px repeat(${Math.max(gridTherapists.length, 1)}, 1fr)` }}
            >
              <div className="py-3 px-3 text-xs font-semibold text-gray-500 border-r-2 border-gray-200">Time</div>
              {gridTherapists.map(th => (
                <div key={th.id} className="py-3 px-3 border-r-2 border-gray-200 last:border-r-0 flex items-center gap-2">
                  <TherapistAvatar name={th.name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-800 truncate">{th.name}</p>
                    <p className="text-[10px] text-gray-500 truncate">{resolveDisplayDesignation(th.designation, th.role)}</p>
                  </div>
                </div>
              ))}
              {gridTherapists.length === 0 && (
                <div className="py-3 px-3 text-xs text-gray-400">No therapists found</div>
              )}
            </div>

            {/* Time rows */}
            <div className="overflow-y-auto flex-1">
              {TIME_ROWS.map(timeRow => {
                return (
                  <div
                    key={timeRow}
                    className="grid border-b-2 border-gray-200 last:border-b-0 min-h-[56px]"
                    style={{ gridTemplateColumns: `88px repeat(${Math.max(gridTherapists.length, 1)}, 1fr)` }}
                  >
                    <div className="px-2 py-2 text-xs text-gray-400 font-semibold border-r-2 border-gray-200 flex flex-col items-end justify-center leading-tight">
                      <span>{formatTimeDisplay(timeRow)}</span>
                      <span className="text-[9px] text-gray-300 font-normal">
                        {(() => {
                          const [h, m] = timeRow.split(':').map(Number)
                          const endMin = h * 60 + m + SLOT_DURATION_MIN
                          const endH = Math.floor(endMin / 60)
                          const endM = endMin % 60
                          return formatTimeDisplay(`${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`)
                        })()}
                      </span>
                    </div>
                    {gridTherapists.map(th => {
                      const colApts = aptsFor(th.name, timeRow)
                      return (
                        <div key={th.id} className="border-r-2 border-gray-200 last:border-r-0 p-1.5 min-w-0">
                          {colApts.map(apt => (
                            apt.status === 'cancelled' && canManageCancelled ? (
                              <DropdownMenu
                                key={apt.id}
                                open={cancelledMenuOpenId === apt.id}
                                onOpenChange={(open) => setCancelledMenuOpenId(open ? apt.id : null)}
                              >
                                <DropdownMenuTrigger asChild>
                                  <div>
                                    <AptCard
                                      name={apt.patient?.childName || apt.title}
                                      start={apt.startTime}
                                      end={apt.endTime}
                                      status={apt.status}
                                      selected={selectedAppointment?.id === apt.id}
                                      onClick={() => {}}
                                    />
                                  </div>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-44">
                                  <DropdownMenuItem onClick={() => { setCancelledMenuOpenId(null); openReschedule(apt) }}>
                                    <RotateCcw className="w-4 h-4 mr-2 text-amber-500" />
                                    Reschedule
                                  </DropdownMenuItem>
                                  {canDeleteAppt && (
                                    <DropdownMenuItem
                                      onClick={() => { setCancelledMenuOpenId(null); setDeleteConfirmTarget(apt) }}
                                      className="text-red-600 focus:text-red-700"
                                    >
                                      <Trash2 className="w-4 h-4 mr-2 text-red-500" />
                                      Delete
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <AptCard
                                key={apt.id}
                                name={apt.patient?.childName || apt.title}
                                start={apt.startTime}
                                end={apt.endTime}
                                status={apt.status}
                                selected={selectedAppointment?.id === apt.id}
                                onClick={() => setSelectedAppointment(apt)}
                              />
                            )
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* Add Appointment row */}
              <div
                className="grid border-t border-gray-100 py-2 shrink-0"
                style={{ gridTemplateColumns: `88px repeat(${Math.max(gridTherapists.length, 1)}, 1fr)` }}
              >
                <div />
                {gridTherapists.map(th => (
                  <div key={th.id} className="border-r border-gray-100 last:border-r-0 px-2 flex items-center justify-center">
                    <button
                      onClick={() => {
                        setForm(prev => ({ ...prev, therapist: th.name, date: format(selectedDate, 'yyyy-MM-dd') }))
                        setDialogOpen(true)
                      }}
                      className="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 font-medium transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Add Appointment
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-5 px-5 py-2.5 border-t border-gray-100 bg-gray-50/60 shrink-0">
              {[
                { dot: 'bg-sky-400', label: 'Scheduled' },
                { dot: 'bg-green-500', label: 'Completed' },
                { dot: 'bg-orange-500', label: 'Rescheduled' },
                { dot: 'bg-red-500', label: 'Cancelled' },
                { dot: 'bg-purple-500', label: 'No Show' },
              ].map(l => (
                <span key={l.label} className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className={`w-2 h-2 rounded-full ${l.dot}`} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>

          {/* ── Right Detail Panel ── */}
          <div className="w-72 shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            {selectedAppointment ? (
              <>
                {/* Panel header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
                  <p className="text-sm font-bold text-gray-900">Appointment Details</p>
                  <button
                    onClick={() => setSelectedAppointment(null)}
                    className="w-6 h-6 flex items-center justify-center hover:bg-gray-100 rounded-full"
                  >
                    <X className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {/* Patient profile */}
                  <div className="px-4 pt-3 pb-3 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-300 to-orange-400 flex items-center justify-center text-white text-base font-bold shrink-0">
                        {(selectedAppointment.patient?.childName || '?')[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{selectedAppointment.patient?.childName || 'Unknown'}</p>
                        <p className="text-[11px] text-gray-500">{selectedAppointment.patient?.patientId || '—'}</p>
                        {selectedAppointment.patient?.mobile && (
                          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-gray-500">
                            <Phone className="w-3 h-3" />
                            {selectedAppointment.patient.mobile}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="px-4 py-3 border-b border-gray-100 space-y-1.5">
                    <DetailRow
                      icon={<span className="text-sm">📋</span>}
                      label="Title"
                      value={selectedAppointment.title || 'Appointment'}
                    />
                    <DetailRow
                      icon={<span className="text-sm">🩺</span>}
                      label="Type"
                      value={selectedAppointment.type || 'Consultation'}
                    />
                    <DetailRow
                      icon={<span className="text-sm">👨‍⚕️</span>}
                      label="Therapist"
                      value={selectedAppointment.therapistId || '—'}
                    />
                    <DetailRow
                      icon={<span className="text-sm">📅</span>}
                      label="Date"
                      value={format(new Date(selectedAppointment.date), 'dd MMMM yyyy')}
                    />
                    <DetailRow
                      icon={<span className="text-sm">⏰</span>}
                      label="Time"
                      value={`${formatTimeDisplay(selectedAppointment.startTime)} - ${formatTimeDisplay(selectedAppointment.endTime)}`}
                    />
                    <DetailRow
                      icon={<span className={`w-2.5 h-2.5 rounded-full inline-block ${getStatusCfg(selectedAppointment.status).dot}`} />}
                      label="Status"
                      value={
                        <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${getStatusCfg(selectedAppointment.status).badge}`}>
                          {getStatusCfg(selectedAppointment.status).label}
                        </span>
                      }
                    />
                    {selectedAppointment.notes && (
                      <DetailRow
                        icon={<span className="text-sm">📝</span>}
                        label="Notes"
                        value={selectedAppointment.notes}
                      />
                    )}
                  </div>

                  {/* Actions — role-based: Admin gets management actions, Therapist gets workflow actions */}
                  <div className="px-4 py-3 border-b border-gray-100">
                    {canManage ? (
                      <>
                        <p className="text-xs font-bold text-gray-800 mb-2.5">Admin Actions</p>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="w-full justify-between" size="sm">
                              <span className="flex items-center gap-2">
                                <MoreVertical className="w-4 h-4" />
                                Manage Appointment
                              </span>
                              <ChevronDown className="w-3.5 w-3.5 text-gray-400" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>Manage Appointment</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openReschedule(selectedAppointment)}>
                              <RotateCcw className="w-4 h-4 mr-2 text-amber-500" />
                              Reschedule
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => openNoShow(selectedAppointment)}
                              className="text-orange-600 focus:text-orange-700"
                            >
                              <UserX className="w-4 h-4 mr-2 text-orange-500" />
                              No Show
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openCancel(selectedAppointment)}
                              className="text-red-600 focus:text-red-700"
                            >
                              <XCircle className="w-4 h-4 mr-2 text-red-500" />
                              Cancel Appointment
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {/* Admin Override — complete appointment in special cases only */}
                            {selectedAppointment.status === 'completed' ? (
                              <DropdownMenuItem
                                onClick={() => handleUndoComplete(selectedAppointment)}
                                className="text-amber-600 focus:text-amber-700"
                                disabled={undoingCompleteId === selectedAppointment.id}
                              >
                                <RotateCcw className="w-4 h-4 mr-2 text-amber-500" />
                                Undo Completion
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => openComplete(selectedAppointment)}
                                className="text-green-600 focus:text-green-700"
                              >
                                <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                                Override: Complete (Special Cases)
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <p className="text-[10px] text-gray-400 mt-2 italic">
                          Admin override for completing appointments should only be used in special cases (therapist absent, emergency, manual correction, system error).
                        </p>
                      </>
                    ) : (
                      <TherapistWorkflowActions appointment={selectedAppointment} onUpdated={(updated) => {
                        setSelectedAppointment(updated)
                        fetchAppointments()
                      }} onComplete={openComplete} />
                    )}
                  </div>

                  {/* Package Information Panel */}
                  {selectedAppointment.patientId && (
                    <PackageInfoPanel
                      patientId={selectedAppointment.patientId}
                      patientPackageId={selectedAppointment.patientPackageId}
                      refreshKey={`${selectedAppointment.id}:${selectedAppointment.status}`}
                    />
                  )}

                  {/* Session Notes Section (editable when in_progress, read-only when completed) */}
                  {(selectedAppointment.status === 'in_progress' || selectedAppointment.status === 'completed') && (
                    <SessionNotesSection
                      appointment={selectedAppointment}
                      onSave={(notes) => {
                        setSelectedAppointment({ ...selectedAppointment, sessionRemarks: notes })
                        fetchAppointments()
                      }}
                    />
                  )}

                  {/* Progress Tracking Section (shown when completed) */}
                  {selectedAppointment.status === 'completed' && (
                    <ProgressTrackingSection appointment={selectedAppointment} />
                  )}

                  {/* Session Details (Task 7) — green-tinted, shown when status === 'completed' */}
                  {selectedAppointment.status === 'completed' && (
                    <div className="px-4 py-3 border-b border-gray-100 bg-green-50/70">
                      <p className="text-xs font-bold text-green-800 mb-2 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                        Session Details
                      </p>
                      <div className="space-y-2">
                        <div>
                          <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide">Session Focus</p>
                          <p className="text-[11px] text-gray-800 mt-0.5">{selectedAppointment.sessionFocus || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide">Goal Targeted</p>
                          <p className="text-[11px] text-gray-800 mt-0.5">{selectedAppointment.goalTargeted || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide">Progress Achieved</p>
                          <p className="text-[11px] text-gray-800 mt-0.5">{selectedAppointment.progressAchieved || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide">Remarks / Description</p>
                          <p className="text-[11px] text-gray-800 mt-0.5 whitespace-pre-wrap">{selectedAppointment.sessionRemarks || '—'}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action History — shows all past actions with notes, user, timestamp */}
                  {actionHistory.length > 0 && (
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-xs font-bold text-gray-800 mb-2.5 flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-indigo-500" />
                        Action History
                      </p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {actionHistory.map((log) => {
                          const badgeCls = log.actionType === 'completed' ? 'bg-green-100 text-green-700' :
                                log.actionType === 'cancelled' ? 'bg-red-100 text-red-700' :
                                log.actionType === 'no_show' ? 'bg-orange-100 text-orange-700' :
                                log.actionType === 'rescheduled' ? 'bg-purple-100 text-purple-700' :
                                'bg-gray-100 text-gray-700'
                          return (
                          <div key={log.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <Badge className={`text-[10px] capitalize ${badgeCls}`}>
                                {log.actionType.replace('_', ' ')}
                              </Badge>
                              <span className="text-[10px] text-gray-400">
                                {new Date(log.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-700 mt-1 whitespace-pre-wrap">{log.notes}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">— {log.performedByName} ({log.userRole.replace('_', ' ')})</p>
                          </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* WhatsApp Patient */}
                  <div className="px-4 py-3 border-b border-gray-100">
                    <button className="w-full flex items-center gap-3 p-3 bg-green-600 hover:bg-green-700 text-white rounded-xl transition-colors shadow-sm">
                      <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                        <MessageCircle className="w-5 h-5" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-bold">WhatsApp Patient</p>
                        <p className="text-[10px] text-green-100 leading-tight">Send appointment details to parent</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-green-200 shrink-0" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <CalendarDays className="w-7 h-7 text-gray-300" />
                </div>
                <p className="text-sm font-semibold text-gray-500">Select an appointment</p>
                <p className="text-xs text-gray-400 mt-1">Click on any appointment card to view details</p>
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════ LIST VIEW (below grid) ══════════════════════ */}
        {appointments.length === 0 && !loading && !fetchError && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-12 text-center">
            <CalendarDays className="w-10 h-10 mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-semibold text-gray-600">No appointments found</p>
            <p className="text-xs text-gray-400 mt-1">
              {debouncedQuery
                ? 'Try adjusting your search or filters.'
                : 'There are no appointments for the selected date range.'}
            </p>
          </div>
        )}
        {appointments.length > 0 && (
          <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b-2 border-gray-200 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-gray-800">All Appointments for {dateLabel}</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportAppointments}
                disabled={exportingAppointments}
              >
                <Download className={`w-4 h-4 mr-1.5 ${exportingAppointments ? 'animate-spin' : ''}`} />
                Export to Excel
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-300 bg-gray-50">
                    <th className="text-left px-4 py-2 font-semibold text-gray-600">Patient</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-600">Session/Title</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-600">Time</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-600">Therapist</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-600">Type</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-600">Notes</th>
                    {(canManage || canDeleteAppt) && <th className="text-right px-4 py-2 font-semibold text-gray-600">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-gray-200">
                  {paginatedAppointments.map(apt => (
                    <tr
                      key={apt.id}
                      className={`${getRowBgClass(apt.status)} cursor-pointer transition-all border-l-4 border-transparent hover:border-blue-500 hover:bg-blue-50 hover:shadow-sm ${selectedAppointment?.id === apt.id ? 'ring-2 ring-inset ring-blue-400' : ''}`}
                      onClick={() => {
                        if (apt.status === 'cancelled' && canManageCancelled) {
                          setCancelledMenuOpenId(apt.id)
                        } else {
                          setSelectedAppointment(apt)
                        }
                      }}
                    >
                      <td className="px-4 py-2">
                        <p className="font-medium text-gray-800">{apt.patient?.childName || apt.title || 'Unknown'}</p>
                        <p className="text-xs text-gray-500">{apt.patient?.patientId}</p>
                      </td>
                      <td className="px-4 py-2 text-gray-700 text-xs">
                        {apt.title || '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {formatTimeDisplay(apt.startTime)} - {formatTimeDisplay(apt.endTime)}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {apt.therapistId ? (
                          <>
                            <p>{apt.therapistId}</p>
                            {(() => {
                              const match = therapists.find((t) => t.name === apt.therapistId)
                              const label = match ? resolveDisplayDesignation(match.designation, match.role, match.secondaryRole) : ''
                              return label ? <p className="text-xs text-gray-500">{label}</p> : null
                            })()}
                          </>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-700">{resolveAppointmentTypeLabel(apptTypeLabel(apt.type), apt.therapistId, therapists) || '—'}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${getStatusCfg(apt.status).badge}`}>
                          {getStatusCfg(apt.status).label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs max-w-32 truncate">{apt.notes || '—'}</td>
                      {(canManage || canDeleteAppt) && (
                        <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          {apt.status === 'cancelled' ? (
                            (canManageCancelled || canDeleteAppt) && (
                              <DropdownMenu
                                open={cancelledMenuOpenId === apt.id}
                                onOpenChange={(open) => setCancelledMenuOpenId(open ? apt.id : null)}
                              >
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                    <MoreVertical className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  {canManageCancelled && (
                                    <DropdownMenuItem onClick={() => { setCancelledMenuOpenId(null); openReschedule(apt) }}>
                                      <RotateCcw className="w-4 h-4 mr-2 text-amber-500" />
                                      Reschedule
                                    </DropdownMenuItem>
                                  )}
                                  {canDeleteAppt && (
                                    <DropdownMenuItem
                                      onClick={() => { setCancelledMenuOpenId(null); setDeleteConfirmTarget(apt) }}
                                      className="text-red-600 focus:text-red-700"
                                    >
                                      <Trash2 className="w-4 h-4 mr-2 text-red-500" />
                                      Delete
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )
                          ) : canManage && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuLabel>Manage</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedAppointment(apt)
                                    openReschedule(apt)
                                  }}
                                >
                                  <RotateCcw className="w-4 h-4 mr-2 text-amber-500" />
                                  Reschedule
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedAppointment(apt)
                                    openComplete(apt)
                                  }}
                                >
                                  <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                                  Mark Completed
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedAppointment(apt)
                                    openNoShow(apt)
                                  }}
                                  className="text-orange-600 focus:text-orange-700"
                                >
                                  <UserX className="w-4 h-4 mr-2 text-orange-500" />
                                  No Show
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedAppointment(apt)
                                    openCancel(apt)
                                  }}
                                  className="text-red-600 focus:text-red-700"
                                >
                                  <XCircle className="w-4 h-4 mr-2 text-red-500" />
                                  Cancel
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {total > pageSize && (
              <div className="px-4 py-4 border-t border-gray-100 bg-gray-50">
                <Pagination aria-label="Appointments pagination">
                  <PaginationContent>
                    <PaginationPrevious
                      onClick={(event) => {
                        event.preventDefault()
                        setCurrentPage((page) => Math.max(1, page - 1))
                      }}
                      disabled={currentPage === 1}
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
                      onClick={(event) => {
                        event.preventDefault()
                        setCurrentPage((page) => Math.min(totalPages, page + 1))
                      }}
                      disabled={currentPage === totalPages}
                    />
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </div>
        )}
        </>
        )}

        {activeView === 'upcoming' && (
          <UpcomingAppointmentsPanel
            therapists={therapists}
            items={upcomingItems}
            loading={upcomingLoading}
            error={upcomingError}
          />
        )}
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[800px] w-[95vw] p-0 overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>
          {/* Fixed header */}
          <DialogHeader className="px-6 py-4 border-b border-gray-100 shrink-0">
            <DialogTitle>Schedule Appointment</DialogTitle>
            <DialogDescription>Create a new appointment for a patient.</DialogDescription>
          </DialogHeader>

          {/* Scrollable form body */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Left column */}
              <div className="space-y-4">
                {/* Patient */}
                <div className="space-y-2">
                  <Label>Patient</Label>
                  <Input
                    placeholder="Search patients..."
                    value={patientSearch}
                    onChange={e => setPatientSearch(e.target.value)}
                    className="h-9"
                  />
                  <Select value={form.patientId} onValueChange={v => setForm(prev => ({ ...prev, patientId: v }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a patient" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {patients.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.patientId} - {p.childName} ({p.mobile})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Package (optional) — links this session to a patient's package
                    so it counts toward that package's Used/Remaining sessions. */}
                {form.patientId && formPatientPackages.length > 0 && (
                  <div className="space-y-2">
                    <Label>Link to Package (optional)</Label>
                    <Select
                      value={form.patientPackageId || 'none'}
                      onValueChange={v => setForm(prev => ({ ...prev, patientPackageId: v === 'none' ? '' : v }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="No package" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No package</SelectItem>
                        {formPatientPackages.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name || 'Package'} ({p.sessionsCompletedActual ?? 0}/{p.sessionsPurchased} used)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Date */}
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
                    className="h-9"
                  />
                </div>

                {/* Start Time */}
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={form.startTime}
                    onChange={e => {
                      const start = e.target.value
                      const [h, m] = start.split(':').map(Number)
                      const totalMin = h * 60 + m + SLOT_DURATION_MIN
                      const endH = Math.floor(totalMin / 60)
                      const endM = totalMin % 60
                      const end = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`
                      setForm(prev => ({ ...prev, startTime: start, endTime: end }))
                    }}
                    className="h-9"
                  />
                </div>

                {/* Therapist */}
                <div className="space-y-2">
                  <Label>Therapist</Label>
                  <Select value={form.therapist} onValueChange={v => setForm(prev => ({ ...prev, therapist: v }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select therapist" />
                    </SelectTrigger>
                    <SelectContent>
                      {therapists.map(t => (
                        <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Right column */}
              <div className="space-y-4">
                {/* End Time */}
                <div className="space-y-2">
                  <Label>End Time (auto: start + 45min)</Label>
                  <Input
                    type="time"
                    value={form.endTime}
                    onChange={e => setForm(prev => ({ ...prev, endTime: e.target.value }))}
                    className="h-9"
                  />
                </div>

                {/* Type */}
                <div className="space-y-2">
                  <Label>Appointment Type</Label>
                  <Select
                    value={form.type}
                    onValueChange={v => {
                      if (v === '__add_type__') { setAddTypeOpen(true); return }
                      setForm(prev => ({ ...prev, type: v }))
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {apptTypeOptions.map((t) => (
                        <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                      ))}
                      {user?.role === 'super_admin' && (
                        <SelectItem value="__add_type__" className="text-primary font-medium">+ Add new type</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {addTypeOpen && (
                    <div className="flex gap-2">
                      <Input
                        autoFocus
                        placeholder="e.g. Play Therapy"
                        value={newTypeLabel}
                        maxLength={60}
                        onChange={(e) => setNewTypeLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAppointmentType() } }}
                      />
                      <Button type="button" size="sm" className="h-10" onClick={addAppointmentType} disabled={addingType || !newTypeLabel.trim()}>
                        {addingType ? 'Adding…' : 'Add'}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-10" onClick={() => { setAddTypeOpen(false); setNewTypeLabel('') }}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>

                {/* Planned Duration */}
                <div className="space-y-2">
                  <Label>Planned Duration (Minutes)</Label>
                  <Input
                    type="number"
                    min="15"
                    max="180"
                    value={form.plannedDuration}
                    onChange={e => setForm(prev => ({ ...prev, plannedDuration: parseInt(e.target.value) || 45 }))}
                    className="h-9"
                    placeholder="e.g., 45"
                  />
                  <p className="text-[10px] text-gray-400">Standard therapy session = 45 minutes.</p>
                </div>
              </div>
            </div>

            {/* Notes — full width */}
            <div className="space-y-2 mt-4">
              <Label>Notes</Label>
              <Textarea
                placeholder="Additional notes..."
                value={form.notes}
                onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
              />
            </div>

            {/* Historical data entry (migration mode) */}
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3 flex items-start gap-3">
              <input
                id="appt-historical"
                type="checkbox"
                checked={form.isHistorical}
                onChange={e => setForm(prev => ({ ...prev, isHistorical: e.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-400"
              />
              <label htmlFor="appt-historical" className="text-xs text-amber-800 leading-relaxed cursor-pointer">
                <span className="font-semibold">Mark as historical record.</span> Use this when entering a past appointment that predates the system (migration mode). Requires &quot;Allow Historical Entry&quot; to be enabled in Center Settings. The record is tagged with your name and the current timestamp for audit.
              </label>
            </div>
          </div>

          {/* Sticky footer */}
          <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex justify-end gap-2 bg-white">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-blue-600 hover:bg-blue-700 text-white">
              {creating && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Create Appointment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════ RESCHEDULE ActionDialog (Task 6) ══════════════════════ */}
      <ActionDialog
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        module="appointments"
        recordId={actionTarget?.id || ''}
        actionType="rescheduled"
        actionLabel="Reschedule Appointment"
        description="Pick a new date and time slot for this appointment. A reason is required."
        variant="warning"
        onConfirm={confirmReschedule}
        disableConfirm={!rescheduleForm.date}
      >
        <div className="space-y-2">
          <Label>New Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarClock className="w-4 h-4 mr-2" />
                {rescheduleForm.date
                  ? format(new Date(rescheduleForm.date), 'PPP')
                  : 'Pick a date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={rescheduleForm.date ? new Date(rescheduleForm.date) : undefined}
                onSelect={(d) => {
                  if (d) setRescheduleForm((prev) => ({ ...prev, date: format(d, 'yyyy-MM-dd') }))
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-2">
          <Label>Therapist</Label>
          <Select
            value={rescheduleForm.therapistId}
            onValueChange={(v) => setRescheduleForm((prev) => ({ ...prev, therapistId: v }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select therapist" />
            </SelectTrigger>
            <SelectContent>
              {therapists.map((t) => (
                <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Start Time</Label>
            <Input
              type="time"
              value={rescheduleForm.startTime}
              onChange={(e) => {
                const start = e.target.value
                const [h, m] = start.split(':').map(Number)
                const totalMin = h * 60 + m + SLOT_DURATION_MIN
                const endH = Math.floor(totalMin / 60)
                const endM = totalMin % 60
                const end = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`
                setRescheduleForm((prev) => ({ ...prev, startTime: start, endTime: end }))
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>End Time</Label>
            <Input
              type="time"
              value={rescheduleForm.endTime}
              onChange={(e) => setRescheduleForm((prev) => ({ ...prev, endTime: e.target.value }))}
            />
          </div>
        </div>
        {actionTarget && (
          <p className="text-xs text-gray-500">
            Patient:{' '}
            <span className="font-semibold text-gray-700">
              {actionTarget.patient?.childName || 'Unknown'}
            </span>{' '}
            • Therapist:{' '}
            <span className="font-semibold text-gray-700">
              {rescheduleForm.therapistId || '—'}
            </span>
          </p>
        )}
      </ActionDialog>

      {/* ══════════════════════ CANCEL ActionDialog (Task 6) ══════════════════════ */}
      <ActionDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        module="appointments"
        recordId={actionTarget?.id || ''}
        actionType="cancelled"
        actionLabel="Cancel Appointment"
        description="Please provide a reason for cancelling this appointment. This action cannot be undone."
        variant="destructive"
        onConfirm={confirmCancel}
      >
        {actionTarget && (
          <p className="text-xs text-gray-500">
            Patient:{' '}
            <span className="font-semibold text-gray-700">
              {actionTarget.patient?.childName || 'Unknown'}
            </span>{' '}
            • {format(new Date(actionTarget.date), 'dd MMM yyyy')}{' '}
            {formatTimeDisplay(actionTarget.startTime)}
          </p>
        )}
      </ActionDialog>

      {/* ══════════════════════ DELETE cancelled appointment confirm ══════════════════════ */}
      <Dialog open={!!deleteConfirmTarget} onOpenChange={(open) => { if (!open) setDeleteConfirmTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this cancelled appointment?</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          {deleteConfirmTarget && (
            <p className="text-xs text-gray-500">
              Patient:{' '}
              <span className="font-semibold text-gray-700">
                {deleteConfirmTarget.patient?.childName || 'Unknown'}
              </span>{' '}
              • {format(new Date(deleteConfirmTarget.date), 'dd MMM yyyy')}{' '}
              {formatTimeDisplay(deleteConfirmTarget.startTime)}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteAppointment}
              disabled={deleting}
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════ NO SHOW ActionDialog ══════════════════════ */}
      <ActionDialog
        open={noShowOpen}
        onOpenChange={setNoShowOpen}
        module="appointments"
        recordId={actionTarget?.id || ''}
        actionType="no_show"
        actionLabel="Mark as No Show"
        description="Mark this appointment as a no-show. A reason is required and will be recorded in the action log."
        variant="warning"
        onConfirm={confirmNoShow}
      >
        {actionTarget && (
          <p className="text-xs text-gray-500">
            Patient:{' '}
            <span className="font-semibold text-gray-700">
              {actionTarget.patient?.childName || 'Unknown'}
            </span>{' '}
            • {format(new Date(actionTarget.date), 'dd MMM yyyy')}{' '}
            {formatTimeDisplay(actionTarget.startTime)}
          </p>
        )}
      </ActionDialog>

      {/* ══════════════════════ COMPLETE / SESSION DETAILS ActionDialog (Task 7) ══════════════════════ */}
      <ActionDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        module="appointments"
        recordId={actionTarget?.id || ''}
        actionType="completed"
        actionLabel="Complete Appointment"
        description="All four session-detail fields are mandatory before an appointment can be marked completed."
        variant="success"
        onConfirm={confirmComplete}
        disableConfirm={
          !sessionForm.sessionFocus.trim() ||
          !sessionForm.goalTargeted.trim() ||
          !sessionForm.progressAchieved.trim() ||
          !sessionForm.sessionRemarks.trim()
        }
      >
        <div className="grid gap-3 max-h-[40vh] overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label>
              Session Focus <span className="text-red-500">*</span>
            </Label>
            <Textarea
              placeholder="What was the focus of this session?"
              value={sessionForm.sessionFocus}
              onChange={(e) =>
                setSessionForm((prev) => ({ ...prev, sessionFocus: e.target.value }))
              }
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>
              Goal Targeted <span className="text-red-500">*</span>
            </Label>
            <Textarea
              placeholder="What goal was being targeted?"
              value={sessionForm.goalTargeted}
              onChange={(e) =>
                setSessionForm((prev) => ({ ...prev, goalTargeted: e.target.value }))
              }
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>
              Progress Achieved <span className="text-red-500">*</span>
            </Label>
            <Textarea
              placeholder="Describe the progress achieved in this session."
              value={sessionForm.progressAchieved}
              onChange={(e) =>
                setSessionForm((prev) => ({ ...prev, progressAchieved: e.target.value }))
              }
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>
              Remarks / Description <span className="text-red-500">*</span>
            </Label>
            <Textarea
              placeholder="Any additional remarks or description."
              value={sessionForm.sessionRemarks}
              onChange={(e) =>
                setSessionForm((prev) => ({ ...prev, sessionRemarks: e.target.value }))
              }
              rows={2}
            />
          </div>

          {/* Actual Session Duration (Minutes) — therapist only */}
          <div className="space-y-2">
            <Label>
              Actual Session Duration (Minutes) <span className="text-red-500">*</span>
            </Label>
            <Input
              type="number"
              min="1"
              max="180"
              value={sessionForm.actualDuration}
              onChange={(e) => setSessionForm((prev) => ({ ...prev, actualDuration: parseInt(e.target.value) || 45 }))}
              className="h-9"
              placeholder="e.g., 45"
            />
            <p className="text-[10px] text-gray-400">Standard session = 45 minutes. Adjust if the actual duration differed.</p>
          </div>

          {actionTarget && (
            <p className="text-xs text-gray-500">
              Patient:{' '}
              <span className="font-semibold text-gray-700">
                {actionTarget.patient?.childName || 'Unknown'}
              </span>{' '}
              • {format(new Date(actionTarget.date), 'dd MMM yyyy')}{' '}
              {formatTimeDisplay(actionTarget.startTime)}
            </p>
          )}
        </div>
      </ActionDialog>
    </div>
  )
}

// ── Therapist Workflow Actions Component ───────────────────────────────

function TherapistWorkflowActions({
  appointment,
  onUpdated,
  onComplete,
}: {
  appointment: Appointment
  onUpdated: (updated: Appointment) => void
  onComplete: (apt: Appointment) => void
}) {
  const [updating, setUpdating] = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)
  const [rescheduleReason, setRescheduleReason] = useState('')
  const [showCancelRequest, setShowCancelRequest] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [showAttendance, setShowAttendance] = useState(false)
  const [attendanceStatus, setAttendanceStatus] = useState('present')

  // Used only for therapist-allowed statuses: in_progress, no_show.
  // 'completed' opens the complete dialog (collects required session details).
  // 'cancelled' and 'rescheduled' are admin-only → therapist submits a request note.
  const updateAppointmentStatus = async (status: string, extra?: Record<string, unknown>) => {
    setUpdating(true)
    try {
      const res = await authFetch('/api/appointments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: appointment.id, status, ...extra }),
      })
      if (res.ok) {
        toast.success(`Appointment marked as ${status.replace('_', ' ')}`)
        onUpdated({ ...appointment, status, ...extra } as Appointment)
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to update appointment')
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setUpdating(false)
    }
  }

  // Complete requires session details (sessionFocus, goalTargeted, progressAchieved,
  // sessionRemarks) — open the complete dialog to collect them instead of calling the API
  // directly, which would 400 with "Missing required session details".
  // Therapists complete directly from 'scheduled' (no Start Session step).
  const handleCompleteSession = () => onComplete(appointment)
  const handleNoShow = () => updateAppointmentStatus('no_show')

  // Therapists cannot directly set status='rescheduled' (admin-only). Submit a request
  // as a note on the appointment for admin review instead.
  const handleRequestReschedule = async () => {
    if (!rescheduleReason.trim()) {
      toast.error('Please enter a reason for rescheduling')
      return
    }
    setUpdating(true)
    try {
      const note = `[Reschedule Request]: ${rescheduleReason.trim()}`
      const res = await authFetch('/api/appointments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: appointment.id, notes: note }),
      })
      if (res.ok) {
        toast.success('Reschedule request submitted for admin approval')
        onUpdated({ ...appointment, notes: note })
        setShowReschedule(false)
        setRescheduleReason('')
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to submit reschedule request')
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setUpdating(false)
    }
  }

  // Therapists cannot directly set status='cancelled' (admin-only + requires reason).
  // Submit a cancellation request as a note for admin review instead.
  const handleRequestCancel = async () => {
    if (!cancelReason.trim()) {
      toast.error('Please enter a reason for cancellation')
      return
    }
    setUpdating(true)
    try {
      const note = `[Cancellation Request]: ${cancelReason.trim()}`
      const res = await authFetch('/api/appointments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: appointment.id, notes: note }),
      })
      if (res.ok) {
        toast.success('Cancellation request submitted for admin approval')
        onUpdated({ ...appointment, notes: note })
        setShowCancelRequest(false)
        setCancelReason('')
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to submit cancellation request')
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setUpdating(false)
    }
  }

  const handleMarkAttendance = async () => {
    setUpdating(true)
    try {
      const res = await authFetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: appointment.therapistId,
          date: new Date().toISOString().split('T')[0],
          status: attendanceStatus,
        }),
      })
      if (res.ok) {
        toast.success(`Attendance marked as ${attendanceStatus.replace('_', ' ')}`)
        setShowAttendance(false)
      } else {
        toast.error('Failed to mark attendance')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setUpdating(false)
    }
  }

  const status = appointment.status

  return (
    <div className="space-y-2.5">
      <p className="text-xs font-bold text-gray-800">Therapist Actions</p>

      {(status === 'scheduled' || status === 'in_progress') && (
        <div className="space-y-2">
          <Button className="w-full bg-green-600 hover:bg-green-700 text-white" size="sm" onClick={handleCompleteSession} disabled={updating}>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            Complete Session
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 text-orange-600 border-orange-300 hover:bg-orange-50" onClick={handleNoShow} disabled={updating}>
              No Show
            </Button>
            <Button variant="outline" size="sm" className="flex-1 text-purple-600 border-purple-300 hover:bg-purple-50" onClick={() => setShowReschedule(true)} disabled={updating}>
              <RotateCcw className="w-3 h-3 mr-1" />
              Reschedule
            </Button>
          </div>
          <Button variant="outline" size="sm" className="w-full text-red-600 border-red-300 hover:bg-red-50" onClick={() => setShowCancelRequest(true)} disabled={updating}>
            <XCircle className="w-3.5 h-3.5 mr-1.5" />
            Request Cancellation
          </Button>
        </div>
      )}

      {status === 'completed' && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-50 text-green-700 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="font-medium">Session completed</span>
        </div>
      )}

      {(status === 'cancelled' || status === 'no_show') && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 text-red-700 text-xs">
          <XCircle className="w-4 h-4 shrink-0" />
          <span className="font-medium capitalize">{status.replace('_', ' ')}</span>
        </div>
      )}

      {/* Quick actions */}
      <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setShowAttendance(true)}>
        <CheckSquare className="w-3 h-3 mr-1" />
        Mark Attendance
      </Button>

      {/* Reschedule request form */}
      {showReschedule && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 space-y-2">
          <p className="text-xs font-medium text-purple-700">Reason for Reschedule</p>
          <Textarea
            value={rescheduleReason}
            onChange={(e) => setRescheduleReason(e.target.value)}
            placeholder="Enter reason..."
            className="text-xs"
            rows={2}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setShowReschedule(false); setRescheduleReason('') }}>Cancel</Button>
            <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white" onClick={handleRequestReschedule} disabled={updating}>Submit Request</Button>
          </div>
        </div>
      )}

      {/* Cancellation request form */}
      {showCancelRequest && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
          <p className="text-xs font-medium text-red-700">Reason for Cancellation</p>
          <Textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Enter reason..."
            className="text-xs"
            rows={2}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setShowCancelRequest(false); setCancelReason('') }}>Cancel</Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={handleRequestCancel} disabled={updating}>Submit Request</Button>
          </div>
        </div>
      )}

      {/* Attendance dialog */}
      {showAttendance && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
          <p className="text-xs font-medium text-blue-700">Mark Attendance</p>
          <div className="flex gap-2">
            {['present', 'absent', 'late_arrival'].map(s => (
              <button
                key={s}
                onClick={() => setAttendanceStatus(s)}
                className={`px-2 py-1 rounded-lg text-xs font-medium ${attendanceStatus === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
              >
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowAttendance(false)}>Cancel</Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleMarkAttendance} disabled={updating}>Save</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Package Info Panel Component ───────────────────────────────────────

function PackageInfoPanel({
  patientId,
  patientPackageId,
  refreshKey,
}: {
  patientId: string
  patientPackageId?: string | null
  // Changes whenever the viewed appointment's identity or status changes
  // (pass e.g. `${appointment.id}:${appointment.status}`) so this panel
  // fetches fresh stats every time the details modal opens for a
  // DIFFERENT appointment, AND right after completing / undoing / cancelling
  // / rescheduling the CURRENTLY-open one — not just when patientId changes,
  // which previously left the panel showing stale numbers in both cases.
  refreshKey?: string
}) {
  const [packages, setPackages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const fetchPackages = async () => {
      setLoading(true)
      try {
        const res = await authFetch(`/api/patient-packages?patientId=${patientId}`)
        if (res.ok) {
          const json = await res.json()
          if (!cancelled) setPackages(json.packages || json || [])
        }
      } catch { /* silent */ }
      finally { if (!cancelled) setLoading(false) }
    }
    fetchPackages()
    return () => { cancelled = true }
  }, [patientId, patientPackageId, refreshKey])

  if (loading) {
    return (
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-xs font-bold text-gray-800 mb-2">Package Info</p>
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-gray-100 rounded" />
          <div className="h-4 bg-gray-100 rounded w-3/4" />
        </div>
      </div>
    )
  }

  if (packages.length === 0) {
    return (
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-xs font-bold text-gray-800 mb-2">Package Info</p>
        <p className="text-xs text-gray-400">No active packages found.</p>
      </div>
    )
  }

  // A patient can have multiple package assignments (re-assigned/duplicate
  // packages, or a new one purchased after the previous one finished).
  // Blindly showing packages[0] (the most-recently-CREATED assignment) was
  // the actual bug here — this appointment's own session was scheduled
  // against an OLDER assignment, so the newest (unrelated, zero-session)
  // assignment was shown instead, displaying 0 used / 0 remaining / "12 not
  // scheduled" even though the viewed appointment was already completed.
  // Prefer the assignment this specific appointment is actually linked to.
  const pkg = (patientPackageId && packages.find((p) => p.id === patientPackageId)) || packages[0]
  // Total purchased (contractual) vs actually-scheduled/completed derived
  // straight from real Appointment rows (see GET /api/patient-packages) — the
  // two can legitimately differ if some sessions couldn't be placed on the
  // calendar (scheduling conflicts); showing that gap explicitly, instead of
  // silently trusting one static number, is the fix for the "24 purchased
  // but only 20 shown" mismatch.
  const total = pkg.sessionsPurchased || 0
  const used = typeof pkg.sessionsCompletedActual === 'number' ? pkg.sessionsCompletedActual : (pkg.sessionsCompleted || 0)
  const unscheduled = typeof pkg.sessionsUnscheduled === 'number' ? pkg.sessionsUnscheduled : 0
  // Remaining = Total − Used (not Scheduled − Used) — the canonical
  // `sessionsRemaining` from GET /api/patient-packages is the single source
  // of truth here; falls back to computing it locally only for responses
  // from an older, not-yet-redeployed backend.
  const remaining = typeof pkg.sessionsRemaining === 'number' ? pkg.sessionsRemaining : Math.max(0, total - used)

  return (
    <div className="px-4 py-3 border-b border-gray-100">
      <p className="text-xs font-bold text-gray-800 mb-2 flex items-center gap-1.5">
        <Package className="w-3.5 h-3.5 text-indigo-500" />
        Package Info
      </p>
      <div className="rounded-lg bg-indigo-50/60 border border-indigo-100 p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-500">Package Name</span>
          <span className="text-xs font-semibold text-gray-800">{pkg.package?.name || 'Therapy Package'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-500">Total Sessions</span>
          <span className="text-xs font-bold text-indigo-600">{total}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-500">Used Sessions</span>
          <span className="text-xs font-bold text-orange-600">{used}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-500">Remaining Sessions</span>
          <span className="text-xs font-bold text-green-600">{remaining}</span>
        </div>
        {unscheduled > 0 && (
          <div className="flex items-center justify-between rounded-md bg-red-50 border border-red-100 px-2 py-1 mt-1">
            <span className="text-[11px] text-red-600 font-medium">⚠ Not yet scheduled</span>
            <span className="text-xs font-bold text-red-600">{unscheduled}</span>
          </div>
        )}
        <div className="mt-2">
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${total > 0 ? (used / total) * 100 : 0}%` }} />
          </div>
          <p className="text-[10px] text-gray-400 mt-1 text-right">{total > 0 ? Math.round((used / total) * 100) : 0}% used</p>
        </div>
      </div>
    </div>
  )
}

// ── Session Notes Section Component ────────────────────────────────────

function SessionNotesSection({
  appointment,
  onSave,
}: {
  appointment: Appointment
  onSave: (notes: string) => void
}) {
  const [notes, setNotes] = useState(appointment.sessionRemarks || '')
  const [saving, setSaving] = useState(false)
  const isCompleted = appointment.status === 'completed'

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await authFetch('/api/appointments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: appointment.id, sessionRemarks: notes }),
      })
      if (res.ok) {
        toast.success('Session notes saved')
        onSave(notes)
      } else {
        toast.error('Failed to save notes')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 py-3 border-b border-gray-100">
      <p className="text-xs font-bold text-gray-800 mb-2 flex items-center gap-1.5">
        <FileText className="w-3.5 h-3.5 text-blue-500" />
        Session Notes {isCompleted && <span className="text-[10px] text-gray-400 font-normal">(Read Only)</span>}
      </p>
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={isCompleted || saving}
        placeholder="Activities done, child performance, progress notes, home program suggested for parent..."
        className="text-xs"
        rows={4}
      />
      {!isCompleted && (
        <Button size="sm" variant="outline" className="mt-2 w-full" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Notes'}
        </Button>
      )}
    </div>
  )
}

// ── Progress Tracking Section Component ────────────────────────────────

function ProgressTrackingSection({ appointment }: { appointment: Appointment }) {
  return (
    <div className="px-4 py-3 border-b border-gray-100">
      <p className="text-xs font-bold text-gray-800 mb-2 flex items-center gap-1.5">
        <TrendingUp className="w-3.5 h-3.5 text-green-500" />
        Progress Tracking
      </p>
      <div className="space-y-2.5">
        {appointment.sessionFocus && (
          <div>
            <Label className="text-[11px] text-gray-500">Session Focus</Label>
            <p className="text-xs text-gray-700 mt-0.5">{appointment.sessionFocus}</p>
          </div>
        )}
        {appointment.goalTargeted && (
          <div>
            <Label className="text-[11px] text-gray-500">Goal Targeted</Label>
            <p className="text-xs text-gray-700 mt-0.5">{appointment.goalTargeted}</p>
          </div>
        )}
        {appointment.progressAchieved && (
          <div>
            <Label className="text-[11px] text-gray-500">Progress Achieved</Label>
            <p className="text-xs text-gray-700 mt-0.5">{appointment.progressAchieved}</p>
          </div>
        )}
        {appointment.sessionRemarks && (
          <div>
            <Label className="text-[11px] text-gray-500">Therapist Remarks</Label>
            <p className="text-xs text-gray-700 mt-0.5 whitespace-pre-wrap">{appointment.sessionRemarks}</p>
          </div>
        )}
      </div>
    </div>
  )
}
