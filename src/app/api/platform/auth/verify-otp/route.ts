import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { platformAdminDb } from '@/lib/platform-db'
import { createPlatformSession, PLATFORM_SESSION_COOKIE_NAME } from '@/lib/platform-session'
import { verifyOtp } from '@/lib/platform-otp'
import { checkLoginLockout, recordFailedLogin, clearLoginAttempts } from '@/lib/rate-limit'

// NOTE: OTP login is currently DISABLED — /api/platform/auth/login mints the
// session directly, so no code is ever issued and this endpoint is
// unreachable in practice. Left intact for when OTP is switched back on.
//
// POST /api/platform/auth/verify-otp — Platform Admin login, STEP 2 of 2.
// Confirms the emailed code and only then mints the platform session.
export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json()
    if (!email || !code) {
      return NextResponse.json({ error: 'Email and code are required' }, { status: 400 })
    }

    const lockoutKey = `platform-otp:${String(email).toLowerCase().trim()}`
    const lockout = checkLoginLockout(lockoutKey)
    if (lockout.locked) {
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${Math.ceil((lockout.retryAfterSeconds || 0) / 60)} minute(s).` },
        { status: 429 }
      )
    }

    const admin = await platformAdminDb.findUnique({ where: { email } })
    if (!admin || !admin.isActive) {
      recordFailedLogin(lockoutKey)
      return NextResponse.json({ error: 'Invalid request' }, { status: 401 })
    }

    const result = verifyOtp(admin.email, String(code))
    if (!result.ok) {
      recordFailedLogin(lockoutKey)
      return NextResponse.json({ error: result.error || 'Invalid code' }, { status: 401 })
    }

    clearLoginAttempts(lockoutKey)
    await platformAdminDb.update({ where: { id: admin.id }, data: { lastLogin: new Date() } })

    const token = randomUUID()
    const sessionAdmin = { id: admin.id, email: admin.email, name: admin.name }
    createPlatformSession(token, sessionAdmin)

    const res = NextResponse.json({ admin: sessionAdmin, token })
    res.cookies.set(PLATFORM_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 8, // 8h — matches platform session TTL
    })
    return res
  } catch (error) {
    console.error('Platform verify-otp error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
