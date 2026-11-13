import { NextRequest, NextResponse } from 'next/server'
import { platformDb } from '@/lib/platform-db'
import { requirePlatformAdmin } from '@/lib/platform-session'
import { hashPassword } from '@/lib/password'
import { encryptSecret, decryptSecret } from '@/lib/secret-crypto'
import { randomBytes } from 'crypto'

// GET /api/platform/organizations — every org with its subscription, plan
// and headline usage counts. This is the Platform Admin's main screen.
export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin(request)
    const orgs = await platformDb.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: { subscription: { include: { plan: true } } },
    })
    const withUsage = await Promise.all(
      orgs.map(async (org) => {
        const [patients, therapistUsers, staffUsers, branches, orgAdmin] = await Promise.all([
          platformDb.patient.count({ where: { organizationId: org.id, isDeleted: false } }),
          platformDb.user.count({ where: { organizationId: org.id, isActive: true, OR: [{ role: { startsWith: 'therapist' } }, { role: 'psychologist' }] } }),
          platformDb.user.count({ where: { organizationId: org.id, isActive: true, NOT: [{ role: { startsWith: 'therapist' } }, { role: 'psychologist' }, { role: 'parent' }] } }),
          // isActive: true — matches checkBranchLimit's own enforcement query.
          // Counting inactive/soft-deleted branches here would show a
          // misleading "at limit" badge for an org that can actually still
          // add one (see subscription-limits.ts).
          platformDb.branch.count({ where: { organizationId: org.id, isActive: true } }),
          // Same "first active super_admin" resolution as the resetAdminPassword
          // action — the account whose credentials this clinic actually logs in with.
          platformDb.user.findFirst({
            where: { organizationId: org.id, role: 'super_admin', isActive: true },
            orderBy: { createdAt: 'asc' },
            select: { email: true, generatedPasswordEnc: true },
          }),
        ])
        return {
          ...org,
          usage: { patients, therapists: therapistUsers, staff: staffUsers, branches },
          adminEmail: orgAdmin?.email ?? null,
          // Only ever decrypted here, behind requirePlatformAdmin — never sent
          // to tenant-facing endpoints.
          generatedPassword: decryptSecret(orgAdmin?.generatedPasswordEnc),
        }
      })
    )
    return NextResponse.json(withUsage)
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('GET /api/platform/organizations error:', error)
    return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 })
  }
}

// POST /api/platform/organizations — provision a new clinic in one
// transaction: Organization + Subscription (trialing or active) + first
// branch + first Org Admin (tenant role 'super_admin'). Returns the
// generated credentials ONCE — they are not retrievable later.
export async function POST(request: NextRequest) {
  try {
    const admin = await requirePlatformAdmin(request)
    const body = await request.json()
    const { slug, planId, adminName, adminEmail, branchName, trialDays, billingCycle } = body
    // Clinic owners usually treat patients themselves, so the Org Admin is
    // listed as a therapist by default (appointments/sessions/assessments
    // dropdowns). Purely administrative owners can switch it off in
    // Settings -> User Management.
    const adminTakesSessions = body.adminTakesSessions !== false
    const adminTherapyType = typeof body.adminTherapyType === 'string' && body.adminTherapyType.trim()
      ? body.adminTherapyType.trim()
      : null
    // Trimmed: a stray trailing space was stored verbatim and then the
    // delete confirmation (which trims what the admin types) could never match.
    const name = typeof body.name === 'string' ? body.name.trim() : ''

    if (!name || !planId || !adminName || !adminEmail) {
      return NextResponse.json({ error: 'name, planId, adminName and adminEmail are required' }, { status: 400 })
    }

    const plan = await platformDb.plan.findUnique({ where: { id: planId } })
    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

    const emailTaken = await platformDb.user.findUnique({ where: { email: adminEmail } })
    if (emailTaken) return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })

    const orgSlug = (slug || name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const slugTaken = await platformDb.organization.findUnique({ where: { slug: orgSlug } })
    if (slugTaken) return NextResponse.json({ error: `Slug "${orgSlug}" is already in use` }, { status: 409 })

    // 12-char URL-safe temp password; Org Admin should change it on first login.
    const tempPassword = randomBytes(9).toString('base64url')
    const hashed = await hashPassword(tempPassword)

    const trialLen = Number(trialDays ?? 14)
    const now = new Date()
    // No trial -> active immediately, billed on whichever cycle the platform
    // admin picked (defaults to monthly). Mirrors the same cycle math as
    // markPaid/activate in .../organizations/[id]/route.ts.
    const cycle: 'monthly' | 'yearly' = billingCycle === 'yearly' ? 'yearly' : 'monthly'
    const activePeriodEnd = new Date(now)
    activePeriodEnd.setMonth(activePeriodEnd.getMonth() + (cycle === 'yearly' ? 12 : 1))

    const result = await platformDb.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name, slug: orgSlug, status: 'active' },
      })
      const subscription = await tx.subscription.create({
        data: {
          organizationId: org.id,
          planId: plan.id,
          status: trialLen > 0 ? 'trialing' : 'active',
          billingCycle: trialLen > 0 ? null : cycle,
          currentPeriodStart: now,
          currentPeriodEnd: trialLen > 0 ? null : activePeriodEnd,
          trialEndsAt: trialLen > 0 ? new Date(now.getTime() + trialLen * 24 * 60 * 60 * 1000) : null,
        },
      })
      const branch = await tx.branch.create({
        data: {
          name: branchName || `${name} — Main`,
          code: `${orgSlug.slice(0, 12).toUpperCase()}-01`,
          organizationId: org.id,
        },
      })
      const orgAdmin = await tx.user.create({
        data: {
          email: adminEmail,
          password: hashed,
          generatedPasswordEnc: encryptSecret(tempPassword),
          name: adminName,
          role: 'super_admin',
          takesSessions: adminTakesSessions,
          therapyType: adminTakesSessions ? adminTherapyType : null,
          branchId: branch.id,
          organizationId: org.id,
        },
      })
      // Settings row up-front (previously created lazily on first Settings
      // visit) so Login OTP applies from the very FIRST login and the clinic
      // name is pre-filled everywhere.
      await tx.centerSettings.create({
        data: {
          centerName: name,
          email: adminEmail,
          loginOtpEnabled: true,
          organizationId: org.id,
        } as never,
      })
      await tx.actionLog.create({
        data: {
          module: 'platform',
          actionType: 'org_created',
          recordId: org.id,
          notes: `Organization "${name}" created on plan ${plan.name} (${trialLen > 0 ? `${trialLen}-day trial` : 'active'})`,
          performedBy: admin.id,
          performedByName: `Platform Admin: ${admin.name} <${admin.email}>`,
          userRole: 'platform_admin',
          organizationId: org.id,
        },
      })
      return { org, subscription, branch, orgAdmin }
    })

    return NextResponse.json(
      {
        organization: result.org,
        subscription: result.subscription,
        branch: result.branch,
        orgAdmin: { id: result.orgAdmin.id, email: adminEmail, name: adminName },
        // Returned exactly once — share with the clinic over a private channel.
        temporaryPassword: tempPassword,
      },
      { status: 201 }
    )
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('POST /api/platform/organizations error:', error)
    return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 })
  }
}
