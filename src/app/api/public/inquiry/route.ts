import { NextRequest, NextResponse } from 'next/server'
import { dbUnscoped } from '@/lib/db'

// POST /api/public/inquiry — UNAUTHENTICATED endpoint behind the landing
// page form. Prospective clinics submit their details; entries land in the
// Platform Admin's Inquiries tab. Basic in-memory IP rate limiting (5/hour)
// keeps bots from flooding it.

const submissions = new Map<string, number[]>()
const WINDOW_MS = 60 * 60 * 1000
const MAX_PER_WINDOW = 5

// PlatformInquiry is platform-layer (no organizationId) — dbUnscoped is the
// correct client; the tenant guard doesn't know this model.
const inquiryDb = dbUnscoped as unknown as {
  platformInquiry: { create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }> }
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const now = Date.now()
    const recent = (submissions.get(ip) || []).filter((t) => now - t < WINDOW_MS)
    if (recent.length >= MAX_PER_WINDOW) {
      return NextResponse.json({ error: 'Too many submissions — please try again later.' }, { status: 429 })
    }

    const body = await request.json()
    const clinicName = String(body.clinicName || '').trim().slice(0, 200)
    const contactName = String(body.contactName || '').trim().slice(0, 120)
    const email = String(body.email || '').trim().slice(0, 200)
    const phone = String(body.phone || '').trim().slice(0, 20)
    const city = String(body.city || '').trim().slice(0, 100)
    const message = String(body.message || '').trim().slice(0, 2000)

    if (!clinicName || !contactName || !email) {
      return NextResponse.json({ error: 'Clinic name, your name and email are required' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
    }

    await inquiryDb.platformInquiry.create({
      data: { clinicName, contactName, email, phone: phone || null, city: city || null, message: message || null },
    })

    recent.push(now)
    submissions.set(ip, recent)

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    console.error('POST /api/public/inquiry error:', error)
    return NextResponse.json({ error: 'Failed to submit — please try again' }, { status: 500 })
  }
}
