import { NextRequest, NextResponse } from 'next/server'
import { platformDb } from '@/lib/platform-db'
import { requirePlatformAdmin } from '@/lib/platform-session'

// DELETE /api/platform/plans/[id] — refuses if any clinic is still
// subscribed to this plan (deleting it out from under them would leave
// their subscription pointing at nothing). Reassign those clinics to a
// different plan first, then delete.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin(request)
    const { id } = await params

    const plan = await platformDb.plan.findUnique({ where: { id } })
    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

    const inUse = await platformDb.subscription.count({ where: { planId: id } })
    if (inUse > 0) {
      return NextResponse.json(
        { error: `${inUse} clinic${inUse === 1 ? ' is' : 's are'} still on this plan — change their plan first.` },
        { status: 409 }
      )
    }

    await platformDb.plan.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('DELETE /api/platform/plans/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 })
  }
}
