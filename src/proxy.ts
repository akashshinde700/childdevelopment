import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Blocks direct static access to /uploads/* (patient documents, employee
 * documents, expense bills, signatures — all sensitive files live in
 * public/uploads and would otherwise be served by Next's static file
 * handler with NO auth check).
 *
 * The one sanctioned access path is /api/uploads/[filename], which requires
 * a valid session (see src/app/api/uploads/[filename]/route.ts). The
 * frontend already rewrites every stored "/uploads/<file>" path to
 * "/api/uploads/<file>" via toFileUrl() in src/hooks/use-file-exists.ts,
 * so nothing legitimate ever hits the static path.
 *
 * Note: the proxy runs on the Edge runtime and cannot read the file-based
 * session store, so it cannot authenticate — it only blocks. Auth happens
 * in the API route.
 */
export function proxy(_request: NextRequest) {
  // Everything matched below is denied unconditionally.
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export const config = {
  matcher: '/uploads/:path*',
}
