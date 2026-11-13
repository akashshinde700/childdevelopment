import { NextResponse } from 'next/server'
import { db } from './db'

// ---------------------------------------------------------------------------
// Plan limit + feature enforcement (SaaS Phase B)
// ---------------------------------------------------------------------------
// Limits are enforced at the point of creation (users, employees, branches),
// not as a report checked later. A clinic over its limit gets a
// 402 Payment Required with an upgrade-prompt payload the frontend can show.
//
// Feature flags (Plan.features JSON) are enforced at the API layer with
// requireFeature() — hiding a nav item in the UI is NOT enforcement, since
// the API can be called directly.
//
// GRANDFATHER RULE: an organization with NO Subscription row (e.g. the
// original live clinic before a plan is assigned via the platform-admin
// portal) is treated as unlimited/all-features. This guarantees the live
// clinic can never be locked out by this code shipping before plans are
// assigned. Assign plans via /platform-admin to activate enforcement.

export type PlanFeatures = {
  customBranding?: boolean
  whiteLabel?: boolean
  advancedReports?: boolean
  exportData?: boolean
  apiAccess?: boolean
  // Payroll Engine salary modes — MONTHLY is the universal baseline (every
  // plan already supports it, matching pre-Payroll-Engine behavior); these
  // two gate the newer per-session-based modes.
  payrollPerSession?: boolean
  payrollHybrid?: boolean
  [key: string]: boolean | undefined
}

type SubWithPlan = {
  status: string
  trialEndsAt: Date | null
  currentPeriodEnd: Date | null
  plan: {
    name: string
    tier: string
    therapistLimit: number
    branchLimit: number
    userLimit: number
    storageLimitMB: number
    priceMonthly: number
    priceYearly: number
    features: unknown
  }
} | null

// Per-org 60s cache — these checks run on hot paths (user/employee/branch
// creation, feature-gated routes) and the subscription changes rarely.
const cache = new Map<string, { at: number; sub: SubWithPlan }>()
const CACHE_TTL_MS = 60_000

export async function getOrgSubscription(organizationId: string | null): Promise<SubWithPlan> {
  if (!organizationId) return null
  const hit = cache.get(organizationId)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.sub
  const sub = await db.subscription.findUnique({
    where: { organizationId },
    select: {
      status: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      plan: {
        select: {
          name: true, tier: true, therapistLimit: true, branchLimit: true, userLimit: true,
          storageLimitMB: true, priceMonthly: true, priceYearly: true,
          features: true,
        },
      },
    },
  })
  cache.set(organizationId, { at: Date.now(), sub })
  return sub
}

/** Call after a platform-admin changes an org's subscription so the new plan applies immediately. */
export function invalidateSubscriptionCache(organizationId?: string) {
  if (organizationId) cache.delete(organizationId)
  else cache.clear()
}

/**
 * Is the org allowed to use the app at all?
 * - no subscription row  → allowed (grandfathered, see above)
 * - trialing             → allowed until trialEndsAt
 * - active               → allowed
 * - past_due/suspended/cancelled → blocked
 */
export async function isOrgActive(organizationId: string | null): Promise<boolean> {
  const sub = await getOrgSubscription(organizationId)
  if (!sub) return true
  if (sub.status === 'active') return true
  if (sub.status === 'trialing') {
    return !sub.trialEndsAt || sub.trialEndsAt.getTime() > Date.now()
  }
  return false
}

export function isTherapistRole(role: string): boolean {
  return role.startsWith('therapist') || role === 'psychologist'
}

const THERAPIST_EMPLOYEE_PATTERN = /(therap|psycholog|counsel)/i

export function isTherapistEmployee(designation?: string | null, department?: string | null): boolean {
  return THERAPIST_EMPLOYEE_PATTERN.test(designation || '') || THERAPIST_EMPLOYEE_PATTERN.test(department || '')
}

type LimitCheck = { ok: true } | { ok: false; response: NextResponse }

