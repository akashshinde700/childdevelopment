'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns'
import {
  Plus,
  Eye,
  CheckCircle2,
  ClipboardCheck,
  Filter,
  User,
  Stethoscope,
  Calendar,
  FileText,
  ChevronDown,
  ChevronUp,
  Clock,
  UserX,
  XCircle,
  Printer,
  RotateCcw,
  Loader2,
  Download,
  ClipboardList,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchInput } from '@/components/ui/search-input'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'
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
import { DatePicker } from '@/components/ui/date-picker'
import { buildDocumentHTML, deliverDocument, escapeHTML as esc } from '@/components/print/DocumentLayout'
import { usePrintSettings } from '@/components/print/PrintSettingsDialog'
import { useToast } from '@/hooks/use-toast'
import { authFetch } from '@/lib/api-client'
import { takesTherapySessions } from '@/lib/therapists'
import { useAppStore } from '@/store/app-store'
import { useSystemConfig, clearConfigCache } from '@/hooks/use-system-config'

// Types
interface Patient {
  id: string
  patientId: string
  childName: string
  mobile: string
}

interface Assessment {
  id: string
  patientId: string
  type: string
  scheduledDate: string
  scheduledTime: string | null
  completedDate: string | null
  status: string // scheduled, draft, completed, cancelled
  therapistName: string | null
  findings: string | null
  recommendations: string | null
  reportUrl: string | null
  notes: string | null
  reason: string | null
  instructions: string | null
  scheduledBy: string | null
  diagnosis: string | null
  history: string | null
  observations: string | null // JSON string
  therapistNotes: string | null
  treatmentPlan: string | null
  goals: string | null
  recommendation: string | null
  nextAssessmentDate: string | null
  attachments: string | null // JSON array string
  completedBy: string | null
  completedAt: string | null
  createdAt: string
  patient?: { childName: string; patientId: string; mobile?: string; gender?: string | null; dateOfBirth?: string | null }
}

interface ObservationData {
  eyeContact: string
  attention: string
  behaviour: string
  communication: string
  fineMotor: string
  grossMotor: string
  sensory: string
}

const OBSERVATION_OPTIONS = {
  eyeContact: ['Poor', 'Fair', 'Good', 'Excellent'],
  attention: ['Poor', 'Fair', 'Good', 'Excellent'],
  behaviour: ['Poor', 'Fair', 'Good', 'Excellent'],
  communication: ['Non-verbal', 'Minimal', 'Adequate', 'Fluent'],
  fineMotor: ['Delayed', 'Emerging', 'Typical', 'Advanced'],
  grossMotor: ['Delayed', 'Emerging', 'Typical', 'Advanced'],
  sensory: ['Hypersensitive', 'Hyposensitive', 'Typical', 'Mixed'],
} as const

const OBSERVATION_LABELS: Record<keyof ObservationData, string> = {
  eyeContact: 'Eye Contact',
  attention: 'Attention',
  behaviour: 'Behaviour',
  communication: 'Communication',
  fineMotor: 'Fine Motor',
  grossMotor: 'Gross Motor',
  sensory: 'Sensory',
}

const RECOMMENDATION_OPTIONS = [
  'Continue Therapy',
  'Increase Frequency',
  'Decrease Frequency',
  'Discharge',
  'Refer to Specialist',
  'Re-evaluate in 3 months',
]

