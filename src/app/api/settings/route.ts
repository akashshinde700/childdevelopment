import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { hashPassword } from '@/lib/password'
import { passwordWriteFields } from '@/lib/user-password'
import { requireFeature } from '@/lib/subscription-limits'

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let settings = await db.centerSettings.findFirst({ where: { organizationId } })
    if (!settings) {
      settings = await db.centerSettings.create({
        data: { centerName: 'Your Clinic Name', organizationId },
      })
    }

    // Also get the current user's login credentials
    const dbUser = await db.user.findFirst({
      where: { id: user.id, organizationId },
      select: { id: true, email: true, password: true, name: true, role: true },
    })

    // Mask the center password in response for security
    const { password: _centerPwd, ...safeSettings } = settings

    return NextResponse.json({
      ...safeSettings,
      hasCenterPassword: !!settings.password,
      loginEmail: dbUser?.email || user.email,
      loginPassword: dbUser?.password ? '••••••••' : '', // Mask login password
      loginName: dbUser?.name || user.name,
      hasPassword: !!dbUser?.password,
    })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/settings error:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()

    // Extract center settings fields
    const centerName = typeof body.centerName === 'string' ? body.centerName.trim() : undefined
    const address = typeof body.address === 'string' ? body.address.trim() : undefined
    const phone = typeof body.phone === 'string' ? body.phone.trim() : undefined
    const email = typeof body.email === 'string' ? body.email.trim() : undefined
    const gstNumber = typeof body.gstNumber === 'string' ? body.gstNumber.trim() : undefined
    const password = typeof body.password === 'string' ? body.password.trim() : undefined
    const logo = typeof body.logo === 'string' ? body.logo : undefined
    const allowHistoricalEntry = typeof body.allowHistoricalEntry === 'boolean' ? body.allowHistoricalEntry : undefined
    const loginOtpEnabled = typeof body.loginOtpEnabled === 'boolean' ? body.loginOtpEnabled : undefined

    // ── Payroll Engine settings ──
    const VALID_SALARY_MODES = ['MONTHLY', 'PER_SESSION', 'HYBRID']
    const payrollSalaryMode = typeof body.payrollSalaryMode === 'string' && VALID_SALARY_MODES.includes(body.payrollSalaryMode)
      ? body.payrollSalaryMode
      : undefined
    const payrollLockAfterGenerate = typeof body.payrollLockAfterGenerate === 'boolean' ? body.payrollLockAfterGenerate : undefined

    // PER_SESSION/HYBRID are plan-gated — MONTHLY (the pre-existing behavior)
    // is always allowed. Reusing the same requireFeature() convention as
    // every other SaaS-tier-gated feature in the app.
    if (payrollSalaryMode === 'PER_SESSION' || payrollSalaryMode === 'HYBRID') {
      const feature = payrollSalaryMode === 'PER_SESSION' ? 'payrollPerSession' : 'payrollHybrid'
      const gate = await requireFeature(organizationId ?? null, feature)
      if (gate) return gate
    }

    // Print branding (SaaS white-label): images arrive as base64 data URLs,
    // bank details as plain strings. Empty string clears the field.
    const PRINT_BRANDING_FIELDS = [
      'printHeader', 'printFooter', 'letterhead', 'signature', 'paymentQr',
      'bankName', 'bankBranch', 'bankAccountName', 'bankAccountNumber', 'bankIfsc', 'upiId',
    ] as const
    const brandingUpdates: Record<string, string | null> = {}
    for (const field of PRINT_BRANDING_FIELDS) {
      if (typeof body[field] === 'string') brandingUpdates[field] = body[field] || null
    }

    // Extract login credential fields
    const loginName = typeof body.loginName === 'string' ? body.loginName.trim() : undefined
    const loginEmail = typeof body.loginEmail === 'string' ? body.loginEmail.trim() : undefined
    const loginPassword = typeof body.loginPassword === 'string' ? body.loginPassword.trim() : undefined

    if (centerName !== undefined && !centerName) {
      return NextResponse.json({ error: 'Center name is required' }, { status: 400 })
    }

    // Validate login name if provided
    if (loginName !== undefined && !loginName) {
      return NextResponse.json({ error: 'Account name is required' }, { status: 400 })
    }

    // Validate login email if provided
    if (loginEmail !== undefined && !loginEmail) {
      return NextResponse.json({ error: 'Login email cannot be empty' }, { status: 400 })
    }

    // Check for duplicate email if changing
    if (loginEmail && loginEmail !== user.email) {
      const existingUser = await db.user.findFirst({
        where: { email: loginEmail, NOT: { id: user.id } },
      })
      if (existingUser) {
        return NextResponse.json({ error: 'This email is already used by another account' }, { status: 400 })
      }
    }

    // Build center settings update data - only include fields that were sent
    const updateData: Record<string, unknown> = {}
    if (centerName !== undefined) updateData.centerName = centerName
    if (address !== undefined) updateData.address = address || null
    if (phone !== undefined) updateData.phone = phone || null
    if (email !== undefined) updateData.email = email || null
    if (gstNumber !== undefined) updateData.gstNumber = gstNumber || null
    if (password !== undefined) updateData.password = password ? await hashPassword(password) : null
    if (logo !== undefined) updateData.logo = logo || null
    if (allowHistoricalEntry !== undefined) updateData.allowHistoricalEntry = allowHistoricalEntry
    if (loginOtpEnabled !== undefined) updateData.loginOtpEnabled = loginOtpEnabled
    if (payrollSalaryMode !== undefined) updateData.payrollSalaryMode = payrollSalaryMode
    if (payrollLockAfterGenerate !== undefined) updateData.payrollLockAfterGenerate = payrollLockAfterGenerate
    Object.assign(updateData, brandingUpdates)

    let settings = await db.centerSettings.findFirst({ where: { organizationId } })
    if (!settings) {
      // Create new settings record if none exists
      settings = await db.centerSettings.create({
        data: {
          centerName: (centerName as string) || 'Your Clinic Name',
          address: (address as string) || null,
          phone: (phone as string) || null,
          email: (email as string) || null,
          gstNumber: (gstNumber as string) || null,
          password: password ? await hashPassword(password as string) : null,
          logo: (logo as string) || null,
          organizationId,
        },
      })
    } else if (Object.keys(updateData).length > 0) {
      // Only update if there are fields to update
      settings = await db.centerSettings.update({
        where: { id: settings.id },
        data: updateData,
      })
    }

    // Get current user data to compare before updating
    const currentUser = await db.user.findFirst({
      where: { id: user.id, organizationId },
      select: { id: true, email: true, password: true, name: true, role: true },
    })

    // Track whether credentials actually changed
    let emailChanged = false
    let passwordChanged = false
    let nameChanged = false

    // Update user login credentials if provided and different
    const userUpdateData: Record<string, string> = {}
    if (loginName && loginName !== currentUser?.name) {
      userUpdateData.name = loginName
      nameChanged = true
    }
    if (loginEmail && loginEmail !== currentUser?.email) {
      userUpdateData.email = loginEmail
      emailChanged = true
    }
    if (loginPassword) {
      // Frontend only sends loginPassword when the user actually typed a new
      // one (never the masked placeholder), so no need to diff against the
      // stored hash here.
      Object.assign(userUpdateData, await passwordWriteFields(loginPassword))
      passwordChanged = true
    }

    if (Object.keys(userUpdateData).length > 0) {
      await db.user.update({
        where: { id: user.id },
        data: userUpdateData,
      })
    }

    // Get updated user data
    const dbUser = await db.user.findFirst({
      where: { id: user.id, organizationId },
      select: { id: true, email: true, password: true, name: true, role: true },
    })

    // Mask the center password in response for security
    const { password: _centerPwd, ...safeSettings } = settings

    return NextResponse.json({
      ...safeSettings,
      hasCenterPassword: !!settings.password,
      loginEmail: dbUser?.email || user.email,
      loginPassword: dbUser?.password ? '••••••••' : '', // Mask login password
      loginName: dbUser?.name || user.name,
      hasPassword: !!dbUser?.password,
      credentialsUpdated: emailChanged || passwordChanged,
      nameChanged,
    })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('PUT /api/settings error:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
