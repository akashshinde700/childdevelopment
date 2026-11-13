'use client'

import React, { useState, useMemo } from 'react'
import { Plus, X, Clock, Users, AlertCircle, FileText, Printer, RotateCcw, Eye } from 'lucide-react'
import {
  SESSION_SLOTS,
  SESSION_STATUS_COLORS,
  getCurrentSlotIndex,
  calculateUtilization,
  validateSessionBooking,
  type SessionSlot,
} from '@/lib/session-slots'
import { cn } from '@/lib/utils'
import { printHTMLDocument, escapeHTML as esc } from '@/components/print/DocumentLayout'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { authFetch } from '@/lib/api-client'
import { useAppStore, resolveDisplayDesignation } from '@/store/app-store'

// ── Types ──────────────────────────────────────────────────────────────

interface CalendarSession {
  id: string
  therapistName: string
  patientName: string
  patientId?: string
  startTime: string
  endTime: string
  date: string
  status: string
  therapyType: string
  roomId?: string | null
  appointmentId?: string | null
}

interface Therapist {
  id: string
  name: string
  designation?: string | null
  role?: string
  secondaryRole?: string | null
}

interface Patient {
  id: string
  childName: string
  patientId: string
}

interface Leave {
  employeeName: string
  startDate: string
  endDate: string
  status: string
}

interface CalendarSchedulerProps {
  sessions: CalendarSession[]
  therapists: Therapist[]
  patients: Patient[]
  leaves: Leave[]
  selectedDate: string // YYYY-MM-DD
  onSessionCreated?: () => void
  onSessionUpdated?: (session: CalendarSession) => void
  onSessionDeleted?: (sessionId: string) => void
}

// ── Component ──────────────────────────────────────────────────────────

