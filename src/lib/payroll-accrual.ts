import type { db } from './db'

// Derived directly from `db.$transaction`'s own callback parameter type, same
// convention as src/lib/package-billing.ts — always matches what `db`'s query
// extensions actually produce at every call site.
type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

export type PaymentType = 'MONTHLY' | 'PER_SESSION' | 'HYBRID'
export type RateType = 'FIXED' | 'PERCENTAGE'

/** Thrown by reverseEarning/reverseOnUncompletion when the source session's
 * earning has already been folded into a generated payroll. Callers (the
 * appointments/assessments PUT routes) catch this OUTSIDE the $transaction
 * (Prisma rethrows on rollback) and map it to a 423 Locked response. */
export class PayrollLockedError extends Error {
  constructor(sourceType: string, sourceId: string) {
    super(
      `This ${sourceType} is locked by a generated payroll — unlock the payroll before editing it.`
    )
    this.name = 'PayrollLockedError'
  }
}

/** Employee.paymentType overrides the organization default; null/invalid
 * values fall back to MONTHLY (the pre-existing, only behavior). */
export function resolveEffectivePaymentType(
  employeePaymentType: string | null | undefined,
  orgSalaryMode: string | null | undefined
): PaymentType {
  const v = employeePaymentType || orgSalaryMode || 'MONTHLY'
  return v === 'PER_SESSION' || v === 'HYBRID' ? v : 'MONTHLY'
}

export async function getOrgSalaryMode(
  tx: TxClient,
  organizationId: string | null
): Promise<PaymentType> {
  if (!organizationId) return 'MONTHLY'
  const settings = await tx.centerSettings.findFirst({
    where: { organizationId },
    select: { payrollSalaryMode: true },
  })
  return resolveEffectivePaymentType(null, settings?.payrollSalaryMode)
}

/** Appointment/Assessment store `therapistName` as free text (no FK) — this
 * resolves it to the Employee record that actually holds rate/payment-type
 * config. Two ways in, because plenty of therapists are on staff without a
 * login of their own:
 *   1. the User of that name and its linked Employee (the normal case), then
 *   2. the Employee of that name directly — a therapist with no login
 *      account used to resolve to nothing, so their completed sessions never
 *      accrued any earnings at all.
 * Returns null when the name doesn't resolve (stale/free-text name, deleted
 * staff) — accrual is skipped rather than failing the clinical action. */
export async function resolveEmployeeByTherapistName(
  tx: TxClient,
  organizationId: string | null,
  therapistName: string | null | undefined
) {
  const name = therapistName?.trim()
  if (!name) return null
  const user = await tx.user.findFirst({
    where: { organizationId, name },
    include: { employee: true },
  })
  if (user?.employee) return user.employee
  return tx.employee.findFirst({ where: { organizationId, name } })
}

interface RateContext {
  packageId: string | null
  branchId: string | null
}

interface RateRow {
  rateType: string
  rate: number
  packageId: string | null
  branchId: string | null
  effectiveFrom: Date
}

/** Picks the most applicable rate row for a given context out of every
 * currently-effective candidate (effectiveFrom <= now <= effectiveTo):
 * a row scoped to the SAME packageId/branchId as the session outranks a
 * wildcard (null) row on that dimension; a row scoped to a DIFFERENT
 * package/branch than the session never matches at all. Ties broken by the
 * most recent effectiveFrom, then most recently created. */
function pickMostApplicable<T extends RateRow>(candidates: T[], context: RateContext, now: Date): T | null {
  const eligible = candidates.filter((c) => {
    if (c.effectiveFrom > now) return false
    if (c.packageId && c.packageId !== context.packageId) return false
    if (c.branchId && c.branchId !== context.branchId) return false
    return true
  })
  if (eligible.length === 0) return null

  const scored = eligible.map((c) => ({
    row: c,
    score: (c.packageId ? 2 : 0) + (c.branchId ? 1 : 0),
  }))
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.row.effectiveFrom.getTime() - a.row.effectiveFrom.getTime()
  })
  return scored[0].row
}

/** Therapist custom rate first, else the organization default, else null
 * (no rate configured for this service type/context at all). Returns the
 * whole row (rateType + rate) since PERCENTAGE mode needs both to compute
 * an amount. */
