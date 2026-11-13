'use client'

import React, { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { authFetch } from '@/lib/api-client'
import { toast } from 'sonner'

export interface RescheduleRequestInfo {
  id: string
  status: 'pending' | 'approved' | 'declined' | 'cancelled' | string
  reason: string
  preferredDate?: string | null
  preferredTime?: string | null
  responseNote?: string | null
  createdAt: string
}

export interface ReschedulableAppointment {
  id: string
  title: string
  date: string
  startTime: string
  endTime: string
}

const MAX_REASON_LENGTH = 500

// Parent asks the clinic to move an upcoming appointment. Staff decide the
// new slot; this only sends the request.
export function RescheduleRequestDialog({
  appointment,
  onClose,
  onSubmitted,
}: {
  appointment: ReschedulableAppointment | null
  onClose: () => void
  onSubmitted: (appointmentId: string, request: RescheduleRequestInfo) => void
}) {
  const [reason, setReason] = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const [preferredTime, setPreferredTime] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setReason('')
    setPreferredDate('')
    setPreferredTime('')
  }, [appointment])

  const submit = async () => {
    if (!appointment || !reason.trim()) return
    setSaving(true)
    try {
      const res = await authFetch(`/api/appointments/${appointment.id}/reschedule-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim(), preferredDate, preferredTime }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Failed to send reschedule request')
        return
      }
      toast.success('Reschedule request sent. The clinic will confirm a new time.')
      onSubmitted(appointment.id, json as RescheduleRequestInfo)
    } catch {
      toast.error('Failed to send reschedule request')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!appointment} onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request Reschedule</DialogTitle>
          <DialogDescription>
            {appointment
              ? `${appointment.title} — ${format(new Date(appointment.date), 'dd MMM yyyy')}, ${appointment.startTime} - ${appointment.endTime}`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="rr-reason">Reason <span className="text-red-500">*</span></Label>
            <Textarea
              id="rr-reason"
              placeholder="e.g. We are travelling that day"
              value={reason}
              maxLength={MAX_REASON_LENGTH}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rr-date">Preferred date</Label>
              <Input
                id="rr-date"
                type="date"
                min={format(new Date(), 'yyyy-MM-dd')}
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rr-time">Preferred time</Label>
              <Input
                id="rr-time"
                type="time"
                value={preferredTime}
                onChange={(e) => setPreferredTime(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Preferred date and time are optional — the clinic will confirm the final slot.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !reason.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Send Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
