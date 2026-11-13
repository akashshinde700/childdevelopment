import { NextRequest, NextResponse } from 'next/server'
import { dbUnscoped } from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/platform-session'

type InquiryDelegate = {
  findUnique: (args: object) => Promise<{ id: string } | null>
  update: (args: object) => Promise<unknown>
  delete: (args: object) => Promise<unknown>
}

const VALID_STATUSES = ['new', 'follow_up', 'demo', 'converted', 'closed']

// PATCH /api/platform/inquiries/[id] — update status and/or the followUps
// array ({ id, date, by, note, nextDate? } entries; the client sends the
// full edited array, so adding/editing/deleting entries is one operation).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin(request)
    const { id } = await params
    const body = await request.json()
    const db = dbUnscoped as unknown as { platformInquiry: InquiryDelegate }

    const existing = await db.platformInquiry.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Inquiry not found' }, { status: 404 })

    const data: Record<string, unknown> = {}
    if (typeof body.status === 'string') {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: `Invalid status — one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
      }
      data.status = body.status
    }
    if (Array.isArray(body.followUps)) {
      // sanitize: keep only known fields, cap sizes
      data.followUps = body.followUps.slice(0, 100).map((f: Record<string, unknown>) => ({
        id: String(f.id || '').slice(0, 40),
        date: String(f.date || '').slice(0, 30),
        by: String(f.by || '').slice(0, 120),
        note: String(f.note || '').slice(0, 2000),
        nextDate: f.nextDate ? String(f.nextDate).slice(0, 30) : null,
      }))
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const updated = await db.platformInquiry.update({ where: { id }, data })
    return NextResponse.json(updated)
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('PATCH /api/platform/inquiries/[id] error:', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}

// DELETE — remove spam/junk inquiries.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin(request)
    const { id } = await params
    const db = dbUnscoped as unknown as { platformInquiry: InquiryDelegate }
    const existing = await db.platformInquiry.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Inquiry not found' }, { status: 404 })
    await db.platformInquiry.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('DELETE /api/platform/inquiries/[id] error:', error)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