export function CalendarScheduler({
  sessions,
  therapists,
  patients,
  leaves,
  selectedDate,
  onSessionCreated,
  onSessionUpdated,
  onSessionDeleted,
}: CalendarSchedulerProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<SessionSlot | null>(null)
  const [selectedTherapist, setSelectedTherapist] = useState<string>('')
  const [detailSession, setDetailSession] = useState<CalendarSession | null>(null)

  // Current time for the red line indicator
  const currentTime = useMemo(() => {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  }, [])
  const currentSlotIndex = getCurrentSlotIndex(currentTime)

  // Group sessions by therapist + startTime for quick lookup
  const sessionMap = useMemo(() => {
    const map = new Map<string, CalendarSession>()
    sessions.forEach(s => {
      const key = `${s.therapistName}-${s.startTime}`
      map.set(key, s)
    })
    return map
  }, [sessions])

  // Get sessions for the selected date
  const dateSessions = useMemo(() => {
    return sessions.filter(s => s.date.startsWith(selectedDate))
  }, [sessions, selectedDate])

  const handleAddClick = (slot: SessionSlot, therapistName: string) => {
    if (slot.isLunch) return
    setSelectedSlot(slot)
    setSelectedTherapist(therapistName)
    setAddDialogOpen(true)
  }

  const handleSessionClick = (session: CalendarSession) => {
    setDetailSession(session)
  }

  return (
    <div className="space-y-3">
      {/* ── Legend ── */}
      <div className="flex items-center gap-4 flex-wrap text-xs">
        {Object.entries(SESSION_STATUS_COLORS).map(([key, val]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={cn('w-3 h-3 rounded', val.bg, 'border', val.border)} />
            <span className="text-gray-600">{val.label}</span>
          </div>
        ))}
      </div>

      {/* ── Calendar Grid ── */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <div className="min-w-[800px]">
          {/* Header row: Time | Therapist columns */}
          <div className="flex border-b border-gray-200 bg-gray-50/80 sticky top-0 z-10">
            <div className="w-28 shrink-0 px-3 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wider">
              Time
            </div>
            {therapists.map(t => {
              const util = calculateUtilization(t.name, dateSessions, selectedDate)
              return (
                <div key={t.id} className="flex-1 min-w-[140px] px-3 py-2 border-l border-gray-200">
                  <p className="text-sm font-bold text-gray-800 truncate">{t.name}</p>
                  <p className="text-[10px] text-gray-400 truncate">{resolveDisplayDesignation(t.designation, t.role, t.secondaryRole)}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <div className="h-1 flex-1 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full', util.percent > 80 ? 'bg-red-500' : util.percent > 50 ? 'bg-orange-500' : 'bg-green-500')}
                        style={{ width: `${util.percent}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-500 font-medium">{util.percent}%</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Time slot rows */}
          {SESSION_SLOTS.map((slot, slotIdx) => (
            <div
              key={slot.start}
              className={cn(
                'flex border-b border-gray-100',
                slot.isLunch && 'bg-gray-50/60',
                slotIdx === currentSlotIndex && 'ring-1 ring-inset ring-red-400/40'
              )}
            >
              {/* Time label */}
              <div className="w-28 shrink-0 px-3 py-2 flex flex-col justify-center">
                <span className="text-xs font-semibold text-gray-700">{slot.startLabel}</span>
                <span className="text-[10px] text-gray-400">{slot.endLabel}</span>
                {slotIdx === currentSlotIndex && (
                  <span className="text-[9px] text-red-500 font-bold mt-0.5">► NOW</span>
                )}
              </div>

              {/* Therapist cells */}
              {therapists.map(t => {
                if (slot.isLunch) {
                  return (
                    <div key={t.id} className="flex-1 min-w-[140px] px-2 py-3 border-l border-gray-200 flex items-center justify-center">
                      <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Lunch Break
                      </span>
                    </div>
                  )
                }

                const session = sessionMap.get(`${t.name}-${slot.start}`)
                const onLeave = leaves.some(
                  l => l.employeeName === t.name &&
                       l.status === 'approved' &&
                       selectedDate >= l.startDate.split('T')[0] &&
                       selectedDate <= l.endDate.split('T')[0]
                )

                if (onLeave) {
                  return (
                    <div key={t.id} className="flex-1 min-w-[140px] px-2 py-3 border-l border-gray-200 flex items-center justify-center">
                      <span className="text-[10px] text-gray-400 italic">On Leave</span>
                    </div>
                  )
                }

                if (session) {
                  const colors = SESSION_STATUS_COLORS[session.status] || SESSION_STATUS_COLORS.scheduled
                  return (
                    <div
                      key={t.id}
                      className={cn(
                        'flex-1 min-w-[140px] px-2 py-1.5 border-l border-gray-200 cursor-pointer hover:opacity-80 transition-opacity',
                        colors.bg
                      )}
                      onClick={() => handleSessionClick(session)}
                    >
                      <div className={cn('rounded-lg border px-2 py-1', colors.border)}>
                        <p className={cn('text-xs font-bold truncate', colors.text)}>
                          {session.patientName}
                        </p>
                        <p className="text-[10px] text-gray-500 truncate">{session.therapyType}</p>
                        <p className={cn('text-[9px] font-medium', colors.text)}>
                          {colors.label}
                        </p>
                      </div>
                    </div>
                  )
                }

                // Empty slot — show + Add Session
                return (
                  <div
                    key={t.id}
                    className="flex-1 min-w-[140px] px-2 py-3 border-l border-gray-200 hover:bg-blue-50/50 transition-colors cursor-pointer flex items-center justify-center"
                    onClick={() => handleAddClick(slot, t.name)}
                  >
                    <Plus className="h-4 w-4 text-gray-300 hover:text-blue-500" />
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Stats Summary ── */}
      <div className="flex items-center gap-4 flex-wrap text-xs text-gray-500">
        <span>Total Slots: {SESSION_SLOTS.filter(s => !s.isLunch).length}</span>
        <span>•</span>
        <span>Booked: {dateSessions.filter(s => s.status !== 'cancelled' && s.status !== 'no_show').length}</span>
        <span>•</span>
        <span>Available: {SESSION_SLOTS.filter(s => !s.isLunch).length * therapists.length - dateSessions.filter(s => s.status !== 'cancelled' && s.status !== 'no_show').length}</span>
      </div>

      {/* ── Add Session Dialog ── */}
      <AddSessionDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        slot={selectedSlot}
        therapistName={selectedTherapist}
        patients={patients}
        date={selectedDate}
        existingSessions={dateSessions}
        leaves={leaves}
        onCreated={() => {
          setAddDialogOpen(false)
          onSessionCreated?.()
        }}
      />

      {/* ── Session Detail Dialog ── */}
      <SessionDetailDialog
        session={detailSession}
        open={!!detailSession}
        onOpenChange={(open) => { if (!open) setDetailSession(null) }}
        onUpdated={(updated) => {
          onSessionUpdated?.(updated)
          setDetailSession(null)
        }}
        onDeleted={(sessionId) => {
          onSessionDeleted?.(sessionId)
          setDetailSession(null)
        }}
      />
    </div>
  )
}

// ── Add Session Dialog ─────────────────────────────────────────────────

function AddSessionDialog({
  open,
  onOpenChange,
  slot,
  therapistName,
  patients,
  date,
  existingSessions,
  leaves,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  slot: SessionSlot | null
  therapistName: string
  patients: Patient[]
  date: string
  existingSessions: CalendarSession[]
  leaves: Leave[]
  onCreated: () => void
}) {
  const [patientId, setPatientId] = useState('')
  const [therapyType, setTherapyType] = useState('Speech Therapy')
  const [saving, setSaving] = useState(false)

  const therapyTypes = ['Speech Therapy', 'Occupational Therapy', 'Behavioral Therapy', 'Remedial Therapy', 'Assessment']

  const handleSave = async () => {
    if (!slot || !patientId) {
      toast.error('Please select a patient')
      return
    }

    // Validate
    const error = validateSessionBooking({
      startTime: slot.start,
      therapistName,
      date,
      existingSessions,
      leaves,
    })
    if (error) {
      toast.error(error)
      return
    }

    const patient = patients.find(p => p.id === patientId)
    if (!patient) {
      toast.error('Please select a valid patient')
      return
    }

    setSaving(true)
    try {
      const res = await authFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          therapistName,
          therapyType,
          date: `${date}T${slot.start}:00`,
          startTime: slot.start,
          endTime: slot.end,
          status: 'scheduled',
        }),
      })

      if (res.ok) {
        toast.success('Session scheduled successfully', {
          description: `${patient.childName} → ${therapistName} at ${slot.startLabel}`,
        })
        setPatientId('')
        onCreated()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to create session')
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!slot) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Therapy Session</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Time slot (read-only) */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <p className="text-sm font-bold text-blue-700">
              {slot.startLabel} – {slot.endLabel}
            </p>
            <p className="text-xs text-blue-600">45-minute session</p>
          </div>

          {/* Therapist (read-only) */}
          <div>
            <Label className="text-xs text-gray-500">Therapist</Label>
            <Input value={therapistName} readOnly className="mt-1 bg-gray-50" />
          </div>

          {/* Patient selection */}
          <div>
            <Label className="text-xs text-gray-500">Patient *</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select patient" />
              </SelectTrigger>
              <SelectContent>
                {patients.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.childName} ({p.patientId})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Therapy type */}
          <div>
            <Label className="text-xs text-gray-500">Therapy Type</Label>
            <Select value={therapyType} onValueChange={setTherapyType}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {therapyTypes.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Schedule Session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Session Detail Dialog (Role-Aware) ─────────────────────────────────

function SessionDetailDialog({
  session,
  open,
  onOpenChange,
  onUpdated,
  onDeleted,
}: {
  session: CalendarSession | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: (session: CalendarSession) => void
  onDeleted: (sessionId: string) => void
}) {
  const [updating, setUpdating] = useState(false)
  const [soapNotes, setSoapNotes] = useState('')
  const [rescheduleReason, setRescheduleReason] = useState('')
  const [showReschedule, setShowReschedule] = useState(false)
  // Admin reschedule (for a CANCELLED session) — pick a new date/time to
  // bring it back onto the calendar, rather than the therapist's
  // reason-only "request reschedule" flow above.
  const [showAdminReschedule, setShowAdminReschedule] = useState(false)
  const [adminRescheduleDate, setAdminRescheduleDate] = useState('')
  const [adminRescheduleTime, setAdminRescheduleTime] = useState('10:00')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { user } = useAppStore()

  const userRole = user?.role || ''
  const isTherapist = userRole.startsWith('therapist') || userRole === 'psychologist'
  const isSuperAdmin = userRole === 'super_admin' || userRole === 'admin'

  // Determine if the logged-in therapist is assigned to this session
  const isAssignedTherapist = isTherapist && user?.name === session?.therapistName

  if (!session) return null

  const colors = SESSION_STATUS_COLORS[session.status] || SESSION_STATUS_COLORS.scheduled

  const updateStatus = async (newStatus: string, extraData?: Record<string, unknown>) => {
    setUpdating(true)
    try {
      const res = await authFetch('/api/sessions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: session.id, status: newStatus, ...extraData }),
      })
      if (res.ok) {
        const json = await res.json().catch(() => ({}))
        toast.success(`Session marked as ${newStatus.replace('_', ' ')}`)

        // Sync linked appointment
        if (session.appointmentId) {
          await authFetch('/api/appointments', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: session.appointmentId, status: newStatus === 'in_progress' ? 'confirmed' : newStatus }),
          }).catch(() => { /* best-effort sync */ })
        }

        onUpdated({ ...session, status: newStatus, ...extraData })
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to update session')
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setUpdating(false)
    }
  }

  const handleCompleteSession = () => {
    const now = new Date()
    const endTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    updateStatus('completed', { actualEndTime: endTime, notes: soapNotes })
  }

  const handleNoShow = () => {
    updateStatus('no_show')
  }

  const handleRequestReschedule = () => {
    if (!rescheduleReason.trim()) {
      toast.error('Please enter a reason for rescheduling')
      return
    }
    updateStatus('rescheduled', { rescheduleReason: rescheduleReason.trim() })
    setShowReschedule(false)
    setRescheduleReason('')
  }

  // Admin reschedule of a CANCELLED session — picks a new date/time and
  // brings the session (and its mirrored appointment) back to 'scheduled'.
  const handleAdminReschedule = async () => {
    if (!adminRescheduleDate || !adminRescheduleTime) {
      toast.error('Please pick a new date and time')
      return
    }
    const [h, m] = adminRescheduleTime.split(':').map(Number)
    const endMinutes = h * 60 + m + 45
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`
    await updateStatus('scheduled', {
      date: `${adminRescheduleDate}T${adminRescheduleTime}:00`,
      startTime: adminRescheduleTime,
      endTime,
    })
    setShowAdminReschedule(false)
    setAdminRescheduleDate('')
    setAdminRescheduleTime('10:00')
  }

  const handleDeleteSession = async () => {
    setDeleting(true)
    try {
      const res = await authFetch(`/api/sessions?id=${session.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Cancelled session deleted')
        onDeleted(session.id)
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to delete session')
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  const handlePrint = () => {
    printHTMLDocument(`
      <html><head><title>Session Summary - ${esc(session.patientName)}</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;color:#333}h1{color:#0F7A87}
      table{width:100%;border-collapse:collapse;margin:20px 0}td{padding:8px;border:1px solid #ddd}</style>
      </head><body>
      <h1>Therapy Session Summary</h1>
      <table>
        <tr><td><strong>Patient</strong></td><td>${esc(session.patientName)}</td></tr>
        <tr><td><strong>Therapist</strong></td><td>${esc(session.therapistName)}</td></tr>
        <tr><td><strong>Therapy Type</strong></td><td>${esc(session.therapyType)}</td></tr>
        <tr><td><strong>Date</strong></td><td>${new Date(session.date).toLocaleDateString('en-IN')}</td></tr>
        <tr><td><strong>Time</strong></td><td>${esc(session.startTime)} – ${esc(session.endTime)}</td></tr>
        <tr><td><strong>Status</strong></td><td>${esc(colors.label)}</td></tr>
        ${soapNotes ? `<tr><td><strong>SOAP Notes</strong></td><td>${esc(soapNotes)}</td></tr>` : ''}
      </table>
      <p style="margin-top:40px;color:#999;font-size:12px">Your Clinic Name</p>
      </body></html>
    `)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Session Details
            {isSuperAdmin && <Badge variant="outline" className="text-[10px]">Admin View</Badge>}
            {isAssignedTherapist && <Badge variant="outline" className="text-[10px] text-blue-600">Your Session</Badge>}
          </DialogTitle>
        </DialogHeader>

        {/* Session info card */}
        <div className={cn('rounded-lg border px-4 py-3', colors.bg, colors.border)}>
          <p className={cn('text-sm font-bold', colors.text)}>{session.patientName}</p>
          <p className="text-xs text-gray-600">{session.therapyType}</p>
          <p className="text-xs text-gray-500">{session.startTime} – {session.endTime}</p>
          <p className={cn('text-xs font-medium mt-1', colors.text)}>Status: {colors.label}</p>
        </div>

        {/* Session metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-gray-500">Therapist:</span>
            <p className="font-medium text-gray-800">{session.therapistName}</p>
          </div>
          <div>
            <span className="text-gray-500">Date:</span>
            <p className="font-medium text-gray-800">{new Date(session.date).toLocaleDateString('en-IN')}</p>
          </div>
        </div>

      {/* ── SOAP Notes ── */}
      {session.status === 'completed' ? (
        <div>
          <Label className="text-xs text-gray-500 flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" /> SOAP Notes (Read Only)
          </Label>
          <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 min-h-[60px]">
            {soapNotes || session.therapyType ? (soapNotes || 'No SOAP notes recorded for this session.') : 'No SOAP notes recorded.'}
          </div>
        </div>
      ) : session.status === 'in_progress' && (isAssignedTherapist || isSuperAdmin) ? (
        <div>
          <Label className="text-xs text-gray-500 flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" /> SOAP Notes
          </Label>
          <Textarea
            value={soapNotes}
            onChange={(e) => setSoapNotes(e.target.value)}
            placeholder="Enter Subjective, Objective, Assessment, and Plan notes..."
            className="mt-1 text-xs"
            rows={4}
          />
        </div>
      ) : session.status !== 'completed' && (
        <div>
          <Label className="text-xs text-gray-400 flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" /> SOAP Notes (Disabled — start session to enable)
          </Label>
          <Textarea
            disabled
            placeholder="SOAP notes will be available once the session starts..."
            className="mt-1 text-xs bg-gray-50"
            rows={3}
          />
        </div>
      )}

      {/* ── Reschedule Request Form ── */}
      {showReschedule && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 space-y-2">
          <Label className="text-xs text-purple-700 font-medium">Reason for Reschedule</Label>
          <Textarea
            value={rescheduleReason}
            onChange={(e) => setRescheduleReason(e.target.value)}
            placeholder="Enter the reason for requesting a reschedule..."
            className="text-xs"
            rows={2}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setShowReschedule(false); setRescheduleReason('') }}>
              Cancel
            </Button>
            <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white" onClick={handleRequestReschedule} disabled={updating}>
              Submit Request
            </Button>
          </div>
        </div>
      )}

      {/* ── Admin Reschedule Form (cancelled session → pick new slot) ── */}
      {showAdminReschedule && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 space-y-2">
          <Label className="text-xs text-purple-700 font-medium">New Date &amp; Time</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input
              type="date"
              value={adminRescheduleDate}
              onChange={(e) => setAdminRescheduleDate(e.target.value)}
              className="text-xs"
            />
            <Input
              type="time"
              value={adminRescheduleTime}
              onChange={(e) => setAdminRescheduleTime(e.target.value)}
              className="text-xs"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setShowAdminReschedule(false); setAdminRescheduleDate('') }}>
              Cancel
            </Button>
            <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white" onClick={handleAdminReschedule} disabled={updating}>
              Confirm Reschedule
            </Button>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation (cancelled session) ── */}
      {confirmingDelete && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
          <p className="text-xs font-medium text-red-700">Delete this cancelled session?</p>
          <p className="text-xs text-red-600">This action cannot be undone.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDeleteSession} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      )}

        {/* ── Role-Based Action Buttons ── */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">

          {/* === THERAPIST ACTIONS === */}
          {isAssignedTherapist && (
            <>
              {/* Status: Scheduled → Complete Session, No Show, Request Reschedule */}
              {session.status === 'scheduled' && (
                <>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={handleCompleteSession} disabled={updating}>
                    Complete Session
                  </Button>
                  <Button size="sm" variant="outline" className="text-orange-600 border-orange-300 hover:bg-orange-50" onClick={handleNoShow} disabled={updating}>
                    No Show
                  </Button>
                  <Button size="sm" variant="outline" className="text-purple-600 border-purple-300 hover:bg-purple-50" onClick={() => setShowReschedule(true)} disabled={updating}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Request Reschedule
                  </Button>
                </>
              )}

              {/* Status: In Progress → Complete Session, Cancel, Save SOAP Notes */}
              {session.status === 'in_progress' && (
                <>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={handleCompleteSession} disabled={updating}>
                    Complete Session
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => updateStatus('cancelled')} disabled={updating}>
                    Cancel Session
                  </Button>
                </>
              )}

              {/* Status: Completed → no execution buttons */}
              {session.status === 'completed' && (
                <Badge className="bg-green-100 text-green-700">Session Completed</Badge>
              )}

              {/* Status: Cancelled / No Show → no execution buttons */}
              {(session.status === 'cancelled' || session.status === 'no_show') && (
                <Badge className="bg-red-100 text-red-700">Session {colors.label}</Badge>
              )}

              {/* Status: Rescheduled → pending admin approval */}
              {session.status === 'rescheduled' && (
                <Badge className="bg-purple-100 text-purple-700">Pending Reschedule Approval</Badge>
              )}
            </>
          )}

          {/* === SUPER ADMIN / ADMIN ACTIONS === */}
          {isSuperAdmin && (
            <>
              {/* Admin can always view, override-cancel, reschedule, print */}
              {(session.status === 'scheduled' || session.status === 'in_progress') && (
                <>
                  <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => updateStatus('cancelled')} disabled={updating}>
                    Cancel Session (Admin Override)
                  </Button>
                  <Button size="sm" variant="outline" className="text-purple-600 border-purple-300 hover:bg-purple-50" onClick={() => updateStatus('rescheduled')} disabled={updating}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Reschedule (Admin Override)
                  </Button>
                </>
              )}

              {session.status === 'rescheduled' && (
                <Badge className="bg-purple-100 text-purple-700">Reschedule Request — Select New Slot</Badge>
              )}

              {session.status === 'completed' && (
                <Badge className="bg-green-100 text-green-700">Session Completed</Badge>
              )}

              {session.status === 'no_show' && (
                <Badge className="bg-red-100 text-red-700">Session {colors.label}</Badge>
              )}

              {/* Cancelled — reschedule onto a new slot, or delete permanently */}
              {session.status === 'cancelled' && (
                <>
                  <Badge className="bg-red-100 text-red-700">Session {colors.label}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-purple-600 border-purple-300 hover:bg-purple-50"
                    onClick={() => setShowAdminReschedule(true)}
                    disabled={updating || deleting}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Reschedule
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-300 hover:bg-red-50"
                    onClick={() => setConfirmingDelete(true)}
                    disabled={updating || deleting}
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Delete
                  </Button>
                </>
              )}

              <Button size="sm" variant="ghost" onClick={handlePrint}>
                <Printer className="h-3.5 w-3.5 mr-1" />
                Print
              </Button>
            </>
          )}

          {/* === COMMON ACTIONS === */}
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