function limitResponse(what: string, current: number, limit: number, planName: string): NextResponse {
  return NextResponse.json(
    {
      error: `Your "${planName}" plan allows ${limit} ${what}${limit === 1 ? '' : 's'} — you already have ${current}. Upgrade your plan to add more.`,
      code: 'PLAN_LIMIT_REACHED',
      limitType: what,
      current,
      limit,
      upgradeRequired: true,
    },
    { status: 402 }
  )
}

/** Enforced when creating a User account with a therapist/psychologist role. */
export async function checkTherapistUserLimit(organizationId: string | null): Promise<LimitCheck> {
  const sub = await getOrgSubscription(organizationId)
  if (!sub) return { ok: true }
  const current = await db.user.count({
    where: {
      organizationId,
      isActive: true,
      OR: [{ role: { startsWith: 'therapist' } }, { role: 'psychologist' }],
    },
  })
  if (current >= sub.plan.therapistLimit) {
    return { ok: false, response: limitResponse('therapist', current, sub.plan.therapistLimit, sub.plan.name) }
  }
  return { ok: true }
}

/** Enforced when creating an Employee record in a therapy role/department.
 *  (Therapists don't need a login to be scheduled — Appointment.therapistId
 *  stores a name — so counting only User seats would undercount.) */
export async function checkTherapistEmployeeLimit(organizationId: string | null): Promise<LimitCheck> {
  const sub = await getOrgSubscription(organizationId)
  if (!sub) return { ok: true }
  const employees = await db.employee.findMany({
    where: { organizationId, status: 'active' },
    select: { designation: true, department: true },
  })
  const current = employees.filter((e) => isTherapistEmployee(e.designation, e.department)).length
  if (current >= sub.plan.therapistLimit) {
    return { ok: false, response: limitResponse('therapist', current, sub.plan.therapistLimit, sub.plan.name) }
  }
  return { ok: true }
}

/** Enforced when creating a non-therapist, non-parent staff User account. */
export async function checkStaffUserLimit(organizationId: string | null): Promise<LimitCheck> {
  const sub = await getOrgSubscription(organizationId)
  if (!sub) return { ok: true }
  const current = await db.user.count({
    where: {
      organizationId,
      isActive: true,
      NOT: [
        { role: { startsWith: 'therapist' } },
        { role: 'psychologist' },
        { role: 'parent' },
      ],
    },
  })
  if (current >= sub.plan.userLimit) {
    return { ok: false, response: limitResponse('staff user', current, sub.plan.userLimit, sub.plan.name) }
  }
  return { ok: true }
}

export async function checkBranchLimit(organizationId: string | null): Promise<LimitCheck> {
  const sub = await getOrgSubscription(organizationId)
  if (!sub) return { ok: true }
  const current = await db.branch.count({ where: { organizationId, isActive: true } })
  if (current >= sub.plan.branchLimit) {
    return { ok: false, response: limitResponse('branch', current, sub.plan.branchLimit, sub.plan.name) }
  }
  return { ok: true }
}

/**
 * Plan-gated feature check for API routes. Returns null when allowed, or a
 * ready-to-return 403 NextResponse when the org's plan lacks the feature.
 *
 *   const gate = await requireFeature(organizationId, 'advancedReports')
 *   if (gate) return gate
 */
export async function requireFeature(organizationId: string | null, feature: keyof PlanFeatures): Promise<NextResponse | null> {
  const sub = await getOrgSubscription(organizationId)
  if (!sub) return null // grandfathered
  const features = (sub.plan.features ?? {}) as PlanFeatures
  if (features[feature]) return null
  return NextResponse.json(
    {
      error: `The "${String(feature)}" feature is not included in your "${sub.plan.name}" plan. Upgrade to unlock it.`,
      code: 'PLAN_FEATURE_LOCKED',
      feature,
      upgradeRequired: true,
    },
    { status: 403 }
  )
}
