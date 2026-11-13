'use client'

/**
 * ActionDialog — reusable confirmation popup for status-changing actions.
 *
 * Every module (Appointments, Sessions, Assessments, Packages, Billing, Payments)
 * uses this component when a user performs Reschedule / Complete / Cancel / No Show
 * (or any other status change). The user MUST enter a "Notes / Reason" before the
 * action can be submitted. The action type, notes, user, and timestamp are saved
 * to the ActionLog table via POST /api/action-log.
 *
 * Usage:
 *   <ActionDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     module="appointments"
 *     recordId={appointment.id}
 *     actionType="cancelled"
 *     actionLabel="Cancel Appointment"
 *     onConfirm={async () => { /* call the module API to change status *\/ }}
 *   />
 */

import React, { useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { authFetch } from '@/lib/api-client'
import { toast } from 'sonner'

export interface ActionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Module name for the action log (e.g. "appointments", "sessions"). */
  module: string
  /** ID of the record being acted upon. */
  recordId: string
  /** Action type (e.g. "reschedule", "completed", "cancelled", "no_show"). */
  actionType: string
  /** Human-readable label shown in the dialog title (e.g. "Cancel Appointment"). */
  actionLabel: string
  /** Optional description shown under the title. */
  description?: string
  /** Variant controls button color. */
  variant?: 'default' | 'destructive' | 'success' | 'warning'
  /**
   * Called after the action log is saved (if the user entered notes).
   * Use this to perform the actual status change via the module's API.
   * If this throws, the action log is still saved but an error toast is shown.
   *
   * The `notes` argument is the trimmed notes string the user entered, so
   * callers that need to forward the reason to the module API (e.g. as a
   * cancellationReason) can do so without re-prompting.
   */
  onConfirm?: (notes: string) => Promise<void>
  /** Extra React content to render inside the dialog (e.g. date/time pickers for reschedule). */
  children?: React.ReactNode
  /** If true, disables the confirm button (e.g. when required fields in children are missing). */
  disableConfirm?: boolean
}

const variantStyles: Record<string, string> = {
  default: 'bg-blue-600 hover:bg-blue-700 text-white',
  destructive: 'bg-red-600 hover:bg-red-700 text-white',
  success: 'bg-green-600 hover:bg-green-700 text-white',
  warning: 'bg-amber-600 hover:bg-amber-700 text-white',
}

const variantBadge: Record<string, string> = {
  default: 'bg-blue-100 text-blue-700',
  destructive: 'bg-red-100 text-red-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
}

export function ActionDialog({
  open,
  onOpenChange,
  module,
  recordId,
  actionType,
  actionLabel,
  description,
  variant = 'default',
  onConfirm,
  children,
  disableConfirm = false,
}: ActionDialogProps) {
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!notes.trim()) {
      toast.error('Please enter a reason / notes before confirming.')
      return
    }

    setSubmitting(true)
    try {
      // 1. Save the action log entry (action type + notes + user + timestamp)
      const logRes = await authFetch('/api/action-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module, recordId, actionType, notes: notes.trim() }),
      })

      if (!logRes.ok) {
        const err = await logRes.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save action log')
      }

      // 2. Perform the actual status change via the module's callback
      if (onConfirm) {
        await onConfirm(notes.trim())
      }

      toast.success(`${actionLabel} — action recorded`)
      setNotes('')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${actionLabel.toLowerCase()}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = (open: boolean) => {
    if (!submitting) {
      setNotes('')
      onOpenChange(open)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {variant === 'destructive' && <AlertTriangle className="h-5 w-5 text-red-600" />}
            {actionLabel}
            <Badge className={variantBadge[variant]}>{actionType.replace('_', ' ')}</Badge>
          </DialogTitle>
          <DialogDescription>
            {description || `Please provide a reason for this action. This will be recorded in the action log with your name and timestamp.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Extra content (e.g. date pickers for reschedule) */}
          {children}

          {/* Mandatory Notes / Reason */}
          <div className="space-y-2">
            <Label>
              Notes / Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              placeholder="Enter the reason for this action (required)…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              autoFocus
              disabled={submitting}
            />
            {notes.trim().length === 0 && (
              <p className="text-[11px] text-red-500">A reason is required to proceed.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !notes.trim() || disableConfirm}
            className={variantStyles[variant]}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {submitting ? 'Processing…' : `Confirm ${actionLabel}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ActionDialog
