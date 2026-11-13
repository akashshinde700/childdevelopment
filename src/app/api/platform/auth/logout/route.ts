import { NextRequest, NextResponse } from 'next/server'
import { deletePlatformSession, PLATFORM_SESSION_COOKIE_NAME } from '@/lib/platform-session'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1] || request.cookies.get(PLATFORM_SESSION_COOKIE_NAME)?.value
  if (token) deletePlatformSession(token)
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(PLATFORM_SESSION_COOKIE_NAME)
  return res
}
