import { dbUnscoped } from './db'
import { ROLE_DESIGNATION, isStaffRole } from './role-permissions'

// ---------------------------------------------------------------------------
// User ↔ Employee sync
// ---------------------------------------------------------------------------
// Staff logins (User) and HR records (Employee) describe the same person:
// anyone with a staff login also gets paid, so they must appear in the
// Employees module (salary, payroll, attendance). Two entry points:
//
//  1. linkOrCreateEmployeeForUser — called right after a staff User is
//     created in User Management, inside the same transaction.
//  2. backfillEmployeesFromUsers — throttled self-healing sweep run when the
//     Employees list loads: any staff user with no linked Employee record
//     gets one (covers users created before this sync existed).
//
// Matching rule: an existing Employee with the same email and no userId is
// LINKED (not duplicated) — that's the "employee added first, login added
// later from User Management" case.

type AnyClient = {
  employee: {
    findFirst: (args: object) => Promise<{ id: string; employeeId: string } | null>
    create: (args: object) => Promise<{ id: string }>
    update: (args: object) => Promise<unknown>
    findMany: (args: object) => Promise<Array<{ userId?: string | null }>>
  }
  user: {
    findMany: (args: object) => Promise<Array<{ id: string; name: string; email: string; phone: string | null; role: string; therapyType: string | null; branchId: string | null }>>
  }
}

function departmentForRole(role: string): string {
  return role.startsWith('therapist') || role === 'psychologist' ? 'therapist' : 'admin'
}

async function nextEmployeeId(client: AnyClient, organizationId: string | null): Promise<string> {
  const lastEmp = await client.employee.findFirst({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, employeeId: true },
  })
  let nextNum = 1
  if (lastEmp?.employeeId) {
    const num = parseInt(lastEmp.employeeId.replace('EMP-', ''))
    if (!isNaN(num)) nextNum = num + 1
  }
  return `EMP-${String(nextNum).padStart(4, '0')}`
}

export async function linkOrCreateEmployeeForUser(
  client: AnyClient,
  organizationId: string | null,
  user: { id: string; name: string; email: string; phone?: string | null; role: string; branchId?: string | null }
): Promise<void> {
  if (!isStaffRole(user.role)) return

  // Existing employee with this email and no login yet → link it.
  const existing = await client.employee.findFirst({
    where: { email: user.email, organizationId, userId: null },
    select: { id: true, employeeId: true },
  })
  if (existing) {
    await client.employee.update({ where: { id: existing.id }, data: { userId: user.id } as never })
    return
  }

  await client.employee.create({
    data: {
      employeeId: await nextEmployeeId(client, organizationId),
      name: user.name,
      designation: ROLE_DESIGNATION[user.role] || user.role,
      department: departmentForRole(user.role),
      mobile: user.phone || '',
      email: user.email,
      branchId: user.branchId || null,
      basicSalary: 0, // HR fills salary in the Employees module
      organizationId,
      userId: user.id,
    } as never,
  })
}

// Throttled per-org so the sweep doesn't run on every Employees page load.
const lastBackfillAt = new Map<string, number>()
const BACKFILL_THROTTLE_MS = 60_000

export async function backfillEmployeesFromUsers(organizationId: string | null): Promise<void> {
  const key = organizationId || '__none__'
  const now = Date.now()
  if (now - (lastBackfillAt.get(key) || 0) < BACKFILL_THROTTLE_MS) return
  lastBackfillAt.set(key, now)

  const client = dbUnscoped as unknown as AnyClient

  try {
  const staffUsers = await client.user.findMany({
    where: {
      organizationId,
      isActive: true,
      NOT: [{ role: 'parent' }, { role: 'super_admin' }],
    },
    select: { id: true, name: true, email: true, phone: true, role: true, therapyType: true, branchId: true },
  })
  if (staffUsers.length === 0) return

  // Which of them already have a linked employee record?
  const linked = await client.employee.findMany({
    where: { organizationId, userId: { in: staffUsers.map((u) => u.id) } } as never,
    select: { userId: true },
  })
  const linkedIds = new Set(linked.map((e) => e.userId))

  for (const u of staffUsers) {
    if (linkedIds.has(u.id)) continue
    try {
      await linkOrCreateEmployeeForUser(client, organizationId, u)
    } catch (err) {
      // Best-effort: one bad row must not block the Employees list.
      console.error(`employee backfill failed for user ${u.email}:`, err)
    }
  }
  } catch (err) {
    // Fail-open: the backfill is a convenience sweep — it must NEVER take
    // down the Employees list itself (e.g. when Employee.userId doesn't
    // exist yet because `npm run db:push` hasn't been run after the schema
    // change — the exact cause of a 500 here once).
    console.error('employee backfill sweep failed (non-fatal):', err)
  }
}
