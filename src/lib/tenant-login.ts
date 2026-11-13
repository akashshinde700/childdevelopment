import { randomUUID } from 'crypto'
import { db } from './db'
import { createSession } from './session'

// Shared final step of tenant login — used by BOTH:
//  - /api/auth/login       (direct path, when TENANT_LOGIN_OTP=off)
//  - /api/auth/verify-otp  (after the emailed code is confirmed)
// Caller must have ALREADY authenticated the user (password and/or OTP).
// Builds the session exactly the way login always did: employee link
// lookup (userId first, legacy name-match fallback), activity log, session
// file + token.
export async function finalizeTenantLogin(email: string) {
  const user = await db.user.findUnique({
    where: { email },
    include: { branch: { select: { id: true, name: true, code: true } } },
  })
  if (!user || !user.isActive) return null

  await db.activityLog.create({
    data: { userId: user.id, action: 'login', module: 'auth', details: 'User logged in', organizationId: user.organizationId },
  })

  // Employee lookup, in order of reliability:
  // 1. explicit Employee.userId link; 2. legacy name match (exact, then
  // contains). Org-scoped — a global name match could attach another
  // clinic's employeeId to this session.
  let staffRecord = await db.employee.findFirst({
    where: { userId: user.id, organizationId: user.organizationId },
    select: { id: true, name: true },
  })
  if (!staffRecord) {
    staffRecord = await db.employee.findFirst({
      where: { name: { equals: user.name }, organizationId: user.organizationId },
      select: { id: true, name: true },
    })
  }
  if (!staffRecord) {
    staffRecord = await db.employee.findFirst({
      where: { name: { contains: user.name.trim() }, organizationId: user.organizationId },
      select: { id: true, name: true },
    })
  }

  const { password: _pw, branch, ...safeUser } = user
  const token = randomUUID()
  const sessionUser = {
    ...safeUser,
    role: safeUser.role as import('@/store/app-store').UserRole,
    branchId: branch?.id || null,
    branchName: branch?.name || null,
    branchCode: branch?.code || null,
    employeeId: staffRecord?.id,
  }
  createSession(token, sessionUser)

  return { token, userPayload: sessionUser }
}
