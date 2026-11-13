import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { ensureDefaultLeavePolicies } from '@/lib/leave-policy'

async function assertSuperAdmin(request: NextRequest) {
  let user
  try {
    user = await requireSessionUser(request)
  } catch {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (user.role !== 'super_admin') {
    return { error: NextResponse.json({ error: 'Forbidden — Super Admin only' }, { status: 403 }) }
  }
  return { user }
}

/**
 * GET /api/leave-policies
 *   Any authenticated user. Lazy-seeds the 6 default global policies (one per
 *   existing Leave.leaveType value) on first call, then returns all rows.
 *   Optional: ?branchId=<id> to include that branch's overrides alongside globals.
 */
export async function GET(request: NextRequest) {
  let user
  try {
    user = await requireSessionUser(request)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const organizationId = user.organizationId

  try {
    await ensureDefaultLeavePolicies(db, organizationId)

    const { searchParams } = new URL(request.url)
    const branchId = searchParams.get('branchId')

    const policies = await db.leavePolicy.findMany({
      where: branchId
        ? { organizationId, OR: [{ branchId: null }, { branchId }] }
        : { organizationId, branchId: null },
      orderBy: [{ leaveType: 'asc' }, { branchId: 'asc' }],
    })

    return NextResponse.json(policies)
  } catch (error) {
    console.error('GET /api/leave-policies error:', error)
    return NextResponse.json({ error: 'Failed to fetch leave policies' }, { status: 500 })
  }
}

/**
 * PUT /api/leave-policies
 *   Super Admin only. Upserts one policy by [leaveType, branchId].
 *   Body: { leaveType, branchId?, annualLimit?, monthlyLimit?, carryForwardAllowed?,
 *           maxCarryForwardDays?, isPaid?, requiresApproval? }
 */
export async function PUT(request: NextRequest) {
  const guard = await assertSuperAdmin(request)
  if (guard.error) return guard.error
  const organizationId = guard.user.organizationId

  try {
    const body = await request.json()
    const {
      leaveType,
      branchId = null,
      annualLimit = null,
      monthlyLimit = null,
      carryForwardAllowed = false,
      maxCarryForwardDays = null,
      isPaid = true,
      requiresApproval = true,
    } = body || {}

    if (!leaveType) {
      return NextResponse.json({ error: 'leaveType is required' }, { status: 400 })
    }

    const data = {
      annualLimit: annualLimit === null || annualLimit === '' ? null : Number(annualLimit),
      monthlyLimit: monthlyLimit === null || monthlyLimit === '' ? null : Number(monthlyLimit),
      carryForwardAllowed: Boolean(carryForwardAllowed),
      maxCarryForwardDays: maxCarryForwardDays === null || maxCarryForwardDays === '' ? null : Number(maxCarryForwardDays),
      isPaid: Boolean(isPaid),
      requiresApproval: Boolean(requiresApproval),
    }
    const resolvedBranchId = branchId ? String(branchId) : null
    const resolvedLeaveType = String(leaveType)

    // Prisma's compound-unique WhereUniqueInput for [leaveType, branchId]
    // doesn't accept `null` for branchId (see leave-policy.ts), so this can't
    // use `upsert` directly when targeting the global row — find-then-write instead.
    const existing = await db.leavePolicy.findFirst({
      where: { leaveType: resolvedLeaveType, branchId: resolvedBranchId, organizationId },
    })
    const policy = existing
      ? await db.leavePolicy.update({ where: { id: existing.id }, data })
      : await db.leavePolicy.create({ data: { leaveType: resolvedLeaveType, branchId: resolvedBranchId, ...data, organizationId } })

    return NextResponse.json(policy)
  } catch (error) {
    console.error('PUT /api/leave-policies error:', error)
    return NextResponse.json({ error: 'Failed to update leave policy' }, { status: 500 })
  }
}
