import { NextRequest, NextResponse } from 'next/server'
import { getPlatformAdmin } from '@/lib/platform-session'

// GET /api/platform/auth/me — restores the portal session after a page
// refresh. The httpOnly session cookie is valid for 8h; without this
// endpoint the page had no way to ask "am I already logged in?" and showed
// the login form on every refresh.
export async function GET(request: NextRequest) {
  const admin = await getPlatformAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ admin })
}
