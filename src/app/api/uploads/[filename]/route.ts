import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/session'
import { readFile, stat } from 'fs/promises'
import path from 'path'

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
}

// GET/HEAD /api/uploads/[filename] — auth-gated file server for files stored
// under public/uploads/ (patient documents, employee documents, expense
// bills, etc). public/uploads is served statically by Next with no auth
// check; this route is the intended access path for anything sensitive
// (see toFileUrl() in src/hooks/use-file-exists.ts, which rewrites
// /uploads/<file> stored paths to /api/uploads/<file> for exactly this
// reason). Requires a valid session but no specific role — any
// authenticated user (including parents viewing their own child's files)
// can fetch by exact filename.
async function resolveFile(request: NextRequest, filename: string) {
  await requireSessionUser(request)

  const decoded = decodeURIComponent(filename)
  // Filenames are always a flat "<timestamp>-<sanitized-name><ext>" — reject
  // anything with a path separator or traversal sequence.
  if (decoded.includes('/') || decoded.includes('\\') || decoded.includes('..')) {
    return { status: 400 as const }
  }

  const filePath = path.join(process.cwd(), 'public', 'uploads', decoded)
  let stats
  try {
    stats = await stat(filePath)
    if (!stats.isFile()) return { status: 404 as const }
  } catch {
    return { status: 404 as const }
  }

  const ext = path.extname(decoded).toLowerCase()
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream'
  return { status: 200 as const, filePath, contentType, size: stats.size }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params
    const resolved = await resolveFile(request, filename)
    if (resolved.status !== 200) {
      return NextResponse.json({ error: resolved.status === 400 ? 'Invalid filename' : 'File not found' }, { status: resolved.status })
    }
    const buffer = await readFile(resolved.filePath)
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': resolved.contentType,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/uploads/[filename] error:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}

export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params
    const resolved = await resolveFile(request, filename)
    if (resolved.status !== 200) {
      return new NextResponse(null, { status: resolved.status })
    }
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Content-Type': resolved.contentType,
        'Content-Length': String(resolved.size),
      },
    })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return new NextResponse(null, { status: 401 })
    }
    return new NextResponse(null, { status: 500 })
  }
}
