import { NextResponse } from 'next/server'
import { dbUnscoped } from '@/lib/db'

// GET /api/public/plans — UNAUTHENTICATED. The landing page's pricing cards
// read the live Plan table so Platform Admin price/limit edits show up
// immediately. Pricing is public information by definition; nothing
// org-specific is exposed.
export async function GET() {
  try {
    const db = dbUnscoped as unknown as {
      plan: { findMany: (args: object) => Promise<Array<Record<string, unknown>>> }
    }
    const plans = await db.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: 'asc' },
      select: {
        id: true, name: true, tier: true,
        therapistLimit: true, branchLimit: true, userLimit: true,
        storageLimitMB: true,
        priceMonthly: true, priceYearly: true, features: true,
      },
    })
    return NextResponse.json(plans)
  } catch (error) {
    console.error('GET /api/public/plans error:', error)
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }
}
