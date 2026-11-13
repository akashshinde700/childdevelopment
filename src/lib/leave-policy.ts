import type { db } from './db'

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

// Lazy-seeded defaults for the 6 existing Leave.leaveType free-text values.
// These are only used to create the initial LeavePolicy rows the first time
// they're requested — after that, Super Admin edits via PUT /api/leave-policies
// are the source of truth. `null` limit = unlimited (skip enforcement).
const DEFAULT_POLICIES: Record<string, {
  annualLimit: number | null
  monthlyLimit: number | null
  carryForwardAllowed: boolean
  maxCarryForwardDays: number | null
  isPaid: boolean
  requiresApproval: boolean
}> = {
  casual: { annualLimit: 12, monthlyLimit: null, carryForwardAllowed: false, maxCarryForwardDays: null, isPaid: true, requiresApproval: true },
  sick: { annualLimit: 10, monthlyLimit: null, carryForwardAllowed: false, maxCarryForwardDays: null, isPaid: true, requiresApproval: true },
  earned: { annualLimit: 15, monthlyLimit: null, carryForwardAllowed: false, maxCarryForwardDays: null, isPaid: true, requiresApproval: true },
  maternity: { annualLimit: 180, monthlyLimit: null, carryForwardAllowed: false, maxCarryForwardDays: null, isPaid: true, requiresApproval: true },
  unpaid: { annualLimit: null, monthlyLimit: null, carryForwardAllowed: false, maxCarryForwardDays: null, isPaid: false, requiresApproval: true },
  government: { annualLimit: null, monthlyLimit: null, carryForwardAllowed: false, maxCarryForwardDays: null, isPaid: true, requiresApproval: false },
}

export const DEFAULT_LEAVE_TYPES = Object.keys(DEFAULT_POLICIES)

// Ensures a global (branchId: null) policy row exists for every known leave
// type, per organization. Safe to call on every GET — no-ops once rows exist.
// Org-scoped: each clinic gets (and edits) its own default policy rows —
// previously these rows were shared globally across all tenants.
export async function ensureDefaultLeavePolicies(client: TxClient | typeof db, organizationId: string | null): Promise<void> {
  const existing = await client.leavePolicy.findMany({
    where: { branchId: null, organizationId },
    select: { leaveType: true },
  })
  const have = new Set(existing.map((p) => p.leaveType))
  const missing = DEFAULT_LEAVE_TYPES.filter((t) => !have.has(t))
  if (missing.length === 0) return

  await client.leavePolicy.createMany({
    data: missing.map((leaveType) => ({
      leaveType,
      branchId: null,
      organizationId,
      ...DEFAULT_POLICIES[leaveType],
    })),
  })
}

// Resolves the applicable policy for a leaveType, preferring a branch-specific
// override and falling back to the global (branchId: null) default.
//
// Note: Prisma's generated compound-unique WhereUniqueInput for
// [leaveType, branchId] types branchId as `string` (not nullable) even though
// the column itself is nullable — findUnique/upsert can't be used to look up
// the global (branchId: null) rows. findFirst works with any nullable value.
export async function resolveLeavePolicy(
  client: TxClient | typeof db,
  organizationId: string | null,
  leaveType: string,
  branchId: string | null | undefined
) {
  if (branchId) {
    const branchPolicy = await client.leavePolicy.findFirst({
      where: { leaveType, branchId, organizationId },
    })
    if (branchPolicy) return branchPolicy
  }
  return client.leavePolicy.findFirst({
    where: { leaveType, branchId: null, organizationId },
  })
}