export async function findApplicableRate(
  tx: TxClient,
  organizationId: string | null,
  employeeId: string,
  serviceType: string,
  context: RateContext
): Promise<{ rateType: RateType; rate: number } | null> {
  const now = new Date()

  const therapistCandidates = await tx.therapistRate.findMany({
    where: {
      organizationId, employeeId, serviceType,
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    },
  })
  const therapistMatch = pickMostApplicable(therapistCandidates, context, now)
  if (therapistMatch) {
    return { rateType: therapistMatch.rateType === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED', rate: therapistMatch.rate }
  }

  const orgCandidates = await tx.organizationDefaultRate.findMany({
    where: {
      organizationId, serviceType,
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    },
  })
  const orgMatch = pickMostApplicable(orgCandidates, context, now)
  if (orgMatch) {
    return { rateType: orgMatch.rateType === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED', rate: orgMatch.rate }
  }

  return null
}

/** The "collected amount" a PERCENTAGE rate applies to. Only resolvable for
 * package-linked appointments today: a package's netAmount already reflects
 * any package-level discount, so netAmount / sessionsPurchased is the best
 * available proxy for "what this one session actually collected" without a
 * per-session invoice link (which doesn't exist in this app yet). Standalone
 * appointments and all assessments have no such link — returns null, and the
 * caller skips accrual the same way it does for a missing rate, rather than
 * guessing at a number. */
async function resolveBaseAmount(
  tx: TxClient,
  organizationId: string | null,
  patientPackageId: string | null
): Promise<number | null> {
  if (!patientPackageId) return null
  const pkg = await tx.patientPackage.findFirst({
    where: { id: patientPackageId, organizationId },
    select: { netAmount: true, sessionsPurchased: true },
  })
  if (!pkg || pkg.sessionsPurchased <= 0) return null
  return pkg.netAmount / pkg.sessionsPurchased
}

async function accrueEarning(
  tx: TxClient,
  params: {
    organizationId: string | null
    employeeId: string
    sourceType: string
    sourceId: string
    serviceType: string
    sessionDate: Date
    packageId: string | null
    branchId: string | null
    patientPackageId: string | null
  }
): Promise<void> {
  const { organizationId, employeeId, sourceType, sourceId, serviceType, sessionDate, patientPackageId } = params
  const rateRow = await findApplicableRate(tx, organizationId, employeeId, serviceType, {
    packageId: params.packageId, branchId: params.branchId,
  })
  if (!rateRow) {
    // Never block the clinical action for a billing misconfiguration — just
    // skip accrual. Surfaced later as an "unrated sessions" list on the
    // Therapist Earnings page so an admin can configure the missing rate.
    console.warn(
      `Payroll: no rate configured for "${serviceType}" (employee ${employeeId}, org ${organizationId}) — skipped earning accrual for ${sourceType} ${sourceId}.`
    )
    return
  }

  let amount: number
  let baseAmount: number | null = null
  if (rateRow.rateType === 'PERCENTAGE') {
    baseAmount = await resolveBaseAmount(tx, organizationId, patientPackageId)
    if (baseAmount == null) {
      console.warn(
        `Payroll: PERCENTAGE rate configured for "${serviceType}" (employee ${employeeId}) but no collected-amount source (not a package-linked session) — skipped earning accrual for ${sourceType} ${sourceId}.`
      )
      return
    }
    amount = Math.round((baseAmount * rateRow.rate) / 100)
  } else {
    amount = rateRow.rate
  }

  const month = sessionDate.getMonth() + 1
  const year = sessionDate.getFullYear()
  await tx.therapistEarning.upsert({
    where: { sourceType_sourceId: { sourceType, sourceId } },
    create: {
      organizationId, employeeId, sourceType, sourceId, serviceType,
      rateType: rateRow.rateType, rate: rateRow.rate, baseAmount, amount,
      sessionDate, month, year,
    },
    update: {
      employeeId, serviceType, rateType: rateRow.rateType, rate: rateRow.rate,
      baseAmount, amount, sessionDate, month, year,
    },
  })
}

async function reverseEarning(tx: TxClient, sourceType: string, sourceId: string): Promise<void> {
  const existing = await tx.therapistEarning.findUnique({
    where: { sourceType_sourceId: { sourceType, sourceId } },
  })
  if (!existing) return
  if (existing.payrollRecordId) throw new PayrollLockedError(sourceType, sourceId)
  await tx.therapistEarning.delete({ where: { id: existing.id } })
}

/** Call from inside the same completion $transaction (appointments/assessments
 * PUT) right after the source record's status flips to 'completed'. Resolves
 * the therapist Employee + effective payment type + rate, and no-ops for
 * MONTHLY-only therapists — zero-cost for clinics that never touch payroll
 * modes. `packageId`/`branchId` scope which rate row applies (both optional —
 * omit for sessions with no package/branch context, e.g. assessments);
 * `patientPackageId` is only used to resolve a PERCENTAGE rate's base amount. */
export async function accrueOnCompletion(
  tx: TxClient,
  params: {
    organizationId: string | null | undefined
    therapistName: string | null | undefined
    sourceType: 'appointment' | 'assessment'
    sourceId: string
    serviceType: string
    sessionDate: Date
    packageId?: string | null
    branchId?: string | null
    patientPackageId?: string | null
  }
): Promise<void> {
  const organizationId = params.organizationId ?? null
  const employee = await resolveEmployeeByTherapistName(tx, organizationId, params.therapistName)
  if (!employee) {
    // No therapist on the record at all is a data gap, not a payroll
    // misconfiguration, and it repeats on every completion — don't log it.
    // A name that IS set but matches nobody is worth seeing.
    if (params.therapistName?.trim()) {
      console.warn(
        `Payroll: therapist "${params.therapistName}" matches no Employee in org ${organizationId} — no earning accrued for ${params.sourceType} ${params.sourceId}. Add them under Employees, or fix the name on the session.`
      )
    }
    return
  }
  const orgMode = await getOrgSalaryMode(tx, organizationId)
  const effectiveType = resolveEffectivePaymentType(employee.paymentType, orgMode)
  if (effectiveType === 'MONTHLY') return

  await accrueEarning(tx, {
    organizationId,
    employeeId: employee.id,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    serviceType: params.serviceType,
    sessionDate: params.sessionDate,
    packageId: params.packageId ?? null,
    branchId: params.branchId ?? null,
    patientPackageId: params.patientPackageId ?? null,
  })
}

/** Call from inside the same $transaction when a completed session/assessment
 * is un-completed (undo / reopened). Throws PayrollLockedError — which rolls
 * back the whole transaction — if payroll has already locked this earning. */
export async function reverseOnUncompletion(
  tx: TxClient,
  sourceType: string,
  sourceId: string
): Promise<void> {
  await reverseEarning(tx, sourceType, sourceId)
}
