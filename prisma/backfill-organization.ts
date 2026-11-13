/**
 * Phase A backfill — one-time, idempotent.
 *
 * 1. Creates Organization #1 for the existing live clinic if it doesn't
 *    already exist.
 * 2. Sets organizationId on every existing row across every tenant-scoped
 *    table so nothing is orphaned once enforcement is turned on later.
 * 3. Seeds the three catalog Plans (Basic/Advance/Premium) from
 *    SAAS-TRANSFORMATION-PLAN.md §2, and grandfathers the existing clinic
 *    onto an active, unrestricted Premium subscription (they're the
 *    original customer, not a new signup — no trial, no retroactive limit
 *    checks).
 *
 * Note: this already ran once against the live DB (org slug 'creative-mind'
 * exists) — the upsert's empty `update: {}` means re-running it will never
 * rename that existing org, so the `create` values below only matter if
 * this is ever run fresh against an empty database.
 *
 * Run: npx tsx prisma/backfill-organization.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const org = await db.organization.upsert({
    where: { slug: 'creative-mind' },
    update: {},
    create: {
      name: 'Your Clinic Name',
      slug: 'creative-mind',
      status: 'active',
    },
  })
  console.log(`Organization: ${org.id} (${org.name})`)

  const orgId = org.id

  // Every model that got an organizationId column in this migration.
  // updateMany with `organizationId: null` is idempotent — re-running finds
  // nothing left to update once the first run completes.
  const targets: { name: string; model: { updateMany: (args: { where: { organizationId: null }; data: { organizationId: string } }) => Promise<{ count: number }> } }[] = [
    { name: 'branch', model: db.branch },
    { name: 'user', model: db.user },
    { name: 'activityLog', model: db.activityLog },
    { name: 'patient', model: db.patient },
    { name: 'appointment', model: db.appointment },
    { name: 'package', model: db.package },
    { name: 'packageTherapyType', model: db.packageTherapyType },
    { name: 'patientPackage', model: db.patientPackage },
    { name: 'patientPackageTherapyType', model: db.patientPackageTherapyType },
    { name: 'therapySession', model: db.therapySession },
    { name: 'assessment', model: db.assessment },
    { name: 'invoice', model: db.invoice },
    { name: 'invoiceItem', model: db.invoiceItem },
    { name: 'service', model: db.service },
    { name: 'payment', model: db.payment },
    { name: 'employee', model: db.employee },
    { name: 'employeeDocument', model: db.employeeDocument },
    { name: 'attendance', model: db.attendance },
    { name: 'leave', model: db.leave },
    { name: 'leavePolicy', model: db.leavePolicy },
    { name: 'payrollRecord', model: db.payrollRecord },
    { name: 'expense', model: db.expense },
    { name: 'whatsAppLog', model: db.whatsAppLog },
    { name: 'lead', model: db.lead },
    { name: 'actionLog', model: db.actionLog },
    { name: 'notification', model: db.notification },
    { name: 'role', model: db.role },
    { name: 'systemConfig', model: db.systemConfig },
    { name: 'centerSettings', model: db.centerSettings },
  ]

  for (const { name, model } of targets) {
    const result = await model.updateMany({
      where: { organizationId: null },
      data: { organizationId: orgId },
    })
    if (result.count > 0) console.log(`  ${name}: backfilled ${result.count} row(s)`)
  }

  // ── Seed the 3 catalog plans (idempotent by name) ──
  const planDefs = [
    {
      name: 'Basic', tier: 'basic',
      therapistLimit: 5, branchLimit: 1, userLimit: 3,
      storageLimitMB: 5 * 1024, whatsappQuota: 500,
      priceMonthly: 2999, priceYearly: 29990,
      features: { customBranding: false, whiteLabel: false, advancedReports: false, exportData: true, apiAccess: false, payrollPerSession: false, payrollHybrid: false },
    },
    {
      name: 'Advance', tier: 'advance',
      therapistLimit: 10, branchLimit: 3, userLimit: 6,
      storageLimitMB: 25 * 1024, whatsappQuota: 2000,
      priceMonthly: 6999, priceYearly: 69990,
      features: { customBranding: true, whiteLabel: false, advancedReports: true, exportData: true, apiAccess: false, payrollPerSession: true, payrollHybrid: true },
    },
    {
      name: 'Premium', tier: 'premium',
      therapistLimit: 20, branchLimit: 999, userLimit: 999,
      storageLimitMB: 100 * 1024, whatsappQuota: 10000,
      priceMonthly: 14999, priceYearly: 149990,
      features: { customBranding: true, whiteLabel: true, advancedReports: true, exportData: true, apiAccess: true, payrollPerSession: true, payrollHybrid: true },
    },
  ]

  const plansByTier: Record<string, { id: string }> = {}
  for (const def of planDefs) {
    const existing = await db.plan.findFirst({ where: { tier: def.tier } })
    const plan = existing
      ? await db.plan.update({ where: { id: existing.id }, data: def })
      : await db.plan.create({ data: def })
    plansByTier[def.tier] = plan
    console.log(`Plan: ${plan.name} (₹${def.priceMonthly}/mo)`)
  }

  // ── Grandfather the existing clinic onto Premium, active, no trial ──
  const existingSub = await db.subscription.findUnique({ where: { organizationId: orgId } })
  if (!existingSub) {
    const sub = await db.subscription.create({
      data: {
        organizationId: orgId,
        planId: plansByTier.premium.id,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: null, // grandfathered — no forced renewal date for the original customer
      },
    })
    console.log(`Subscription: ${sub.id} — Existing clinic on Premium, active`)
  } else {
    console.log(`Subscription already exists: ${existingSub.id}`)
  }

  console.log('Backfill complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
