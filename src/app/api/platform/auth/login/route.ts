import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { platformAdminDb } from '@/lib/platform-db'
import { createPlatformSession, PLATFORM_SESSION_COOKIE_NAME } from '@/lib/platform-session'
import { verifyPassword, hashPassword } from '@/lib/password'
import { checkLoginLockout, recordFailedLogin, clearLoginAttempts } from '@/lib/rate-limit'
// OTP login disabled — imports kept commented for easy re-enable.
// import { issueOtp } from '@/lib/platform-otp'
// import { sendMail, otpEmailHTML } from '@/lib/mailer'

// POST /api/platform/auth/login — Platform Admin login (single step).
// OTP two-step verification is currently DISABLED: email+password alone
// mints the platform session here. The old step-1-of-2 behaviour (email a
// 6-digit code, respond { otpRequired: true }, session only created by
// /api/platform/auth/verify-otp) is commented out below and can be
// restored by swapping the two blocks back.
//
// First run: if NO platform admin exists and PLATFORM_ADMIN_EMAIL /
// PLATFORM_ADMIN_PASSWORD are set in .env, that account is created
// automatically here — no manual bootstrap form needed.
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const lockoutKey = `platform:${String(email).toLowerCase().trim()}`
    const lockout = checkLoginLockout(lockoutKey)
    if (lockout.locked) {
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${Math.ceil((lockout.retryAfterSeconds || 0) / 60)} minute(s).` },
        { status: 429 }
      )
    }

    // Env-managed admin account: PLATFORM_ADMIN_EMAIL/PASSWORD in .env are
    // the source of truth for THAT account — created if missing, password
    // synced if it drifted. This also doubles as the lockout-recovery path:
    // whoever controls .env (already game over if compromised — it holds
    // the DB URL) can always get back in by setting these and restarting.
    const envEmail = process.env.PLATFORM_ADMIN_EMAIL?.toLowerCase().trim()
    const envPassword = process.env.PLATFORM_ADMIN_PASSWORD
    if (envEmail && envPassword && String(email).toLowerCase().trim() === envEmail) {
      const existing = await platformAdminDb.findUnique({ where: { email: envEmail } })
      if (!existing) {
        await platformAdminDb.create({
          data: {
            email: envEmail,
            password: await hashPassword(envPassword),
            name: process.env.PLATFORM_ADMIN_NAME || 'Platform Admin',
          },
        })
      } else {
        const { valid: envValid } = await verifyPassword(envPassword, existing.password)
        if (!envValid) {
          await platformAdminDb.update({
            where: { id: existing.id },
            data: { password: await hashPassword(envPassword), isActive: true },
          })
        } else if (!existing.isActive) {
          await platformAdminDb.update({ where: { id: existing.id }, data: { isActive: true } })
        }
      }
      // Exactly-one-admin enforcement: the env account is THE platform
      // owner; any other row (e.g. from the old bootstrap form) is removed.
      // There is deliberately no other way to create platform admins, so
      // nothing legitimate can be deleted here.
      const removed = await platformAdminDb.deleteMany({ where: { email: { not: envEmail } } })
      if (removed.count > 0) {
        console.info(`Platform admin cleanup: removed ${removed.count} non-env admin account(s)`)
      }
    }

    const admin = await platformAdminDb.findUnique({ where: { email } })
    if (!admin || !admin.isActive) {
      recordFailedLogin(lockoutKey)
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const { valid } = await verifyPassword(password, admin.password)
    if (!valid) {
      recordFailedLogin(lockoutKey)
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    clearLoginAttempts(lockoutKey)

    // ── OTP step DISABLED (kept for easy re-enable) ──
    // Step 2: email the OTP. No session yet.
    // const code = issueOtp(admin.email)
    // const sent = await sendMail({
    //   to: admin.email,
    //   subject: 'Your Platform Admin login code',
    //   html: otpEmailHTML(code, 'Use this code to finish signing in to the Platform Admin panel.'),
    // })
    // if (!sent.ok) {
    //   console.error('OTP email failed:', sent.error)
    //   return NextResponse.json({ error: sent.error || 'Could not send the verification email — check SMTP settings in .env' }, { status: 500 })
    // }
    //
    // return NextResponse.json({ otpRequired: true, email: admin.email })

    // Direct path: password verified → mint the platform session right here
    // (same session/cookie shape /api/platform/auth/verify-otp used).
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
    console.error('Platform login error:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
