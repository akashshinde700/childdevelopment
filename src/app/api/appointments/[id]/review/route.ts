import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'

const MAX_REVIEW_LENGTH = 1000

// POST /api/appointments/[id]/review — the parent rates a completed session
// of their OWN child (1–5 stars + optional comment). Parent-only on purpose:
// the therapist who ran the session must not be able to rate it. Posting
// again updates the parent's earlier review.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser(request)
    if (user.role !== 'parent' || !user.patientId) {
      return NextResponse.json({ error: 'Only the child\'s parent can review a session' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => ({})) as { rating?: unknown; review?: unknown }
    const rating = Number(body.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be a whole number from 1 to 5' }, { status: 400 })
    }
    const review = typeof body.review === 'string' ? body.review.trim() : ''
    if (review.length > MAX_REVIEW_LENGTH) {
      return NextResponse.json({ error: `Review must be under ${MAX_REVIEW_LENGTH} characters` }, { status: 400 })
    }

    // Scoped to the parent's own child and organization — a 404 (not 403)
    // for anyone else's appointment so ids can't be probed.
    const appointment = await db.appointment.findFirst({
      where: { id, patientId: user.patientId, organizationId: user.organizationId },
      select: { id: true, status: true },
    })
    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }
    if (appointment.status !== 'completed') {
      return NextResponse.json({ error: 'Only a completed session can be reviewed' }, { status: 400 })
    }

    const updated = await db.appointment.update({
      where: { id },
      data: {
        parentRating: rating,
        parentReview: review || null,
        parentReviewedAt: new Date(),
      },
      select: { id: true, parentRating: true, parentReview: true, parentReviewedAt: true },
    })
    return NextResponse.json(updated)
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/appointments/[id]/review error:', error)
    return NextResponse.json({ error: 'Failed to save review' }, { status: 500 })
  }
}
