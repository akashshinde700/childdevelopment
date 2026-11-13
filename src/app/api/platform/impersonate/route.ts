import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { platformDb } from '@/lib/platform-db'
import { requirePlatformAdmin } from '@/lib/platform-session'
import { createSession, SESSION_COOKIE_NAME } from '@/lib/session'

// POST /api/platform/impersonate — support access ("login as").
// Mints a SHORT-LIVED tenant session for the target org's Org Admin so the
// Platform Admin can see exactly what the clinic sees, without ever knowing
// their password. Every use is written to ActionLog — this touches real
// children's health data and must never be silent.
export async function POST(request: NextRequest) {
  try {
    const admin = await requirePlatformAdmin(request)
    const { organizationId } = await request.json()
    if (!organizationId) return NextResponse.json({ error: 'organizationId required' }, { status: 400 })

    const org = await platformDb.organization.findUnique({ where: { id: organizationId } })
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

    const orgAdmin = await platformDb.user.findFirst({
      where: { organizationId, role: 'super_admin', isActive: true },
      orderBy: { createdAt: 'asc' },
      include: { branch: { select: { id: true, name: true, code: true } } },
    })
    if (!orgAdmin) return NextResponse.json({ error: 'No active Org Admin in this organization' }, { status: 404 })

    await platformDb.actionLog.create({
      data: {
        module: 'platform',
        actionType: 'platform_impersonate',
        recordId: organizationId,
        notes: `Platform Admin impersonated Org Admin ${orgAdmin.email} of "${org.name}" (support access)`,
        performedBy: admin.id,
        performedByName: `Platform Admin: ${admin.name} <${admin.email}>`,
        userRole: 'platform_admin',
        organizationId,
      },
    })

    const { password: _pw, branch, ...safeUser } = orgAdmin
    const token = randomUUID()
    // Same session-user shape as the normal login route builds, so the
    // impersonated session behaves identically to a real Org Admin login.
    const sessionUser = {
      ...safeUser,
      role: 'super_admin',
      branchId: branch?.id || null,
      branchName: branch?.name || null,
      branchCode: branch?.code || null,
    } as Parameters<typeof createSession>[1]
    createSession(token, sessionUser)

    const res = NextResponse.json({
      token,
      user: { ...sessionUser, organization: org.name },
    })
    // Non-httpOnly not needed: the portal opens the app in a new tab and the
    // cookie carries the session. 1h maxAge — support access, not a login.
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60,
    })
    return res
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('POST /api/platform/impersonate error:', error)
    return NextResponse.json({ error: 'Impersonation failed' }, { status: 500 })
  }
}
