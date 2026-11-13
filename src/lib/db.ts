import { PrismaClient, Prisma } from '@prisma/client'

// ---------------------------------------------------------------------------
// TENANT GUARD (multi-tenant safety net)
// ---------------------------------------------------------------------------
// Every tenant-scoped model requires an explicit top-level `organizationId`
// in `where` for list/aggregate/bulk operations, and in `data` for creates.
// A query that forgets it THROWS instead of silently returning every
// clinic's data — turning a potential cross-tenant data leak into a loud,
// immediate 500 caught in development.
//
// This is defense-in-depth on top of the manual `where: { organizationId }`
// filters the API routes already apply; it exists so that one forgotten
// line in a future edit can never leak another clinic's patient data.
//
// Deliberately unguarded operations: findUnique / update / delete / upsert
// (they target a single row by unique id, and Prisma forbids non-unique
// fields in their `where`). Routes must use the existing pattern for those:
// `findFirst({ where: { id, organizationId } })` to verify ownership before
// acting — every [id] route already does this.
//
// Code that legitimately needs to query across ALL organizations (the
// platform-admin layer, global self-healing sweeps, seed scripts, login
// before a session exists) must use `dbUnscoped` — grep for it to audit
// every cross-tenant access point in one search.

const TENANT_MODELS = new Set([
  'Branch', 'User', 'ActivityLog', 'Patient', 'Appointment', 'Package',
  'PackageTherapyType', 'PatientPackage', 'PatientPackageTherapyType',
  'TherapySession', 'Assessment', 'Invoice', 'InvoiceItem', 'Service',
  'Payment', 'Employee', 'EmployeeDocument', 'Attendance', 'Leave',
  'LeavePolicy', 'PayrollRecord', 'Expense', 'WhatsAppLog', 'Lead',
  'ActionLog', 'SystemConfig', 'Notification', 'Role', 'CenterSettings',
  'TherapistRate', 'OrganizationDefaultRate', 'TherapistEarning',
])

const WHERE_GUARDED_OPS = new Set([
  'findMany', 'findFirst', 'count', 'aggregate', 'groupBy',
  'updateMany', 'deleteMany',
])
const CREATE_GUARDED_OPS = new Set(['create', 'createMany'])

export class TenantScopeError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Tenant guard: ${model}.${operation} called without organizationId. ` +
      `Add organizationId to the query (from the session user), or use ` +
      `dbUnscoped if cross-organization access is intentional.`
    )
    this.name = 'TenantScopeError'
  }
}

function hasOrgScope(where: unknown): boolean {
  if (!where || typeof where !== 'object') return false
  const w = where as Record<string, unknown>
  // Explicit `organizationId: null` still counts as scoping — it matches
  // only org-less legacy rows, which cannot leak another clinic's data.
  if ('organizationId' in w) return true
  // Allow `AND: [{ organizationId }, ...]` composition.
  if (Array.isArray(w.AND)) return w.AND.some((c) => hasOrgScope(c))
  if (w.AND && typeof w.AND === 'object') return hasOrgScope(w.AND)
  return false
}

function hasOrgData(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  if (Array.isArray(data)) return data.every((d) => hasOrgData(d))
  const d = data as Record<string, unknown>
  return d.organizationId !== undefined || d.organization !== undefined
}

// ---------------------------------------------------------------------------
// SOFT-DELETE FILTER
// ---------------------------------------------------------------------------
// Invoice/Payment support a soft-delete (`deletedAt`) so a patient's billing
// history survives patient deletion for audit/accounting compliance while
// disappearing from normal listings and totals. This extension applies the
// `deletedAt: null` filter to every list/aggregate query automatically so
// call sites never have to remember to add it themselves.

const softDeleteExtension = Prisma.defineExtension({
  name: 'soft-delete',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (model === 'Invoice' || model === 'Payment') {
          if (['findMany', 'count', 'aggregate'].includes(operation)) {
            const a = args as { where?: Record<string, unknown> }
            a.where = { ...a.where, deletedAt: null }
          }
        }
        return query(args)
      },
    },
  },
})

function createClient(base: PrismaClient) {
  return base
    .$extends({
      name: 'tenant-guard',
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (TENANT_MODELS.has(model)) {
              if (WHERE_GUARDED_OPS.has(operation)) {
                const a = (args ?? {}) as { where?: unknown }
                if (!hasOrgScope(a.where)) throw new TenantScopeError(model, operation)
              } else if (CREATE_GUARDED_OPS.has(operation)) {
                const a = (args ?? {}) as { data?: unknown }
                if (!hasOrgData(a.data)) throw new TenantScopeError(model, operation)
              }
            }
            return query(args)
          },
        },
      },
    })
    .$extends(softDeleteExtension)
}

// Unscoped client keeps the soft-delete filter but skips the tenant guard.
function createUnscopedClient(base: PrismaClient) {
  return base.$extends(softDeleteExtension)
}

const globalForPrisma = globalThis as unknown as {
  prismaBase: PrismaClient | undefined
  prisma: ReturnType<typeof createClient> | undefined
  prismaUnscoped: ReturnType<typeof createUnscopedClient> | undefined
}

// Single base client = single connection pool shared by both variants.
const baseClient = globalForPrisma.prismaBase ?? new PrismaClient({ log: ['query'] })

/** Tenant-guarded client — the default. Use everywhere a session user exists. */
export const db = globalForPrisma.prisma ?? createClient(baseClient)

/**
 * Cross-tenant client — NO tenant guard. Only for: platform-admin routes,
 * login (pre-session), global self-healing sweeps, and seed scripts.
 * Every usage is an auditable cross-tenant access point.
 */
export const dbUnscoped = globalForPrisma.prismaUnscoped ?? createUnscopedClient(baseClient)

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaBase = baseClient
  globalForPrisma.prisma = db
  globalForPrisma.prismaUnscoped = dbUnscoped
}
