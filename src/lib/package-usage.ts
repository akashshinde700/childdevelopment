import { db, dbUnscoped } from '@/lib/db'

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

// ── Package usage is DERIVED, never accumulated ──
//
// "Sessions used" on a package (PatientPackage.sessionsCompleted, and the
// per-therapy-type block counter) used to be a running +1/−1 tally bumped by
// whichever screen completed a session. Any path that ran twice — saving an
// already-completed appointment again, a double-tapped Complete button, two
// requests racing — added a session that never happened (one patient's 4
// sessions showed as 6).
//
// Now the number is recounted from its source of truth every time something
// changes: the completed appointments linked to that package. Recounting is
// idempotent, so repeats and races can no longer drift it, and it also heals
// any drift that already exists the next time the package is touched.
//
// Nothing else writes these counters (no manual "already used" entry), which
// is what makes the linked appointments a complete source of truth.

/** Recount one package's used sessions and keep active/completed in step. */
export async function syncPackageUsage(
  tx: TxClient,
  organizationId: string | null | undefined,
  patientPackageId: string | null | undefined,
): Promise<void> {
  if (!patientPackageId) return
  const pp = await tx.patientPackage.findFirst({
    where: { id: patientPackageId, organizationId: organizationId ?? null },
    select: { id: true, sessionsPurchased: true, sessionsCompleted: true, status: true },
  })
  if (!pp) return

  const used = await tx.appointment.count({
    where: { patientPackageId: pp.id, status: 'completed', organizationId: organizationId ?? null },
  })

  // Only flips between the two states usage decides; 'expired' (dates) and
  // anything an admin set is left alone.
  let status = pp.status
  if (used >= pp.sessionsPurchased && pp.status === 'active') status = 'completed'
  else if (used < pp.sessionsPurchased && pp.status === 'completed') status = 'active'

  if (used !== pp.sessionsCompleted || status !== pp.status) {
    await tx.patientPackage.update({
      where: { id: pp.id },
      data: { sessionsCompleted: used, status },
    })
  }
}

/** Recount one therapy-type block of a bundled package. */
export async function syncBlockUsage(
  tx: TxClient,
  organizationId: string | null | undefined,
  blockId: string | null | undefined,
): Promise<void> {
  if (!blockId) return
  const block = await tx.patientPackageTherapyType.findFirst({
    where: { id: blockId, organizationId: organizationId ?? null },
    select: { id: true, sessionsCompleted: true },
  })
  if (!block) return
  const used = await tx.appointment.count({
    where: { patientPackageTherapyTypeId: block.id, status: 'completed', organizationId: organizationId ?? null },
  })
  if (used !== block.sessionsCompleted) {
    await tx.patientPackageTherapyType.update({ where: { id: block.id }, data: { sessionsCompleted: used } })
  }
}

// ── Safety net: global drift sweep ──
// Every completion path recounts already; this catches anything that slips
// past them (a future code path, a direct DB edit). Throttled the same way
// as the patient-status sweep and run from the same page loads, so no cron
// is needed. Cross-tenant on purpose (dbUnscoped): each package is compared
// only with its OWN appointments — nothing crosses organizations.
let lastSweepAt = 0
const SWEEP_THROTTLE_MS = 60_000

export async function reconcileAllPackageUsage(): Promise<void> {
  const now = Date.now()
  if (now - lastSweepAt < SWEEP_THROTTLE_MS) return
  lastSweepAt = now

  try {
    const [packages, counts] = await Promise.all([
      dbUnscoped.patientPackage.findMany({
        where: { status: { in: ['active', 'completed'] } },
        select: { id: true, sessionsPurchased: true, sessionsCompleted: true, status: true },
      }),
      dbUnscoped.appointment.groupBy({
        by: ['patientPackageId'],
        where: { status: 'completed', patientPackageId: { not: null } },
        _count: { _all: true },
      }),
    ])
    const usedById = new Map(counts.map((c) => [c.patientPackageId as string, c._count._all]))

    for (const pp of packages) {
      const used = usedById.get(pp.id) ?? 0
      let status = pp.status
      if (used >= pp.sessionsPurchased && pp.status === 'active') status = 'completed'
      else if (used < pp.sessionsPurchased && pp.status === 'completed') status = 'active'
      if (used === pp.sessionsCompleted && status === pp.status) continue

      console.warn(`Package usage drift fixed: package ${pp.id} counter ${pp.sessionsCompleted} -> ${used}`)
      await dbUnscoped.patientPackage.update({
        where: { id: pp.id },
        data: { sessionsCompleted: used, status },
      })
    }
  } catch (err) {
    console.error('Package usage sweep failed:', err)
  }
}
