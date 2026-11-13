import { dbUnscoped } from './db'
import { notifyPatientParent } from './notifications'

// NOTE ON TENANT SCOPE: this module uses `dbUnscoped` deliberately. It is a
// global self-healing sweep over package expiry state — every query is
// either keyed to a single patientId (recalcPatientStatus) or updates rows
// based purely on each row's OWN package dates (syncAllPatientStatuses).
// No data ever crosses from one organization's rows into another's output;
// notifications look up the patient's organizationId per row and stay
// scoped. Running the sweep across all orgs at once is what lets one
// throttled pass serve every clinic without a per-org cron.

// Keeps Patient.status in sync with how the patient is actually being treated:
//   - "active"   — a PatientPackage that is status='active' and not past its
//                  endDate, OR a recently completed session the clinic has
//                  been paid for (the session-wise case below).
//   - "inactive" — neither of those.
// Deleted or manually-discharged patients are left untouched — those are
// terminal states an admin set on purpose, not something this should override.
//
// ── Session-wise patients ──
// They buy no package, so package state alone reported them "inactive"
// forever even while attending and paying. Such a patient counts as active
// when BOTH hold:
//   1. a session of theirs is completed, and
//   2. the clinic has actually received money for them (a raised but unpaid
//      invoice is not enough).
// They go back to inactive one day after that session completes, so the
// active list stays the people currently being treated. Taking and paying
// for the next session makes them active again.

const SESSION_ACTIVE_MS = 24 * 60 * 60 * 1000

// Received money = a completed Payment, or an Invoice with something paid
// against it. Mirrors how the parent portal and patient summary count money
// in. `deletedAt` is spelled out because the db client's soft-delete filter
// only covers top-level Invoice/Payment queries, not relation filters.
const RECEIVED_PAYMENT = {
  payments: { some: { status: 'completed', type: 'payment', deletedAt: null } },
} as const
const RECEIVED_INVOICE_PAYMENT = {
  invoices: { some: { amountPaid: { gt: 0 }, status: { not: 'cancelled' }, deletedAt: null } },
} as const

/** Patient filter: paid for, and with a session completed since `since`. */
function recentlyTreatedFilter(since: Date) {
  return {
    appointments: { some: { status: 'completed', date: { gte: since } } },
    OR: [RECEIVED_PAYMENT, RECEIVED_INVOICE_PAYMENT],
  }
}

async function isRecentlyTreated(patientId: string, since: Date): Promise<boolean> {
  const n = await dbUnscoped.patient.count({ where: { id: patientId, ...recentlyTreatedFilter(since) } })
  return n > 0
}

export async function recalcPatientStatus(patientId: string): Promise<string | null> {
  const patient = await dbUnscoped.patient.findUnique({ where: { id: patientId }, select: { status: true, organizationId: true } })
  if (!patient || patient.status === 'deleted' || patient.status === 'discharged') {
    return patient?.status ?? null
  }

  const now = new Date()

  // Self-healing: flip any package whose end date has silently passed while
  // still marked "active" — this is what makes the transition automatic
  // without a background job. Packages are looked up before the update so
  // their names are available for the expiry notification below.
  const justExpired = await dbUnscoped.patientPackage.findMany({
    where: { patientId, status: 'active', endDate: { lt: now } },
    select: { id: true, name: true, package: { select: { name: true } } },
  })
  if (justExpired.length > 0) {
    await dbUnscoped.patientPackage.updateMany({
      where: { id: { in: justExpired.map((p) => p.id) } },
      data: { status: 'expired' },
    })
    for (const pp of justExpired) {
      await notifyPatientParent(patient.organizationId, patientId, {
        type: 'package',
        title: 'Package Expired',
        message: `Your package "${pp.name ?? pp.package?.name ?? 'therapy package'}" has expired.`,
        link: 'parent-dashboard',
      })
    }
  }

  const activeCount = await dbUnscoped.patientPackage.count({
    where: { patientId, status: 'active', endDate: { gte: now } },
  })

  const sessionCutoff = new Date(now.getTime() - SESSION_ACTIVE_MS)
  const newStatus = (activeCount > 0 || await isRecentlyTreated(patientId, sessionCutoff))
    ? 'active'
    : 'inactive'
  if (newStatus !== patient.status) {
    await dbUnscoped.patient.update({ where: { id: patientId }, data: { status: newStatus } })
  }
  return newStatus
}

// Bulk version of the same self-healing logic, called at the top of the
// patients list / dashboard stats routes — i.e. on every single page load,
// not once per row. Without a throttle this ran several extra queries plus
// up to two updateMany writes on every GET request, even though a package's
// expiry status only ever needs to be this fresh (a stale window of up to
// SYNC_THROTTLE_MS is invisible to users). Throttling to a short interval
// keeps the self-healing behavior (no cron job needed) while cutting that
// work down to once per interval instead of once per request.
let lastSyncAt = 0
const SYNC_THROTTLE_MS = 60_000

export async function syncAllPatientStatuses(): Promise<void> {
  const nowMs = Date.now()
  if (nowMs - lastSyncAt < SYNC_THROTTLE_MS) return
  lastSyncAt = nowMs

  const now = new Date()

  // Naturally idempotent: once a package flips to 'expired' it no longer
  // matches this where clause, so re-running this on every request (as the
  // patients-list/dashboard routes do) never re-notifies the same package.
  const justExpired = await dbUnscoped.patientPackage.findMany({
    where: { status: 'active', endDate: { lt: now } },
    select: { id: true, patientId: true, organizationId: true, name: true, package: { select: { name: true } } },
  })
  if (justExpired.length > 0) {
    await dbUnscoped.patientPackage.updateMany({
      where: { id: { in: justExpired.map((p) => p.id) } },
      data: { status: 'expired' },
    })
    for (const pp of justExpired) {
      await notifyPatientParent(pp.organizationId, pp.patientId, {
        type: 'package',
        title: 'Package Expired',
        message: `Your package "${pp.name ?? pp.package?.name ?? 'therapy package'}" has expired.`,
        link: 'parent-dashboard',
      })
    }
  }

  const stillActive = await dbUnscoped.patientPackage.findMany({
    where: { status: 'active', endDate: { gte: now } },
    select: { patientId: true },
    distinct: ['patientId'],
  })
  const activeIds = stillActive.map((p) => p.patientId)

  // Demote patients with neither a live package nor a recent paid-for
  // session. Expressed as relation filters rather than a second id list so
  // the set never has to be loaded into memory.
  const sessionCutoff = new Date(now.getTime() - SESSION_ACTIVE_MS)
  await dbUnscoped.patient.updateMany({
    where: {
      status: 'active',
      isDeleted: false,
      ...(activeIds.length > 0 ? { id: { notIn: activeIds } } : {}),
      NOT: recentlyTreatedFilter(sessionCutoff),
    },
    data: { status: 'inactive' },
  })
  // Promote: a live package, or a recent session the clinic was paid for.
  await dbUnscoped.patient.updateMany({
    where: {
      status: 'inactive',
      isDeleted: false,
      OR: [
        ...(activeIds.length > 0 ? [{ id: { in: activeIds } }] : []),
        recentlyTreatedFilter(sessionCutoff),
      ],
    },
    data: { status: 'active' },
  })
}
