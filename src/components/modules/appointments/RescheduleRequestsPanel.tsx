'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { CalendarClock, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { authFetch } from '@/lib/api-client'
import { toast } from 'sonner'

export interface PendingRescheduleRequest {
  id: string
  reason: string
  preferredDate: string | null
  preferredTime: string | null
  createdAt: string
  appointment: {
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
    patient: { id: string; patientId: string; childName: string }
  }
}

// Parents' pending reschedule requests. "Approve" hands the request to the
// page's normal reschedule dialog (prefilled with the parent's preferred
// slot) — rescheduling the appointment is what approves it server-side.
export function RescheduleRequestsPanel({
  refreshKey,
  onApprove,
}: {
  refreshKey: number
  onApprove: (request: PendingRescheduleRequest) => void
}) {
  const [requests, setRequests] = useState<PendingRescheduleRequest[]>([])
  const [declineTarget, setDeclineTarget] = useState<PendingRescheduleRequest | null>(null)
  const [declineNote, setDeclineNote] = useState('')
  const [declining, setDeclining] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/reschedule-requests')
      if (res.ok) setRequests(((await res.json()) as { requests: PendingRescheduleRequest[] }).requests)
    } catch { /* panel simply stays hidden */ }
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const decline = async () => {
    if (!declineTarget || !declineNote.trim()) return
    setDeclining(true)
    try {
      const res = await authFetch(`/api/reschedule-requests/${declineTarget.id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: declineNote.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Failed to decline request')
        return
      }
      toast.success('Request declined — the parent has been notified')
      setRequests((prev) => prev.filter((r) => r.id !== declineTarget.id))
      setDeclineTarget(null)
      setDeclineNote('')
    } catch {
      toast.error('Failed to decline request')
    } finally {
      setDeclining(false)
    }
  }

  if (requests.length === 0) return null

  return (
    <>
      <Card className="border-amber-200 bg-amber-50/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
            <CalendarClock className="h-4 w-4" />
            Reschedule Requests from Parents ({requests.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border bg-white p-3">
              <div className="flex-1 min-w-0 text-sm">
                <p className="font-medium">
                  {r.appointment.patient.childName}{' '}
                  <span className="text-xs text-muted-foreground font-normal">({r.appointment.patient.patientId})</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Current: {format(new Date(r.appointment.date), 'dd MMM yyyy')}, {r.appointment.startTime} - {r.appointment.endTime}
                  {r.appointment.therapistId ? ` · ${r.appointment.therapistId}` : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  Preferred: {r.preferredDate ? format(new Date(r.preferredDate), 'dd MMM yyyy') : 'any date'}
                  {r.preferredTime ? `, ${r.preferredTime}` : ''}
                </p>
                <p className="text-xs mt-1 break-words">Reason: {r.reason}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" onClick={() => onApprove(r)}>Reschedule</Button>
                <Button size="sm" variant="outline" className="text-red-600 border-red-200" onClick={() => setDeclineTarget(r)}>
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!declineTarget} onOpenChange={(open) => { if (!open && !declining) { setDeclineTarget(null); setDeclineNote('') } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Decline reschedule request</DialogTitle>
            <DialogDescription>The parent will see this reason. The appointment stays as it is.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="e.g. No slot available that week — please attend the current appointment"
            value={declineNote}
            maxLength={500}
            onChange={(e) => setDeclineNote(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeclineTarget(null); setDeclineNote('') }} disabled={declining}>Cancel</Button>
            <Button variant="destructive" onClick={decline} disabled={declining || !declineNote.trim()}>
              {declining && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
