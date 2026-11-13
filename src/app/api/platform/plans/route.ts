import { NextRequest, NextResponse } from 'next/server'
import { platformDb } from '@/lib/platform-db'
import { requirePlatformAdmin } from '@/lib/platform-session'
import { invalidateSubscriptionCache } from '@/lib/subscription-limits'

// Default plan catalogue (from the SaaS transformation plan §2). Created
// lazily on first GET so the portal works immediately after bootstrap
// without a separate seed step. Prices in INR.
const DEFAULT_PLANS = [
  {
    name: 'Basic', tier: 'basic', therapistLimit: 5, branchLimit: 1, userLimit: 3,
    storageLimitMB: 5 * 1024,
    priceMonthly: 2999, priceYearly: 29990,
    features: { customBranding: false, whiteLabel: false, advancedReports: false, exportData: true, apiAccess: false },
  },
  {
    name: 'Advance', tier: 'advance', therapistLimit: 10, branchLimit: 3, userLimit: 6,
    storageLimitMB: 25 * 1024,
    priceMonthly: 6999, priceYearly: 69990,
    features: { customBranding: true, whiteLabel: false, advancedReports: true, exportData: true, apiAccess: false },
  },
  {
    name: 'Premium', tier: 'premium', therapistLimit: 20, branchLimit: 99, userLimit: 99,
    storageLimitMB: 100 * 1024,
    priceMonthly: 14999, priceYearly: 149990,
    features: { customBranding: true, whiteLabel: true, advancedReports: true, exportData: true, apiAccess: true },
  },
]

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin(request)
    let plans = await platformDb.plan.findMany({ orderBy: { priceMonthly: 'asc' } })
    if (plans.length === 0) {
      await platformDb.plan.createMany({ data: DEFAULT_PLANS })
      plans = await platformDb.plan.findMany({ orderBy: { priceMonthly: 'asc' } })
    }
    return NextResponse.json(plans)
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('GET /api/platform/plans error:', error)
    return NextResponse.json({ error: 'Failed to fetch plans' }, { status: 500 })
  }
}

// POST — create a new plan (e.g. a custom/enterprise tier). Feature flags
// default to all-off so a newly created plan doesn't accidentally grant
// premium features until the admin explicitly toggles them on.
export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdmin(request)
    const body = await request.json()
    const { name, tier, therapistLimit, branchLimit, userLimit, storageLimitMB, priceMonthly, priceYearly, features } = body
    if (!name || !tier) {
      return NextResponse.json({ error: 'Plan name and tier are required' }, { status: 400 })
    }

    const plan = await platformDb.plan.create({
      data: {
        name,
        tier,
        therapistLimit: Number(therapistLimit) || 0,
        branchLimit: Number(branchLimit) || 0,
        userLimit: Number(userLimit) || 0,
        storageLimitMB: Number(storageLimitMB) || 0,
        priceMonthly: Number(priceMonthly) || 0,
        priceYearly: Number(priceYearly) || 0,
        features: features && typeof features === 'object'
          ? features
          : { customBranding: false, whiteLabel: false, advancedReports: false, exportData: true, apiAccess: false },
      },
    })
    return NextResponse.json(plan, { status: 201 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('POST /api/platform/plans error:', error)
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 })
  }
}

// PUT — edit a plan's limits/pricing/features. Changes apply to every org on
// that plan within 60s (subscription cache TTL); cache is cleared for
// immediate effect.
export async function PUT(request: NextRequest) {
  try {
    await requirePlatformAdmin(request)
    const body = await request.json()
    const { id, ...data } = body
    if (!id) return NextResponse.json({ error: 'Plan id required' }, { status: 400 })

    const allowed = ['name', 'tier', 'therapistLimit', 'branchLimit', 'userLimit', 'storageLimitMB', 'priceMonthly', 'priceYearly', 'features', 'isActive'] as const
    const update: any = {}
    for (const k of allowed) if (data[k] !== undefined) update[k] = data[k]

    const plan = await platformDb.plan.update({ where: { id }, data: update as any })
    invalidateSubscriptionCache()
    return NextResponse.json(plan)
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('PUT /api/platform/plans error:', error)
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 })
  }
}
