'use client'

import React, { useEffect, useState } from 'react'
import { Star, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { authFetch } from '@/lib/api-client'
import { toast } from 'sonner'

export interface ReviewableAppointment {
  id: string
  title: string
  date: string
  parentRating?: number | null
  parentReview?: string | null
}

export interface SavedReview {
  id: string
  parentRating: number
  parentReview: string | null
  parentReviewedAt: string
}

const MAX_REVIEW_LENGTH = 1000

// Read-only star row, also used by staff screens to show the parent's rating.
export function StarRating({ value, className = 'h-4 w-4' }: { value: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${className} ${n <= value ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />
      ))}
    </span>
  )
}

// Parent rates a completed session (1–5 stars + optional comment).
export function SessionReviewDialog({
  appointment,
  onClose,
  onSaved,
}: {
  appointment: ReviewableAppointment | null
  onClose: () => void
  onSaved: (review: SavedReview) => void
}) {
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [review, setReview] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setRating(appointment?.parentRating ?? 0)
    setReview(appointment?.parentReview ?? '')
    setHover(0)
  }, [appointment])

  const submit = async () => {
    if (!appointment || rating < 1) return
    setSaving(true)
    try {
      const res = await authFetch(`/api/appointments/${appointment.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, review }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Failed to save your review')
        return
      }
      toast.success('Thank you for your feedback!')
      onSaved(json as SavedReview)
    } catch {
      toast.error('Failed to save your review')
    } finally {
      setSaving(false)
    }
  }

  const shown = hover || rating
  return (
    <Dialog open={!!appointment} onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rate this session</DialogTitle>
          <DialogDescription>
            {appointment ? `${appointment.title} — how was your child's session?` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center justify-center gap-1" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                className="p-1 transition-transform hover:scale-110"
                aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
              >
                <Star className={`h-8 w-8 ${n <= shown ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />
              </button>
            ))}
          </div>
          <Textarea
            placeholder="Share your feedback about the session (optional)"
            value={review}
            maxLength={MAX_REVIEW_LENGTH}
            onChange={(e) => setReview(e.target.value)}
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || rating < 1}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
