import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { SESSION_COOKIE_NAME } from '@/lib/session'
import { verifyOtp } from '@/lib/platform-otp'
import { finalizeTenantLogin } from '@/lib/tenant-login'
import { checkLoginLockout, recordFailedLogin, clearLoginAttempts } from '@/lib/rate-limit'

// NOTE: OTP login is currently DISABLED — /api/auth/login never issues a
// code, so this endpoint is unreachable in practice (no stored OTP can
// verify). Left intact for when the two-step flow is switched back on.
//
// POST /api/auth/verify-otp — tenant login, STEP 2 (only for clinics with
// Login OTP enabled). Confirms the emailed code and mints the session via
// the same finalizeTenantLogin used by the direct path.
export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json()
    if (!email || !code) {
      return NextResponse.json({ error: 'Email and code are required' }, { status: 400 })
    }

    const lockoutKey = `tenant-otp:${String(email).toLowerCase().trim()}`
    const lockout = checkLoginLockout(lockoutKey)
    if (lockout.locked) {
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${Math.ceil((lockout.retryAfterSeconds || 0) / 60)} minute(s).` },
        { status: 429 }
      )
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !user.isActive) {
      recordFailedLogin(lockoutKey)
      return NextResponse.json({ error: 'Invalid request' }, { status: 401 })
    }

    const result = verifyOtp(user.email, String(code), 'tenant')
    if (!result.ok) {
      recordFailedLogin(lockoutKey)
      return NextResponse.json({ error: result.error || 'Invalid code' }, { status: 401 })
    }

    clearLoginAttempts(lockoutKey)

    const login = await finalizeTenantLogin(user.email)
    if (!login) return NextResponse.json({ error: 'Login failed' }, { status: 500 })

    const res = NextResponse.json({ user: login.userPayload, token: login.token })
    res.cookies.set(SESSION_COOKIE_NAME, login.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })
    return res
  } catch (error) {
    console.error('Tenant verify-otp error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
