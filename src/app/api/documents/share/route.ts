import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { SHARED_DIR } from '@/lib/shared-documents'

const MAX_BYTES = 15 * 1024 * 1024

// POST /api/documents/share — publish a generated PDF (invoice, receipt,
// report) behind a long random token so staff can send it to a parent as a
// plain WhatsApp link. Staff-only; the resulting link needs no login, which
// is the whole point — the parent is not a user of the app.
export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    if (user.role === 'parent') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF documents can be shared' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Document is too large to share (max 15MB)' }, { status: 400 })
    }

    const rawName = String(form.get('fileName') || 'document.pdf')
    // Only ever used as the download name — strip anything path-like.
    const fileName = path.basename(rawName).replace(/[^\w\s.-]+/g, ' ').trim().slice(0, 100) || 'document.pdf'
    const title = String(form.get('title') || '').trim().slice(0, 200) || null
    const patientIdRaw = String(form.get('patientId') || '').trim()

    // Only accept a patient of this organization — the id is just a label on
    // the share, but it should never point outside the clinic.
    let patientId: string | null = null
    if (patientIdRaw) {
      const patient = await db.patient.findFirst({
        where: { id: patientIdRaw, organizationId: user.organizationId },
        select: { id: true },
      })
      patientId = patient?.id ?? null
    }

    // 32 random bytes — the token is the only thing guarding the file.
    const token = randomBytes(32).toString('base64url')
    const storedName = `${Date.now()}-${randomBytes(8).toString('hex')}.pdf`

    await mkdir(SHARED_DIR, { recursive: true })
    await writeFile(path.join(SHARED_DIR, storedName), Buffer.from(await file.arrayBuffer()))

    await db.sharedDocument.create({
      data: {
        organizationId: user.organizationId,
        token,
        patientId,
        title,
        fileName,
        storedName,
        createdBy: user.id,
        createdByName: user.name,
      },
    })

    const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') || new URL(request.url).origin
    return NextResponse.json({ token, url: `${origin}/api/d/${token}` }, { status: 201 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/documents/share error:', error)
    return NextResponse.json({ error: 'Could not create the share link' }, { status: 500 })
  }
}
