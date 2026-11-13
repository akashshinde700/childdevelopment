import { NextRequest, NextResponse } from 'next/server'
import { dbUnscoped } from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/platform-session'

type InquiryDelegate = {
  findMany: (args: object) => Promise<unknown[]>
}

// GET /api/platform/inquiries — all landing-page inquiries, newest first.
export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin(request)
    const db = dbUnscoped as unknown as { platformInquiry: InquiryDelegate }
    const inquiries = await db.platformInquiry.findMany({ orderBy: { createdAt: 'desc' } })
    return NextResponse.json(inquiries)
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('GET /api/platform/inquiries error:', error)
    return NextResponse.json({ error: 'Failed to fetch inquiries' }, { status: 500 })
  }
}
