import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/session'
import { getOrgSubscription, type PlanFeatures } from '@/lib/subscription-limits'

// GET /api/subscription/features — plan feature flags for the logged-in
// user's organization. Available to EVERY authenticated role (unlike
// /api/subscription, which is Super Admin-only) because the app shell needs
// it to decide which nav items to render. Organizations with no
// subscription row are grandfathered with all features enabled.
const ALL_FEATURES: PlanFeatures = {
  customBranding: true,
  whiteLabel: true,
  advancedReports: true,
  exportData: true,
  apiAccess: true,
  payrollPerSession: true,
  payrollHybrid: true,
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const sub = await getOrgSubscription(user.organizationId ?? null)
    const features: PlanFeatures = sub ? { ...(sub.plan.features as PlanFeatures ?? {}) } : ALL_FEATURES
    return NextResponse.json({ features, planName: sub?.plan.name ?? null })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/subscription/features error:', error)
    return NextResponse.json({ error: 'Failed to fetch features' }, { status: 500 })
  }
}
