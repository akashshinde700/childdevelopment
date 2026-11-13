import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { getOrgSubscription } from '@/lib/subscription-limits'

const THERAPIST_ROLES = ['therapist_speech', 'therapist_ot', 'therapist_behavioral', 'therapist_remedial', 'psychologist']

// GET /api/subscription — Super Admin only. Returns this organization's
// current Plan + Subscription plus live usage counts against the plan's
// limits, so the UI can show "3 of 5 therapists used" etc.
export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    if (user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden — Super Admin only' }, { status: 403 })
    }
    const organizationId = user.organizationId
    if (!organizationId) {
      return NextResponse.json({ error: 'No organization on this account' }, { status: 400 })
    }

    const subscription = await db.subscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    })

    if (!subscription) {
      return NextResponse.json({ error: 'No subscription found for this organization' }, { status: 404 })
    }

    // Effective plan — per-org custom overrides (set via Platform Admin's
    // "Custom limits") take precedence over the raw Plan row, matching what
    // checkBranchLimit/checkTherapistUserLimit/checkStaffUserLimit actually
    // enforce. Reading subscription.plan directly here would show a limit
    // the org isn't really held to.
    const effective = await getOrgSubscription(organizationId)

    const [therapistCount, branchCount, staffCount] = await Promise.all([
      db.user.count({ where: { organizationId, isActive: true, role: { in: THERAPIST_ROLES } } }),
      db.branch.count({ where: { organizationId, isActive: true } }),
      db.user.count({ where: { organizationId, isActive: true, role: { notIn: [...THERAPIST_ROLES, 'parent'] } } }),
    ])

    return NextResponse.json({
      organizationId,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        paymentProvider: subscription.paymentProvider,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        trialEndsAt: subscription.trialEndsAt,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      plan: effective?.plan ?? subscription.plan,
      usage: {
        therapists: therapistCount,
        branches: branchCount,
        staff: staffCount,
      },
    })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/subscription error:', error)
    return NextResponse.json({ error: 'Failed to fetch subscription' }, { status: 500 })
  }
}
