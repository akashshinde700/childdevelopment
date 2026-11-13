import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { SESSION_COOKIE_NAME } from '@/lib/session'
import { verifyPassword, hashPassword } from '@/lib/password'
import { checkLoginLockout, recordFailedLogin, clearLoginAttempts } from '@/lib/rate-limit'
import { finalizeTenantLogin } from '@/lib/tenant-login'
// OTP login disabled — imports kept commented for easy re-enable.
// import { issueOtp } from '@/lib/platform-otp'
// import { sendMail, otpEmailHTML } from '@/lib/mailer'

// POST /api/auth/login — tenant (clinic) login.
// OTP two-step verification is currently DISABLED for every role — email +
// password alone mints the session. The old two-step flow (password here →
// 6-digit emailed code → /api/auth/verify-otp) is left in place but
// commented out below, so it can be turned back on without rewriting it.
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const lockoutKey = String(email).toLowerCase().trim()
    const lockout = checkLoginLockout(lockoutKey)
    if (lockout.locked) {
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${Math.ceil((lockout.retryAfterSeconds || 0) / 60)} minute(s).` },
        { status: 429 }
      )
    }

    const user = await db.user.findUnique({
      where: { email },
      include: {
        branch: {
          select: { id: true, name: true, code: true },
        },
      },
    })

    if (!user) {
      recordFailedLogin(lockoutKey)
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const { valid, needsRehash } = await verifyPassword(password, user.password)
    if (!valid) {
      recordFailedLogin(lockoutKey)
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    clearLoginAttempts(lockoutKey)

    if (!user.isActive) {
      return NextResponse.json({ error: 'Account is deactivated. Contact administrator.' }, { status: 403 })
    }

    // Transparently migrate legacy plaintext passwords to bcrypt on first
    // successful login — no bulk migration script needed.
    await db.user.update({
      where: { id: user.id },
      data: {
        lastLogin: new Date(),
        ...(needsRehash ? { password: await hashPassword(password) } : {}),
      },
    })

    // ── Two-step verification (per-clinic opt-in) — DISABLED ──
    // OTP login is switched off for every role (org admin, therapist, any
    // employee): password alone now completes the login. The block below is
    // kept intact so it can be re-enabled by simply uncommenting it.
    // if (user.role !== 'parent' && user.organizationId) {
    //   const settings = await db.centerSettings.findFirst({
    //     where: { organizationId: user.organizationId },
    //     select: { loginOtpEnabled: true },
    //   })
    //   if (settings?.loginOtpEnabled) {
    //     const code = issueOtp(user.email, 'tenant')
    //     const sent = await sendMail({
    //       to: user.email,
    //       subject: 'Your login verification code',
    //       html: otpEmailHTML(code, 'Use this code to finish signing in to your clinic account.'),
    //     })
    //     if (!sent.ok) {
    //       console.error('Tenant OTP email failed:', sent.error)
    //       return NextResponse.json(
    //         { error: 'Could not send the verification email. Check your account email address or ask your admin to disable Login OTP in Settings.' },
    //         { status: 500 }
    //       )
    //     }
    //     return NextResponse.json({ otpRequired: true, email: user.email })
    //   }
    // }

    // Direct path — always taken now (OTP commented out above).
    const result = await finalizeTenantLogin(user.email)
    if (!result) {
      return NextResponse.json({ error: 'Login failed' }, { status: 500 })
    }

    const res = NextResponse.json({ user: result.userPayload, token: result.token })
    // Also set the token as an httpOnly cookie — needed for plain
    // browser-level requests (e.g. <img src>/<a href> to /api/uploads/...)
    // that can't attach the Authorization header the way authFetch() does.
    res.cookies.set(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })
    return res
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
