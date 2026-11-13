import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { SHARED_DIR } from '@/lib/shared-documents'

// GET /api/d/[token] — PUBLIC on purpose: this is the link staff send a
// parent over WhatsApp, and a parent has no login. The long random token is
// the only credential, so nothing here reveals anything without it: an
// unknown or revoked token gets the same flat 404 as a missing one.
//
// Served as an attachment so opening the link downloads the document.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const notFound = () => new NextResponse('Not found', { status: 404 })
  try {
    const { token } = await params
    if (!token || token.length < 20) return notFound()

    // dbUnscoped is not needed: this is a findFirst on a non-tenant-guarded
    // lookup key, and the row itself carries the organization.
    const doc = await db.sharedDocument.findUnique({ where: { token } })
    if (!doc || doc.revokedAt) return notFound()

    // storedName is generated server-side, never user input; basename is a
    // belt-and-braces guard against anything path-like reaching readFile.
    const file = await readFile(path.join(SHARED_DIR, path.basename(doc.storedName)))

    await db.sharedDocument.update({
      where: { id: doc.id },
      data: { downloadCount: { increment: 1 }, lastDownloadAt: new Date() },
    }).catch(() => { /* counting must never break the download */ })

    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${doc.fileName.replace(/"/g, '')}"`,
        'Content-Length': String(file.length),
        'Cache-Control': 'private, no-store',
        // Keep it out of search engines even if the link is posted somewhere.
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  } catch (error) {
    console.error('GET /api/d/[token] error:', error)
    return notFound()
  }
}