const STATUS_LABEL_MAP: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  in_progress: { label: 'In Progress', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  draft: { label: 'Draft', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  confirmed: { label: 'Confirmed', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
  rescheduled: { label: 'Rescheduled', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  no_show: { label: 'No Show', className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400' },
}

function getStatusBadge(status: string) {
  const s = STATUS_LABEL_MAP[status] || { label: status, className: '' }
  return <Badge className={s.className}>{s.label}</Badge>
}

function getStatusBadgeLabel(status: string): string {
  return (STATUS_LABEL_MAP[status] || { label: status }).label
}

function getTypeBadge(type: string) {
  const colors: Record<string, string> = {
    'Doctor Consultation': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
    'Speech Assessment': 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400',
    'Occupational Therapy Assessment': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
    'Autism Assessment': 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400',
    'ADHD Assessment': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400',
    'IQ Assessment': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400',
    'DP3 Assessment': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    'Learning Disability Assessment': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  }
  return (
    <Badge className={colors[type] || ''}>
      {type.replace(' Assessment', '').replace(' Consultation', '')}
    </Badge>
  )
}

function parseObservations(raw: string | null): ObservationData {
  const empty: ObservationData = {
    eyeContact: '', attention: '', behaviour: '', communication: '',
    fineMotor: '', grossMotor: '', sensory: '',
  }
  if (!raw) return empty
  try {
    return { ...empty, ...(JSON.parse(raw) as Partial<ObservationData>) }
  } catch {
    return empty
  }
}


export default function AssessmentsPage() {
  const { user } = useAppStore()
  const isTherapist = user?.role?.startsWith('therapist') || user?.role === 'psychologist'
  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'admin'
  const { printWithSettings, PrintSettingsDialog } = usePrintSettings()

  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [total, setTotal] = useState(0)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [rangeFilter, setRangeFilter] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientSearch, setPatientSearch] = useState('')
  const [therapists, setTherapists] = useState<{ id: string; name: string; role: string }[]>([])
  const [therapistSearch, setTherapistSearch] = useState('')
  const [therapistsLoading, setTherapistsLoading] = useState(true)
  const { searchQuery: globalSearchQuery, setSearchQuery: setGlobalSearchQuery } = useAppStore()
  // Reusable debounced search — seeded with the global search bar value.
  const { query, debouncedQuery, setQuery, isDebouncing, clear } = useDebouncedSearch(globalSearchQuery)
  const { toast } = useToast()

  // ── Assessment types are fully DB-driven (SystemConfig, category
  // 'assessment_types') — managed from Settings or the inline "+ Add New
  // Type" flow below. No hardcoded fallback list. ──
  const { items: configAssessmentTypes } = useSystemConfig('assessment_types')
  const assessmentTypeOptions = configAssessmentTypes.map((t) => t.label)

  // ── Add-new-type inline flow (from the Assessment Type dropdown) ──
  const [newTypeDialogOpen, setNewTypeDialogOpen] = useState(false)
  const [newTypeLabel, setNewTypeLabel] = useState('')
  const [newTypeSaving, setNewTypeSaving] = useState(false)

  const handleAddAssessmentType = async () => {
    const label = newTypeLabel.trim()
    if (!label) {
      toast({ title: 'Error', description: 'Type name is required', variant: 'destructive' })
      return
    }
    if (assessmentTypeOptions.some((t) => t.toLowerCase() === label.toLowerCase())) {
      toast({ title: 'Error', description: 'This assessment type already exists', variant: 'destructive' })
      return
    }
    setNewTypeSaving(true)
    try {
      const key = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      const res = await authFetch('/api/config/item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'assessment_types',
          key,
          label,
          sortOrder: assessmentTypeOptions.length,
          isActive: true,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'Failed to add assessment type')
      }
      clearConfigCache()
      setForm(prev => ({ ...prev, type: label }))
      toast({ title: 'Success', description: `"${label}" added as an assessment type` })
      setNewTypeLabel('')
      setNewTypeDialogOpen(false)
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message || 'Failed to add assessment type', variant: 'destructive' })
    } finally {
      setNewTypeSaving(false)
    }
  }

  const handleAssessmentTypeSelect = (v: string) => {
    if (v === '__add_new__') {
      setNewTypeLabel('')
      setNewTypeDialogOpen(true)
      return
    }
    setForm(prev => ({ ...prev, type: v }))
  }

  // Sync global search to local search (preserves cross-module search behaviour)
  useEffect(() => {
    if (globalSearchQuery) {
      setQuery(globalSearchQuery)
      setGlobalSearchQuery('')
    }
  }, [globalSearchQuery, setGlobalSearchQuery, setQuery])

  // Dialogs
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false)
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null)

  // Action dialog (Reschedule/No Show/Cancel) — converted to ActionDialog (Task A1)
  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [actionAssessment, setActionAssessment] = useState<Assessment | null>(null)
  const [actionType, setActionType] = useState<'reschedule' | 'no_show' | 'cancel' | null>(null)
  const [actionNotes, setActionNotes] = useState<Record<string, { action: string; note: string }>>({})
  // Reschedule form (date + time) — only used when actionType === 'reschedule'
  const [rescheduleForm, setRescheduleForm] = useState({ date: '', time: '10:00' })

  // Schedule form (Super Admin only) — status is auto-set to 'scheduled' by the API.
  // Includes the new reason / instructions fields.
  const [form, setForm] = useState({
    patientId: '',
    type: 'Doctor Consultation',
    scheduledDate: format(new Date(), 'yyyy-MM-dd'),
    scheduledTime: '10:00',
    therapistName: '',
    reason: '',
    instructions: '',
  })

  // Complete form (Super Admin's legacy Complete dialog — uses findings/recommendations/notes)
  const [completeForm, setCompleteForm] = useState({
    findings: '',
    recommendations: '',
    notes: '',
  })

  // ── Therapist Assessment Form dialog (the new main feature) ──
  const [assessmentFormOpen, setAssessmentFormOpen] = useState(false)
  const [assessmentForm, setAssessmentForm] = useState<{
    diagnosis: string
    history: string
    findings: string
    observations: ObservationData
    therapistNotes: string
    treatmentPlan: string
    goals: string
    recommendation: string
    nextAssessmentDate: string
  }>({
    diagnosis: '',
    history: '',
    findings: '',
    observations: { eyeContact: '', attention: '', behaviour: '', communication: '', fineMotor: '', grossMotor: '', sensory: '' },
    therapistNotes: '',
    treatmentPlan: '',
    goals: '',
    recommendation: '',
    nextAssessmentDate: '',
  })
  const [savingDraft, setSavingDraft] = useState(false)
  const [completingAssessment, setCompletingAssessment] = useState(false)
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false)
  const [reopeningAssessment, setReopeningAssessment] = useState(false)

  const fetchAssessments = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(limit), page: String(page) })
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (debouncedQuery) params.set('search', debouncedQuery)
      // ── Date range filter (today / week / month / custom) ──
      if (rangeFilter === 'custom') {
        if (customStartDate) params.set('startDate', customStartDate)
        if (customEndDate) params.set('endDate', customEndDate)
      } else if (rangeFilter !== 'all') {
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
      const res = await authFetch(`/api/assessments?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setAssessments(json.assessments || [])
        setTotal(json.total || 0)
        // If backend returns page/limit, keep them in sync
        if (json.page) setPage(json.page)
        if (json.limit) setLimit(json.limit)
      }
    } catch {
      console.error('Failed to fetch assessments')
    } finally {
      setLoading(false)
    }
  }, [typeFilter, statusFilter, debouncedQuery, rangeFilter, customStartDate, customEndDate])

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

  const fetchTherapists = useCallback(async () => {
    setTherapistsLoading(true)
    try {
      const res = await authFetch('/api/users')
      if (res.ok) {
        const json = await res.json()
        const therapistRoles = new Set([
          'therapist_speech',
          'therapist_ot',
          'therapist_behavioral',
          'therapist_remedial',
        ])
        const loaded = Array.isArray(json) ? json.filter((u: any) => u?.name && takesTherapySessions(u, [...therapistRoles]) && u.isActive !== false) : []
        setTherapists(loaded)
      }
    } catch {
      // silent
    } finally {
      setTherapistsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAssessments() }, [fetchAssessments])
  useEffect(() => { fetchAssessments() }, [fetchAssessments, page, limit])
  useEffect(() => { fetchPatients() }, [fetchPatients])
  useEffect(() => {
    if (scheduleDialogOpen) fetchTherapists()
  }, [scheduleDialogOpen, fetchTherapists])

  const filteredTherapists = therapists.filter((t) => t.name.toLowerCase().includes(therapistSearch.toLowerCase()))

  const resetScheduleForm = () => {
    setForm({
      patientId: '',
      type: 'Doctor Consultation',
      scheduledDate: format(new Date(), 'yyyy-MM-dd'),
      scheduledTime: '10:00',
      therapistName: '',
      reason: '',
      instructions: '',
    })
  }

  const handleSchedule = async () => {
    if (!form.patientId) {
      toast({ title: 'Error', description: 'Please select a patient', variant: 'destructive' })
      return
    }
    try {
      const res = await authFetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: form.patientId,
          type: form.type,
          scheduledDate: new Date(`${form.scheduledDate}T${form.scheduledTime || '10:00'}:00`).toISOString(),
          scheduledTime: form.scheduledTime,
          therapistName: form.therapistName,
          reason: form.reason,
          instructions: form.instructions,
        }),
      })
      if (res.ok) {
        toast({ title: 'Success', description: 'Assessment scheduled successfully' })
        setScheduleDialogOpen(false)
        resetScheduleForm()
        fetchAssessments()
      } else {
        const json = await res.json()
        toast({ title: 'Error', description: json.error || 'Failed to schedule assessment', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to schedule assessment', variant: 'destructive' })
    }
  }

  const openComplete = (assessment: Assessment) => {
    setSelectedAssessment(assessment)
    setCompleteForm({
      findings: assessment.findings || '',
      recommendations: assessment.recommendations || '',
      notes: assessment.notes || '',
    })
    setCompleteDialogOpen(true)
  }

  // ── Print the assessment record on the clinic letterhead ──
  const handlePrintAssessment = (assessment: Assessment) => {
    printWithSettings((mode, branding, output) => {
    const infoRow = (label: string, value: string) =>
      `<tr><td style="width:35%;font-weight:600;color:#6b7280;padding:5px 8px;border:1px solid #e5e7eb;">${label}</td><td style="padding:5px 8px;border:1px solid #e5e7eb;">${esc(value) || 'N/A'}</td></tr>`

    const observations = parseObservations(assessment.observations)
    const obsRows = Object.keys(OBSERVATION_LABELS)
      .map((k) => {
        const key = k as keyof ObservationData
        return infoRow(OBSERVATION_LABELS[key], observations[key] || '—')
      })
      .join('')

    const bodyHTML = `
      <h3 style="margin-top:0;color:#0f766e;">Assessment Information</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
        <tbody>
          ${infoRow('Patient', `${assessment.patient?.childName || 'N/A'} (${assessment.patient?.patientId || ''})`)}
          ${infoRow('Type', assessment.type || 'N/A')}
          ${infoRow('Status', assessment.status || 'N/A')}
          ${infoRow('Therapist', assessment.therapistName || 'Not assigned')}
          ${infoRow('Scheduled By', assessment.scheduledBy || '—')}
          ${infoRow('Scheduled Date', assessment.scheduledDate ? format(new Date(assessment.scheduledDate), 'dd MMM yyyy') : 'N/A')}
          ${infoRow('Scheduled Time', assessment.scheduledTime || '—')}
          ${infoRow('Completed Date', assessment.completedDate ? format(new Date(assessment.completedDate), 'dd MMM yyyy') : 'Not completed')}
          ${infoRow('Completed By', assessment.completedBy || '—')}
        </tbody>
      </table>

      ${assessment.reason ? `<h3 style="color:#0f766e;">Reason for Assessment</h3><div style="border:1px solid #e5e7eb;padding:10px 12px;border-radius:4px;font-size:12px;white-space:pre-wrap;margin-bottom:14px;">${esc(assessment.reason)}</div>` : ''}

      ${assessment.diagnosis ? `<h3 style="color:#0f766e;">Diagnosis</h3><div style="border:1px solid #e5e7eb;padding:10px 12px;border-radius:4px;font-size:12px;white-space:pre-wrap;margin-bottom:14px;">${esc(assessment.diagnosis)}</div>` : ''}

      ${assessment.history ? `<h3 style="color:#0f766e;">History</h3><div style="border:1px solid #e5e7eb;padding:10px 12px;border-radius:4px;font-size:12px;white-space:pre-wrap;margin-bottom:14px;">${esc(assessment.history)}</div>` : ''}

      ${assessment.findings ? `<h3 style="color:#0f766e;">Assessment Findings</h3><div style="border:1px solid #e5e7eb;padding:10px 12px;border-radius:4px;font-size:12px;white-space:pre-wrap;margin-bottom:14px;">${esc(assessment.findings)}</div>` : ''}

      <h3 style="color:#0f766e;">Observations</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;">
        <tbody>${obsRows}</tbody>
      </table>

      ${assessment.therapistNotes ? `<h3 style="color:#0f766e;">Therapist Notes</h3><div style="border:1px solid #e5e7eb;padding:10px 12px;border-radius:4px;font-size:12px;white-space:pre-wrap;margin-bottom:14px;">${esc(assessment.therapistNotes)}</div>` : ''}
      ${assessment.treatmentPlan ? `<h3 style="color:#0f766e;">Treatment Plan</h3><div style="border:1px solid #e5e7eb;padding:10px 12px;border-radius:4px;font-size:12px;white-space:pre-wrap;margin-bottom:14px;">${esc(assessment.treatmentPlan)}</div>` : ''}
      ${assessment.goals ? `<h3 style="color:#0f766e;">Goals</h3><div style="border:1px solid #e5e7eb;padding:10px 12px;border-radius:4px;font-size:12px;white-space:pre-wrap;margin-bottom:14px;">${esc(assessment.goals)}</div>` : ''}
      ${assessment.recommendation ? `<h3 style="color:#0f766e;">Recommendation</h3><div style="border:1px solid #e5e7eb;padding:10px 12px;border-radius:4px;font-size:12px;white-space:pre-wrap;margin-bottom:14px;">${esc(assessment.recommendation)}</div>` : ''}
      ${assessment.nextAssessmentDate ? `<h3 style="color:#0f766e;">Next Assessment Date</h3><div style="border:1px solid #e5e7eb;padding:10px 12px;border-radius:4px;font-size:12px;white-space:pre-wrap;margin-bottom:14px;">${format(new Date(assessment.nextAssessmentDate), 'dd MMM yyyy')}</div>` : ''}
      ${assessment.notes ? `<h3 style="color:#0f766e;">Notes</h3><div style="border:1px solid #e5e7eb;padding:10px 12px;border-radius:4px;font-size:12px;white-space:pre-wrap;margin-bottom:14px;">${esc(assessment.notes)}</div>` : ''}
    `

    const html = buildDocumentHTML({
      title: 'Assessment Report',
      subtitle: `${assessment.patient?.childName || ''} (${assessment.patient?.patientId || ''}) — ${assessment.type || 'Assessment'}`,
      bodyHTML,
      footerNote: branding.centerName ? `${branding.centerName} — Assessment Report` : undefined,
      windowTitle: `Assessment - ${assessment.patient?.childName || ''}`,
      autoPrint: false,
      mode,
      branding,
    })
    deliverDocument(html, output, {
      fileName: `Assessment - ${assessment.patient?.childName || 'patient'}`,
      shareTitle: 'Assessment Report',
      shareText: `Assessment report for ${assessment.patient?.childName || 'your child'}`,
      patientId: assessment.patientId,
      patientPhone: assessment.patient?.mobile || undefined,
    })
    })
  }

  // Super Admin's legacy Complete handler (uses findings/recommendations/notes).
  // Note: API only lets therapists update `findings`; admin's findings text may be
  // dropped by the API — that's acceptable since the new flow expects therapists
  // to fill the form.
  const handleComplete = async () => {
    if (!selectedAssessment) return
    const findings = completeForm.findings.trim()
    const recommendations = completeForm.recommendations.trim()
    if (!findings) throw new Error('Findings are required')
    if (!recommendations) throw new Error('Recommendations are required')
    const res = await authFetch('/api/assessments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: selectedAssessment.id,
        status: 'completed',
        findings,
        recommendations,
        notes: completeForm.notes,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to complete assessment')
    }
    setSelectedAssessment(null)
    fetchAssessments()
  }

  const updateStatus = async (id: string, status: string) => {
    const res = await authFetch('/api/assessments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to update assessment')
    }
    await fetchAssessments()
  }

  const openActionDialog = (assessment: Assessment, type: 'reschedule' | 'no_show' | 'cancel') => {
    setActionAssessment(assessment)
    setActionType(type)
    // Pre-fill the reschedule form with the assessment's current scheduled date/time
    if (type === 'reschedule' && assessment.scheduledDate) {
      try {
        const d = new Date(assessment.scheduledDate)
        setRescheduleForm({
          date: format(d, 'yyyy-MM-dd'),
          time: assessment.scheduledTime || format(d, 'HH:mm'),
        })
      } catch {
        setRescheduleForm({ date: format(new Date(), 'yyyy-MM-dd'), time: '10:00' })
      }
    } else {
      setRescheduleForm({ date: '', time: '10:00' })
    }
    setActionDialogOpen(true)
  }

  // ActionDialog onConfirm — performs the actual status change. ActionDialog
  // handles success/error toasts + dialog close.
  const submitAction = async (notes: string) => {
    if (!actionAssessment || !actionType) return
    const map: Record<string, string> = {
      reschedule: 'rescheduled',
      no_show: 'no_show',
      cancel: 'cancelled',
    }
    const newStatus = map[actionType]
    const id = actionAssessment.id
    try {
      if (actionType === 'reschedule') {
        // Move the assessment to the new rescheduled date + time.
        // Combine the picked date (yyyy-MM-dd) + time (HH:mm) into an ISO datetime.
        if (!rescheduleForm.date) {
          throw new Error('Please pick a new date for the rescheduled assessment.')
        }
        const newScheduledDate = new Date(`${rescheduleForm.date}T${rescheduleForm.time || '10:00'}:00`)
        const res = await authFetch('/api/assessments', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status: newStatus, scheduledDate: newScheduledDate.toISOString() }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Failed to reschedule assessment')
        }
        await fetchAssessments()
        // Optimistically update the local state with the new date too
        setAssessments(prev => prev.map(a => a.id === id ? { ...a, status: newStatus, scheduledDate: newScheduledDate.toISOString() } : a))
        setActionNotes(prev => ({ ...prev, [id]: { action: actionType, note: notes } }))
      } else {
        await updateStatus(id, newStatus)
        if (actionType === 'cancel') {
          setAssessments(prev => prev.map(a => a.id === id ? { ...a, status: newStatus, notes } : a))
        } else {
          setAssessments(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a))
          setActionNotes(prev => ({ ...prev, [id]: { action: actionType, note: notes } }))
        }
      }
    } finally {
      setActionAssessment(null)
      setActionType(null)
    }
  }

  // ActionDialog props derived from current actionType
  const actionDialogProps = (() => {
    switch (actionType) {
      case 'reschedule':
        return { actionLabel: 'Reschedule Assessment', variant: 'warning' as const, actionLogType: 'rescheduled', description: 'Mark this assessment for rescheduling. A reason is required.' }
      case 'no_show':
        return { actionLabel: 'Mark as No Show', variant: 'warning' as const, actionLogType: 'no_show', description: 'Mark this assessment as a no-show. A reason is required.' }
      case 'cancel':
        return { actionLabel: 'Cancel Assessment', variant: 'destructive' as const, actionLogType: 'cancelled', description: 'Cancel this assessment. A reason is required.' }
      default:
        return { actionLabel: 'Assessment Action', variant: 'default' as const, actionLogType: 'action', description: '' }
    }
  })()

  const openView = (assessment: Assessment) => {
    setSelectedAssessment(assessment)
    setViewDialogOpen(true)
  }

  // ── Therapist Assessment Form dialog ──
  const openAssessmentForm = (assessment: Assessment) => {
    setSelectedAssessment(assessment)
    setAssessmentForm({
      diagnosis: assessment.diagnosis || '',
      history: assessment.history || '',
      findings: assessment.findings || '',
      observations: parseObservations(assessment.observations),
      therapistNotes: assessment.therapistNotes || '',
      treatmentPlan: assessment.treatmentPlan || '',
      goals: assessment.goals || '',
      recommendation: assessment.recommendation || '',
      nextAssessmentDate: assessment.nextAssessmentDate
        ? format(new Date(assessment.nextAssessmentDate), 'yyyy-MM-dd')
        : '',
    })
    setAssessmentFormOpen(true)
  }

  const handleSaveDraft = async () => {
    if (!selectedAssessment) return
    setSavingDraft(true)
    try {
      const res = await authFetch('/api/assessments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedAssessment.id,
          status: 'draft',
          diagnosis: assessmentForm.diagnosis,
          history: assessmentForm.history,
          findings: assessmentForm.findings,
          observations: JSON.stringify(assessmentForm.observations),
          therapistNotes: assessmentForm.therapistNotes,
          treatmentPlan: assessmentForm.treatmentPlan,
          goals: assessmentForm.goals,
          recommendation: assessmentForm.recommendation,
          nextAssessmentDate: assessmentForm.nextAssessmentDate || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast({ title: 'Error', description: err.error || 'Failed to save draft', variant: 'destructive' })
        return
      }
      toast({ title: 'Saved', description: 'Assessment draft saved successfully.' })
      setAssessmentFormOpen(false)
      fetchAssessments()
    } catch {
      toast({ title: 'Error', description: 'Failed to save draft', variant: 'destructive' })
    } finally {
      setSavingDraft(false)
    }
  }

  const handleCompleteAssessment = async () => {
    if (!selectedAssessment) return
    setCompletingAssessment(true)
    try {
      const res = await authFetch('/api/assessments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedAssessment.id,
          status: 'completed',
          diagnosis: assessmentForm.diagnosis,
          history: assessmentForm.history,
          findings: assessmentForm.findings,
          observations: JSON.stringify(assessmentForm.observations),
          therapistNotes: assessmentForm.therapistNotes,
          treatmentPlan: assessmentForm.treatmentPlan,
          goals: assessmentForm.goals,
          recommendation: assessmentForm.recommendation,
          nextAssessmentDate: assessmentForm.nextAssessmentDate || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast({ title: 'Error', description: err.error || 'Failed to complete assessment', variant: 'destructive' })
        return
      }
      toast({ title: 'Completed', description: 'Assessment marked as completed.' })
      setConfirmCompleteOpen(false)
      setAssessmentFormOpen(false)
      fetchAssessments()
    } catch {
      toast({ title: 'Error', description: 'Failed to complete assessment', variant: 'destructive' })
    } finally {
      setCompletingAssessment(false)
    }
  }

  // Super Admin reopens a completed assessment (sets status back to 'scheduled').
  const handleReopen = async () => {
    if (!selectedAssessment) return
    setReopeningAssessment(true)
    try {
      const res = await authFetch('/api/assessments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedAssessment.id, status: 'scheduled' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast({ title: 'Error', description: err.error || 'Failed to reopen assessment', variant: 'destructive' })
        return
      }
      toast({ title: 'Reopened', description: 'Assessment has been reopened for editing.' })
      setAssessmentFormOpen(false)
      setViewDialogOpen(false)
      fetchAssessments()
    } catch {
      toast({ title: 'Error', description: 'Failed to reopen assessment', variant: 'destructive' })
    } finally {
      setReopeningAssessment(false)
    }
  }

  // ── Export to Excel — re-fetches with the currently active filters
  // (type/status/search/date-range) but a large limit so ALL matching
  // records are exported, not just the current page. ──
  const [exportingAssessments, setExportingAssessments] = useState(false)
  const handleExportAssessments = async () => {
    if (exportingAssessments) return
    setExportingAssessments(true)
    try {
      const params = new URLSearchParams({ limit: '100000', page: '1' })
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (debouncedQuery) params.set('search', debouncedQuery)
      if (rangeFilter === 'custom') {
        if (customStartDate) params.set('startDate', customStartDate)
        if (customEndDate) params.set('endDate', customEndDate)
      } else if (rangeFilter !== 'all') {
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
      const res = await authFetch(`/api/assessments?${params.toString()}`)
      if (!res.ok) {
        toast({ title: 'Error', description: 'Failed to export assessments. Please try again.', variant: 'destructive' })
        return
      }
      const json = await res.json()
      const all: Assessment[] = json.assessments || []

      const headers = [
        'Patient', 'Patient ID', 'Type', 'Status', 'Scheduled Date', 'Scheduled Time',
        'Completed Date', 'Therapist', 'Scheduled By', 'Completed By', 'Reason',
        'Instructions', 'Diagnosis', 'History', 'Findings', 'Therapist Notes',
        'Treatment Plan', 'Goals', 'Recommendation', 'Next Assessment Date', 'Notes',
      ]
      const rows = all.map((a) => [
        a.patient?.childName || 'Unknown',
        a.patient?.patientId || '',
        a.type || '',
        getStatusBadgeLabel(a.status),
        a.scheduledDate ? format(new Date(a.scheduledDate), 'dd MMM yyyy') : '',
        a.scheduledTime || '',
        a.completedDate ? format(new Date(a.completedDate), 'dd MMM yyyy') : '',
        a.therapistName || '',
        a.scheduledBy || '',
        a.completedBy || '',
        a.reason || '',
        a.instructions || '',
        a.diagnosis || '',
        a.history || '',
        a.findings || '',
        a.therapistNotes || '',
        a.treatmentPlan || '',
        a.goals || '',
        a.recommendation || '',
        a.nextAssessmentDate ? format(new Date(a.nextAssessmentDate), 'dd MMM yyyy') : '',
        a.notes || '',
      ])

      const XLSX = await import('xlsx')
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Assessments')
      XLSX.writeFile(wb, 'Assessments.xlsx')
    } catch (err) {
      console.error('Failed to export assessments:', err)
      toast({ title: 'Error', description: 'Something went wrong while exporting. Please try again.', variant: 'destructive' })
    } finally {
      setExportingAssessments(false)
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Loading skeleton (shared)
  // ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Card>
          <CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent>
        </Card>
      </div>
    )
  }

  // Stats
  const scheduled = assessments.filter(a => a.status === 'scheduled').length
  const completed = assessments.filter(a => a.status === 'completed').length
  const cancelled = assessments.filter(a => a.status === 'cancelled').length
  const rescheduled = assessments.filter(a => a.status === 'rescheduled').length
  const totalPages = Math.max(1, Math.ceil(total / limit || 1))

  // ═══════════════════════════════════════════════════════════════
  // THERAPIST VIEW — "My Assessments" (simplified)
  // ═══════════════════════════════════════════════════════════════
  if (isTherapist) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">My Assessments</h1>
            <p className="text-muted-foreground text-sm">Assessments assigned to you</p>
          </div>
          <Button variant="outline" onClick={handleExportAssessments} disabled={exportingAssessments} className="gap-2">
            <Download className="h-4 w-4" />
            Export to Excel
          </Button>
        </div>

        {/* Simple Filters — only search + status filter */}
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4" />
              Filters:
            </div>
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <SearchInput
                value={query}
                onChange={setQuery}
                onClear={clear}
                loading={isDebouncing || loading}
                placeholder="Search by patient or notes..."
                className="w-full sm:w-72"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px] h-9">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground">
              {total} assessment{total !== 1 ? 's' : ''}
            </div>
          </div>
        </Card>

        {/* Simplified Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead className="hidden sm:table-cell">Assessment Type</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                  <TableHead className="hidden lg:table-cell">Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No assessments assigned to you yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  assessments.map(assessment => (
                    <TableRow key={assessment.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div>
                          <p className="font-medium">{assessment.patient?.childName || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{assessment.patient?.patientId}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {getTypeBadge(assessment.type)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {format(new Date(assessment.scheduledDate), 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">
                        {assessment.scheduledTime || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>{getStatusBadge(assessment.status)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openAssessmentForm(assessment)}
                          title="Open Assessment"
                          aria-label="Open assessment"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Therapist Assessment Form Dialog */}
        <TherapistAssessmentFormDialog
          open={assessmentFormOpen}
          onOpenChange={setAssessmentFormOpen}
          assessment={selectedAssessment}
          form={assessmentForm}
          setForm={setAssessmentForm}
          savingDraft={savingDraft}
          completingAssessment={completingAssessment}
          reopeningAssessment={reopeningAssessment}
          isTherapist={isTherapist}
          isSuperAdmin={isSuperAdmin}
          onSaveDraft={handleSaveDraft}
          onComplete={() => setConfirmCompleteOpen(true)}
          onReopen={handleReopen}
          onPrint={handlePrintAssessment}
        />

        {/* Complete Assessment Confirmation Dialog */}
        <Dialog open={confirmCompleteOpen} onOpenChange={setConfirmCompleteOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Complete Assessment?</DialogTitle>
              <DialogDescription>
                Once completed, the assessment will be locked. You will not be able to edit it
                unless a Super Admin reopens it.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2 text-sm text-muted-foreground">
              Please make sure all findings, observations, and recommendations are filled in
              correctly before completing.
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmCompleteOpen(false)}>Cancel</Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleCompleteAssessment}
                disabled={completingAssessment}
              >
                {completingAssessment ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Completing...</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4 mr-2" /> Confirm Complete</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // SUPER ADMIN VIEW — full management (existing behavior, enhanced)
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assessments</h1>
          <p className="text-muted-foreground text-sm">Schedule and track patient assessments</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportAssessments} disabled={exportingAssessments} className="gap-2">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export to Excel</span>
            <span className="sm:hidden">Export</span>
          </Button>
          <Button onClick={() => setScheduleDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Schedule Assessment</span>
            <span className="sm:hidden">Schedule</span>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {/* Total — indigo gradient. Reflects the full count matching the
            currently active date-range/type/status/search filters (the
            `total` from the API), not just the current page's row count
            like the other four cards below. */}
        <div className="stat-card-premium stat-grad-indigo">
          <div className="flex items-center gap-3 relative z-10">
            <div className="stat-icon-premium" style={{ width: 44, height: 44 }}>
              <ClipboardList className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-white/80">Total</p>
              <p className="text-xl font-bold text-white">{total}</p>
            </div>
          </div>
        </div>
        {/* Scheduled — blue gradient */}
        <div className="stat-card-premium stat-grad-blue">
          <div className="flex items-center gap-3 relative z-10">
            <div className="stat-icon-premium" style={{ width: 44, height: 44 }}>
              <Calendar className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-white/80">Scheduled</p>
              <p className="text-xl font-bold text-white">{scheduled}</p>
            </div>
          </div>
        </div>
        {/* Completed — green gradient */}
        <div className="stat-card-premium stat-grad-green">
          <div className="flex items-center gap-3 relative z-10">
            <div className="stat-icon-premium" style={{ width: 44, height: 44 }}>
              <ClipboardCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-white/80">Completed</p>
              <p className="text-xl font-bold text-white">{completed}</p>
            </div>
          </div>
        </div>
        {/* Cancelled — red gradient */}
        <div className="stat-card-premium stat-grad-red">
          <div className="flex items-center gap-3 relative z-10">
            <div className="stat-icon-premium" style={{ width: 44, height: 44 }}>
              <XCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-white/80">Cancelled</p>
              <p className="text-xl font-bold text-white">{cancelled}</p>
            </div>
          </div>
        </div>
        {/* Rescheduled — orange/purple gradient */}
        <div className="stat-card-premium stat-grad-orange">
          <div className="flex items-center gap-3 relative z-10">
            <div className="stat-icon-premium" style={{ width: 44, height: 44 }}>
              <Stethoscope className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-white/80">Rescheduled</p>
              <p className="text-xl font-bold text-white">{rescheduled}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="h-4 w-4" />
            Filters:
          </div>
          {/* Date range filter (All / Today / Weekly / Monthly) */}
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
            {([
              { key: 'all', label: 'All' },
              { key: 'today', label: 'Today' },
              { key: 'week', label: 'Weekly' },
              { key: 'month', label: 'Monthly' },
              { key: 'custom', label: 'Custom' },
            ] as const).map(r => (
              <button
                key={r.key}
                onClick={() => setRangeFilter(r.key)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  rangeFilter === r.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {rangeFilter === 'custom' && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="h-8 w-36 text-xs"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="h-8 w-36 text-xs"
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <SearchInput
              value={query}
              onChange={setQuery}
              onClear={clear}
              loading={isDebouncing || loading}
              placeholder="Search by patient, therapist or notes..."
              className="w-full sm:w-72"
            />
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[200px] h-9">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {assessmentTypeOptions.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[150px] h-9">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground">
            {total} assessment{total !== 1 ? 's' : ''}
          </div>
        </div>
      </Card>

      {/* Pagination controls (moved below table) */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {total === 0 ? 'No results' : `Showing ${Math.min(total, (page - 1) * limit + 1)}–${Math.min(total, page * limit)} of ${total}`}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setPage(1)} disabled={page <= 1}>First</Button>
          <Button variant="ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Prev</Button>

          {/* Numbered page buttons (windowed) */}
          <div className="inline-flex items-center gap-1">
            {(() => {
              const pages: (number | '...')[] = []
              const windowSize = 5
              if (totalPages <= windowSize + 2) {
                for (let i = 1; i <= totalPages; i++) pages.push(i)
              } else {
                const left = Math.max(2, page - 2)
                const right = Math.min(totalPages - 1, page + 2)
                pages.push(1)
                if (left > 2) pages.push('...')
                for (let i = left; i <= right; i++) pages.push(i)
                if (right < totalPages - 1) pages.push('...')
                pages.push(totalPages)
              }
              return pages.map((pNum, idx) => (
                pNum === '...' ? (
                  <span key={`e-${idx}`} className="px-2">…</span>
                ) : (
                  <Button key={pNum} variant={pNum === page ? 'default' : 'ghost'} onClick={() => setPage(Number(pNum))}>{pNum}</Button>
                )
              ))
            })()}
          </div>

          <Button variant="ghost" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</Button>
          <Button variant="ghost" onClick={() => setPage(totalPages)} disabled={page >= totalPages}>Last</Button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Per page</span>
            <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1) }} className="border rounded px-2 py-1 text-sm">
              {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      

      {/* Assessment Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Patient</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="hidden md:table-cell">Scheduled</TableHead>
                <TableHead className="hidden lg:table-cell">Completed</TableHead>
                <TableHead className="hidden xl:table-cell">Therapist</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assessments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No assessments found. Schedule your first assessment.
                  </TableCell>
                </TableRow>
              ) : (
                assessments.map(assessment => (
                  <React.Fragment key={assessment.id}>
                    <TableRow className="hover:bg-muted/50">
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setExpandedRow(expandedRow === assessment.id ? null : assessment.id)}
                        >
                          {expandedRow === assessment.id
                            ? <ChevronUp className="h-4 w-4" />
                            : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{assessment.patient?.childName || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{assessment.patient?.patientId}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {getTypeBadge(assessment.type)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {format(new Date(assessment.scheduledDate), 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">
                        {assessment.completedDate
                          ? format(new Date(assessment.completedDate), 'dd MMM yyyy')
                          : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-sm">
                        {assessment.therapistName || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(assessment.status)}
                        {assessment.status === 'cancelled' && assessment.notes && (
                          <div className="text-xs text-muted-foreground mt-1">Reason: {assessment.notes}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openView(assessment)}
                            title="View Details"
                            aria-label="View assessment details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {(assessment.status === 'scheduled' || assessment.status === 'in_progress') && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openComplete(assessment)}
                              title="Complete Assessment"
                              aria-label="Complete assessment"
                            >
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            </Button>
                          )}
                          {assessment.status === 'completed' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setSelectedAssessment(assessment)
                                setViewDialogOpen(true)
                              }}
                              title="Reopen Assessment"
                              aria-label="Reopen assessment"
                            >
                              <RotateCcw className="h-4 w-4 text-amber-600" />
                            </Button>
                          )}
                          {assessment.status !== 'completed' && assessment.status !== 'cancelled' && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openActionDialog(assessment, 'reschedule')}
                                title="Reschedule Assessment"
                                aria-label="Reschedule assessment"
                              >
                                <Clock className="h-4 w-4 text-amber-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openActionDialog(assessment, 'no_show')}
                                title="Mark No Show"
                                aria-label="Mark assessment as no-show"
                              >
                                <UserX className="h-4 w-4 text-amber-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openActionDialog(assessment, 'cancel')}
                                title="Cancel Assessment"
                                aria-label="Cancel assessment"
                              >
                                <XCircle className="h-4 w-4 text-red-500" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {/* Expanded row showing quick details */}
                    {expandedRow === assessment.id && (
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={8}>
                          <div className="py-3 px-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Type</p>
                                <p>{assessment.type}</p>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Scheduled Date</p>
                                <p>{format(new Date(assessment.scheduledDate), 'dd MMM yyyy')}</p>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Therapist</p>
                                <p>{assessment.therapistName || 'Not assigned'}</p>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Status</p>
                                <div className="mt-0.5">{getStatusBadge(assessment.status)}</div>
                              </div>
                            </div>
                            {assessment.findings && (
                              <div className="mt-3 pt-3 border-t">
                                <p className="text-xs font-medium text-muted-foreground mb-1">Findings</p>
                                <p className="text-sm">{assessment.findings}</p>
                              </div>
                            )}
                            {assessment.recommendations && (
                              <div className="mt-2">
                                <p className="text-xs font-medium text-muted-foreground mb-1">Recommendations</p>
                                <p className="text-sm">{assessment.recommendations}</p>
                              </div>
                            )}
                            {(!assessment.findings && !assessment.recommendations) && (
                              <p className="mt-2 text-sm text-muted-foreground italic">No findings or recommendations recorded yet.</p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Schedule Assessment Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Schedule Assessment</DialogTitle>
            <DialogDescription>Schedule a new assessment for a patient. Status is auto-set to "Scheduled".</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 overflow-y-auto flex-1 px-1">
            <div className="space-y-2">
              <Label>Patient *</Label>
              <div className="space-y-2">
                <Input
                  placeholder="Search patients..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                />
                <Select value={form.patientId} onValueChange={(v) => setForm(prev => ({ ...prev, patientId: v }))}>
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
            </div>

            <div className="space-y-2">
              <Label>Assessment Type *</Label>
              <Select value={form.type} onValueChange={handleAssessmentTypeSelect}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assessmentTypeOptions.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                  <SelectItem value="__add_new__" className="text-primary font-medium">
                    + Add New Type
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Assessment Date *</Label>
                <Input
                  type="date"
                  value={form.scheduledDate}
                  onChange={(e) => setForm(prev => ({ ...prev, scheduledDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Time Slot *</Label>
                <Select value={form.scheduledTime} onValueChange={(v) => setForm(prev => ({ ...prev, scheduledTime: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {['10:00', '10:45', '11:30', '12:15', '13:30', '14:15', '15:00', '15:45', '16:30', '17:15', '18:00', '18:45', '19:30', '20:15', '21:00'].map(time => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Therapist</Label>
              <Select value={form.therapistName || ''} onValueChange={(value) => setForm(prev => ({ ...prev, therapistName: value }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select therapist" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <div className="px-3 py-2">
                    <Input
                      placeholder="Search therapists..."
                      value={therapistSearch}
                      onChange={(e) => setTherapistSearch(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  {therapistsLoading ? (
                    <div className="px-3 py-3 text-sm text-muted-foreground">Loading therapists...</div>
                  ) : filteredTherapists.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-muted-foreground">No therapists found</div>
                  ) : (
                    filteredTherapists.map(t => (
                      <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Reason for Assessment</Label>
              <Textarea
                placeholder="Why is this assessment being scheduled? (optional)"
                value={form.reason}
                onChange={(e) => setForm(prev => ({ ...prev, reason: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSchedule}>Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add New Assessment Type Dialog (inline, from the Assessment Type dropdown) */}
      <Dialog open={newTypeDialogOpen} onOpenChange={setNewTypeDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add New Assessment Type</DialogTitle>
            <DialogDescription>This will be added to the Assessment Type list for everyone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="new-assessment-type">Type Name *</Label>
            <Input
              id="new-assessment-type"
              placeholder="e.g. Occupational Therapy Screening"
              value={newTypeLabel}
              onChange={(e) => setNewTypeLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddAssessmentType() }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTypeDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddAssessmentType} disabled={newTypeSaving}>
              {newTypeSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Type
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action Confirmation Dialog (Reschedule / No Show / Cancel) — ActionDialog (Task A1) */}
      <ActionDialog
        open={actionDialogOpen}
        onOpenChange={setActionDialogOpen}
        module="assessments"
        recordId={actionAssessment?.id || ''}
        actionType={actionDialogProps.actionLogType}
        actionLabel={actionDialogProps.actionLabel}
        description={
          actionDialogProps.description +
          (actionAssessment ? ` — ${actionAssessment.patient?.childName || 'Unknown'} (${actionAssessment.type})` : '')
        }
        variant={actionDialogProps.variant}
        onConfirm={submitAction}
        disableConfirm={actionType === 'reschedule' && !rescheduleForm.date}
      >
        {actionType === 'reschedule' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>New Date <span className="text-destructive">*</span></Label>
              <DatePicker
                value={rescheduleForm.date}
                onChange={(v) => setRescheduleForm(prev => ({ ...prev, date: v }))}
                placeholder="Pick a new date"
              />
            </div>
            <div className="space-y-1.5">
              <Label>New Time</Label>
              <Input
                type="time"
                value={rescheduleForm.time}
                onChange={(e) => setRescheduleForm(prev => ({ ...prev, time: e.target.value }))}
              />
            </div>
          </div>
        )}
      </ActionDialog>

      {/* View Assessment Dialog (Super Admin) */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Assessment Details</DialogTitle>
            <DialogDescription>
              {selectedAssessment?.type} - {selectedAssessment?.patient?.childName}
            </DialogDescription>
          </DialogHeader>
          {selectedAssessment && (
            <div className="space-y-4 py-2 overflow-y-auto flex-1 px-1">
              {/* Assessment Information (read-only card) */}
              <div className="rounded-lg bg-muted/40 border p-4 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Patient</p>
                    <p className="text-sm font-medium">{selectedAssessment.patient?.childName}</p>
                    <p className="text-xs text-muted-foreground">{selectedAssessment.patient?.patientId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <div className="mt-0.5">{getStatusBadge(selectedAssessment.status)}</div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <div className="mt-0.5">{getTypeBadge(selectedAssessment.type)}</div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Therapist</p>
                    <p className="text-sm">{selectedAssessment.therapistName || 'Not assigned'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Scheduled By</p>
                    <p className="text-sm">{selectedAssessment.scheduledBy || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Scheduled Date & Time</p>
                    <p className="text-sm">
                      {format(new Date(selectedAssessment.scheduledDate), 'dd MMM yyyy')}
                      {selectedAssessment.scheduledTime ? ` · ${selectedAssessment.scheduledTime}` : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Completed Date</p>
                    <p className="text-sm">
                      {selectedAssessment.completedDate
                        ? format(new Date(selectedAssessment.completedDate), 'dd MMM yyyy')
                        : 'Not completed'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Completed By</p>
                    <p className="text-sm">{selectedAssessment.completedBy || '—'}</p>
                  </div>
                </div>
                {selectedAssessment.reason && (
                  <div className="pt-2 border-t mt-2">
                    <p className="text-xs text-muted-foreground">Reason for Assessment</p>
                    <p className="text-sm whitespace-pre-wrap">{selectedAssessment.reason}</p>
                  </div>
                )}
                {selectedAssessment.instructions && (
                  <div className="pt-2">
                    <p className="text-xs text-muted-foreground">Instructions from Super Admin</p>
                    <p className="text-sm whitespace-pre-wrap">{selectedAssessment.instructions}</p>
                  </div>
                )}
              </div>

              {/* Therapist's findings (only when completed/draft) */}
              {(selectedAssessment.status === 'completed' || selectedAssessment.status === 'draft') && (
                <>
                  {selectedAssessment.diagnosis && (
                    <div className="pt-3 border-t">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-4 w-4 text-primary" />
                        <p className="text-xs font-medium">Diagnosis</p>
                      </div>
                      <div className="rounded-md border p-3 bg-muted/20">
                        <p className="text-sm whitespace-pre-wrap">{selectedAssessment.diagnosis}</p>
                      </div>
                    </div>
                  )}

                  {selectedAssessment.history && (
                    <div className="pt-2">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-4 w-4 text-primary" />
                        <p className="text-xs font-medium">History</p>
                      </div>
                      <div className="rounded-md border p-3 bg-muted/20">
                        <p className="text-sm whitespace-pre-wrap">{selectedAssessment.history}</p>
                      </div>
                    </div>
                  )}

                  {selectedAssessment.findings && (
                    <div className="pt-3 border-t">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-4 w-4 text-primary" />
                        <p className="text-xs font-medium">Assessment Findings</p>
                      </div>
                      <div className="rounded-md border p-3 bg-muted/20">
                        <p className="text-sm whitespace-pre-wrap">{selectedAssessment.findings}</p>
                      </div>
                    </div>
                  )}

                  {/* Observations grid (read-only) */}
                  {selectedAssessment.observations && (() => {
                    const obs = parseObservations(selectedAssessment.observations)
                    const hasAny = Object.values(obs).some(v => !!v)
                    if (!hasAny) return null
                    return (
                      <div className="pt-2">
                        <div className="flex items-center gap-2 mb-1">
                          <ClipboardCheck className="h-4 w-4 text-primary" />
                          <p className="text-xs font-medium">Observations</p>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-md border p-3 bg-muted/20">
                          {(Object.keys(OBSERVATION_LABELS) as (keyof ObservationData)[]).map(k => (
                            <div key={k} className="text-xs">
                              <p className="text-muted-foreground">{OBSERVATION_LABELS[k]}</p>
                              <p className="font-medium">{obs[k] || '—'}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  {selectedAssessment.therapistNotes && (
                    <div className="pt-2">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-4 w-4 text-primary" />
                        <p className="text-xs font-medium">Therapist Notes</p>
                      </div>
                      <div className="rounded-md border p-3 bg-muted/20">
                        <p className="text-sm whitespace-pre-wrap">{selectedAssessment.therapistNotes}</p>
                      </div>
                    </div>
                  )}

                  {selectedAssessment.treatmentPlan && (
                    <div className="pt-2">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-4 w-4 text-primary" />
                        <p className="text-xs font-medium">Treatment Plan</p>
                      </div>
                      <div className="rounded-md border p-3 bg-muted/20">
                        <p className="text-sm whitespace-pre-wrap">{selectedAssessment.treatmentPlan}</p>
                      </div>
                    </div>
                  )}

                  {selectedAssessment.goals && (
                    <div className="pt-2">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-4 w-4 text-primary" />
                        <p className="text-xs font-medium">Goals</p>
                      </div>
                      <div className="rounded-md border p-3 bg-muted/20">
                        <p className="text-sm whitespace-pre-wrap">{selectedAssessment.goals}</p>
                      </div>
                    </div>
                  )}

                  {selectedAssessment.recommendation && (
                    <div className="pt-2">
                      <p className="text-xs text-muted-foreground">Recommendation</p>
                      <p className="text-sm font-medium">{selectedAssessment.recommendation}</p>
                    </div>
                  )}

                  {selectedAssessment.nextAssessmentDate && (
                    <div className="pt-2">
                      <p className="text-xs text-muted-foreground">Next Assessment Date</p>
                      <p className="text-sm">{format(new Date(selectedAssessment.nextAssessmentDate), 'dd MMM yyyy')}</p>
                    </div>
                  )}

                  {(selectedAssessment.completedBy || selectedAssessment.completedAt) && (
                    <div className="pt-3 border-t text-xs text-muted-foreground flex flex-wrap gap-3">
                      {selectedAssessment.completedBy && (
                        <span>Completed By: <span className="font-medium text-foreground">{selectedAssessment.completedBy}</span></span>
                      )}
                      {selectedAssessment.completedAt && (
                        <span>Completed At: <span className="font-medium text-foreground">{format(new Date(selectedAssessment.completedAt), 'dd MMM yyyy HH:mm')}</span></span>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Legacy recommendations / notes (from old Complete dialog) */}
              {selectedAssessment.recommendations && (
                <div className="pt-2 border-t">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="h-4 w-4 text-primary" />
                    <p className="text-xs font-medium">Recommendations (legacy)</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-sm whitespace-pre-wrap">{selectedAssessment.recommendations}</p>
                  </div>
                </div>
              )}

              {selectedAssessment.notes && (
                <div className="pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                  <div className="rounded-md border p-3">
                    <p className="text-sm whitespace-pre-wrap">{selectedAssessment.notes}</p>
                  </div>
                </div>
              )}

              {(!selectedAssessment.diagnosis && !selectedAssessment.history && !selectedAssessment.findings && !selectedAssessment.recommendations && !selectedAssessment.notes && !selectedAssessment.therapistNotes && !selectedAssessment.treatmentPlan && !selectedAssessment.goals && !selectedAssessment.observations) && (
                <div className="pt-3 border-t text-center">
                  <p className="text-sm text-muted-foreground italic">No details recorded for this assessment.</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Close</Button>
            {selectedAssessment && (
              <Button variant="outline" onClick={() => handlePrintAssessment(selectedAssessment)} className="gap-1.5">
                <Printer className="h-4 w-4" />Print
              </Button>
            )}
            {selectedAssessment?.status === 'completed' && (
              <Button
                variant="outline"
                className="gap-1.5 border-amber-500 text-amber-700 hover:bg-amber-50"
                onClick={handleReopen}
                disabled={reopeningAssessment}
              >
                {reopeningAssessment ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Reopening...</>
                ) : (
                  <><RotateCcw className="h-4 w-4" /> Reopen Assessment</>
                )}
              </Button>
            )}
            {(selectedAssessment?.status === 'scheduled' || selectedAssessment?.status === 'in_progress') && (
              <Button onClick={() => { setViewDialogOpen(false); openComplete(selectedAssessment!) }}>
                <CheckCircle2 className="h-4 w-4 mr-2" />Complete Assessment
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Assessment ActionDialog (Task A1) — findings + recommendations as children */}
      <ActionDialog
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
        module="assessments"
        recordId={selectedAssessment?.id || ''}
        actionType="completed"
        actionLabel="Complete Assessment"
        description={
          selectedAssessment
            ? `Record findings and recommendations for ${selectedAssessment.patient?.childName || 'Unknown'}`
            : 'Record findings and recommendations for this assessment.'
        }
        variant="success"
        onConfirm={handleComplete}
        disableConfirm={
          !completeForm.findings.trim() || !completeForm.recommendations.trim()
        }
      >
        <div className="p-3 rounded-lg bg-muted/50 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Type</p>
              <p className="font-medium">{selectedAssessment?.type}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Scheduled</p>
              <p className="font-medium">
                {selectedAssessment && format(new Date(selectedAssessment.scheduledDate), 'dd MMM yyyy')}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>
            Findings <span className="text-red-500">*</span>
          </Label>
          <Textarea
            placeholder="Enter assessment findings..."
            value={completeForm.findings}
            onChange={(e) => setCompleteForm(prev => ({ ...prev, findings: e.target.value }))}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label>
            Recommendations <span className="text-red-500">*</span>
          </Label>
          <Textarea
            placeholder="Enter recommendations..."
            value={completeForm.recommendations}
            onChange={(e) => setCompleteForm(prev => ({ ...prev, recommendations: e.target.value }))}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label>Additional Notes (optional)</Label>
          <Textarea
            placeholder="Any additional notes (a reason/note is also captured in the mandatory field below)..."
            value={completeForm.notes}
            onChange={(e) => setCompleteForm(prev => ({ ...prev, notes: e.target.value }))}
            rows={2}
          />
        </div>
      </ActionDialog>

      {/* Print Settings Dialog */}
      {PrintSettingsDialog}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Therapist Assessment Form Dialog component
// ═══════════════════════════════════════════════════════════════════
interface TherapistAssessmentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assessment: Assessment | null
  form: {
    diagnosis: string
    history: string
    findings: string
    observations: ObservationData
    therapistNotes: string
    treatmentPlan: string
    goals: string
    recommendation: string
    nextAssessmentDate: string
  }
  setForm: React.Dispatch<React.SetStateAction<{
    diagnosis: string
    history: string
    findings: string
    observations: ObservationData
    therapistNotes: string
    treatmentPlan: string
    goals: string
    recommendation: string
    nextAssessmentDate: string
  }>>
  savingDraft: boolean
  completingAssessment: boolean
  reopeningAssessment: boolean
  isTherapist: boolean
  isSuperAdmin: boolean
  onSaveDraft: () => void
  onComplete: () => void
  onReopen: () => void
  onPrint: (a: Assessment) => void
}

function TherapistAssessmentFormDialog({
  open, onOpenChange, assessment, form, setForm,
  savingDraft, completingAssessment, reopeningAssessment,
  isTherapist, isSuperAdmin,
  onSaveDraft, onComplete, onReopen, onPrint,
}: TherapistAssessmentFormDialogProps) {
  if (!assessment) return null

  const isCompleted = assessment.status === 'completed'
  // Therapist can edit only when status is scheduled/draft (NOT completed).
  // Super admin viewing a non-completed assessment does NOT fill the form
  // (only the therapist does) — show read-only.
  const canEdit = isTherapist && !isCompleted && (assessment.status === 'scheduled' || assessment.status === 'draft' || assessment.status === 'in_progress')
  const showReopenButton = isCompleted && isSuperAdmin

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            Assessment Form
            {getStatusBadge(assessment.status)}
          </DialogTitle>
          <DialogDescription>
            {assessment.type} · {assessment.patient?.childName || 'Unknown'} ({assessment.patient?.patientId || ''})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2 overflow-y-auto flex-1 px-1">
          {/* ── Section A: Assessment Information (read-only) ── */}
          <div className="rounded-lg bg-muted/40 border p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Assessment Information
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Patient Name</p>
                <p className="font-medium">{assessment.patient?.childName || 'Unknown'}</p>
                <p className="text-xs text-muted-foreground">{assessment.patient?.patientId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Assessment Type</p>
                <div className="mt-0.5">{getTypeBadge(assessment.type)}</div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Assessment Date &amp; Time</p>
                <p className="font-medium">
                  {format(new Date(assessment.scheduledDate), 'dd MMM yyyy')}
                  {assessment.scheduledTime ? ` · ${assessment.scheduledTime}` : ''}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Assigned Therapist</p>
                <p className="font-medium">{assessment.therapistName || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Scheduled By</p>
                <p className="font-medium">{assessment.scheduledBy || '—'}</p>
              </div>
            </div>
            {assessment.reason && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">Reason for Assessment</p>
                <p className="text-sm whitespace-pre-wrap">{assessment.reason}</p>
              </div>
            )}
            {assessment.instructions && (
              <div className="pt-2">
                <p className="text-xs text-muted-foreground">Instructions from Super Admin</p>
                <p className="text-sm whitespace-pre-wrap">{assessment.instructions}</p>
              </div>
            )}
          </div>

          {/* ── Section B: Assessment Details (editable when canEdit) ── */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Assessment Details {canEdit ? '' : '(Read-only)'}
            </p>

            {/* Diagnosis */}
            <div className="space-y-2">
              <Label>Diagnosis</Label>
              {canEdit ? (
                <Textarea
                  placeholder="Enter the diagnosis for this assessment..."
                  value={form.diagnosis}
                  onChange={(e) => setForm(prev => ({ ...prev, diagnosis: e.target.value }))}
                  rows={2}
                />
              ) : (
                <div className="rounded-md border p-3 bg-muted/20 text-sm whitespace-pre-wrap min-h-[48px]">
                  {form.diagnosis || <span className="text-muted-foreground italic">No diagnosis recorded.</span>}
                </div>
              )}
            </div>

            {/* History */}
            <div className="space-y-2">
              <Label>History</Label>
              {canEdit ? (
                <Textarea
                  placeholder="Relevant history for this assessment..."
                  value={form.history}
                  onChange={(e) => setForm(prev => ({ ...prev, history: e.target.value }))}
                  rows={3}
                />
              ) : (
                <div className="rounded-md border p-3 bg-muted/20 text-sm whitespace-pre-wrap min-h-[48px]">
                  {form.history || <span className="text-muted-foreground italic">No history recorded.</span>}
                </div>
              )}
            </div>

            {/* Findings */}
            <div className="space-y-2">
              <Label>Assessment Findings</Label>
              {canEdit ? (
                <Textarea
                  placeholder="Describe the assessment findings in detail..."
                  value={form.findings}
                  onChange={(e) => setForm(prev => ({ ...prev, findings: e.target.value }))}
                  rows={4}
                />
              ) : (
                <div className="rounded-md border p-3 bg-muted/20 text-sm whitespace-pre-wrap min-h-[60px]">
                  {form.findings || <span className="text-muted-foreground italic">No findings recorded.</span>}
                </div>
              )}
            </div>

            {/* Observations grid */}
            <div className="space-y-2">
              <Label>Observations</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(Object.keys(OBSERVATION_LABELS) as (keyof ObservationData)[]).map(key => (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-xs">{OBSERVATION_LABELS[key]}</Label>
                    {canEdit ? (
                      <Select
                        value={form.observations[key] || ''}
                        onValueChange={(v) => setForm(prev => ({
                          ...prev,
                          observations: { ...prev.observations, [key]: v },
                        }))}
                      >
                        <SelectTrigger className="w-full h-9">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {OBSERVATION_OPTIONS[key].map(opt => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="rounded-md border px-3 py-2 bg-muted/20 text-sm min-h-[36px]">
                        {form.observations[key] || <span className="text-muted-foreground italic">—</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Therapist Notes */}
            <div className="space-y-2">
              <Label>Therapist Notes</Label>
              {canEdit ? (
                <Textarea
                  placeholder="Add any additional notes about the patient or session..."
                  value={form.therapistNotes}
                  onChange={(e) => setForm(prev => ({ ...prev, therapistNotes: e.target.value }))}
                  rows={4}
                />
              ) : (
                <div className="rounded-md border p-3 bg-muted/20 text-sm whitespace-pre-wrap min-h-[60px]">
                  {form.therapistNotes || <span className="text-muted-foreground italic">No notes recorded.</span>}
                </div>
              )}
            </div>

            {/* Treatment Plan */}
            <div className="space-y-2">
              <Label>Treatment Plan</Label>
              {canEdit ? (
                <Textarea
                  placeholder="Outline the treatment plan..."
                  value={form.treatmentPlan}
                  onChange={(e) => setForm(prev => ({ ...prev, treatmentPlan: e.target.value }))}
                  rows={4}
                />
              ) : (
                <div className="rounded-md border p-3 bg-muted/20 text-sm whitespace-pre-wrap min-h-[60px]">
                  {form.treatmentPlan || <span className="text-muted-foreground italic">No treatment plan recorded.</span>}
                </div>
              )}
            </div>

            {/* Goals */}
            <div className="space-y-2">
              <Label>Goals</Label>
              {canEdit ? (
                <Textarea
                  placeholder="List the goals for this patient..."
                  value={form.goals}
                  onChange={(e) => setForm(prev => ({ ...prev, goals: e.target.value }))}
                  rows={4}
                />
              ) : (
                <div className="rounded-md border p-3 bg-muted/20 text-sm whitespace-pre-wrap min-h-[60px]">
                  {form.goals || <span className="text-muted-foreground italic">No goals recorded.</span>}
                </div>
              )}
            </div>

            {/* Recommendation + Next Assessment Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Recommendation</Label>
                {canEdit ? (
                  <Select
                    value={form.recommendation}
                    onValueChange={(v) => setForm(prev => ({ ...prev, recommendation: v }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select recommendation..." />
                    </SelectTrigger>
                    <SelectContent>
                      {RECOMMENDATION_OPTIONS.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="rounded-md border px-3 py-2 bg-muted/20 text-sm min-h-[36px]">
                    {form.recommendation || <span className="text-muted-foreground italic">—</span>}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Next Assessment Date</Label>
                {canEdit ? (
                  <Input
                    type="date"
                    value={form.nextAssessmentDate}
                    onChange={(e) => setForm(prev => ({ ...prev, nextAssessmentDate: e.target.value }))}
                  />
                ) : (
                  <div className="rounded-md border px-3 py-2 bg-muted/20 text-sm min-h-[36px]">
                    {form.nextAssessmentDate
                      ? format(new Date(form.nextAssessmentDate), 'dd MMM yyyy')
                      : <span className="text-muted-foreground italic">—</span>}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Completion info when completed */}
          {isCompleted && (assessment.completedBy || assessment.completedAt) && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-900/50 p-3 text-xs">
              <div className="flex flex-wrap gap-3">
                {assessment.completedBy && (
                  <span>Completed By: <span className="font-semibold">{assessment.completedBy}</span></span>
                )}
                {assessment.completedAt && (
                  <span>Completed At: <span className="font-semibold">{format(new Date(assessment.completedAt), 'dd MMM yyyy HH:mm')}</span></span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <DialogFooter className="shrink-0 border-t pt-4 flex-wrap gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" onClick={() => onPrint(assessment)} className="gap-1.5">
            <Printer className="h-4 w-4" /> Print
          </Button>
          {canEdit && (
            <>
              <Button
                variant="outline"
                onClick={onSaveDraft}
                disabled={savingDraft || completingAssessment}
              >
                {savingDraft ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                ) : (
                  'Save Draft'
                )}
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                onClick={onComplete}
                disabled={savingDraft || completingAssessment}
              >
                {completingAssessment ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Completing...</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4" /> Complete Assessment</>
                )}
              </Button>
            </>
          )}
          {showReopenButton && (
            <Button
              variant="outline"
              className="gap-1.5 border-amber-500 text-amber-700 hover:bg-amber-50"
              onClick={onReopen}
              disabled={reopeningAssessment}
            >
              {reopeningAssessment ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Reopening...</>
              ) : (
                <><RotateCcw className="h-4 w-4" /> Reopen Assessment</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
