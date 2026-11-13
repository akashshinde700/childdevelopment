/**
 * Payroll Engine — one-time, idempotent, ADDITIVE-ONLY backfill.
 *
 * Adds the two new Plan.features keys (`payrollPerSession`, `payrollHybrid`)
 * to every existing Plan row so the Platform Admin's generic feature-toggle
 * UI (which renders a switch for every key present in `features`) shows them
 * immediately — see src/lib/subscription-limits.ts's PlanFeatures type and
 * src/app/platform-admin/page.tsx's PlanCard.
 *
 * Unlike prisma/backfill-organization.ts (which replaces a plan's entire
 * `features` object), this ONLY adds the two new keys and leaves every other
 * field/feature untouched — safe to run even if a Platform Admin has already
 * customized a plan's features since it was first seeded.
 *
 * Defaults: off for Basic-tier plans, on for everything else (Advance/
 * Premium/custom) — matches the Basic/Advance/Premium tiering already used
 * in backfill-organization.ts. Skips any plan that already has both keys set
 * (re-running is a no-op).
 *
 * Run: npx tsx prisma/backfill-payroll-features.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const plans = await db.plan.findMany()
  for (const plan of plans) {
    const features = (plan.features ?? {}) as Record<string, boolean | undefined>
    if (features.payrollPerSession !== undefined && features.payrollHybrid !== undefined) {
      console.log(`Skipping ${plan.name} (already has payroll feature keys)`)
      continue
    }
    const isBasic = plan.tier === 'basic'
    const updated = {
      ...features,
      payrollPerSession: features.payrollPerSession ?? !isBasic,
      payrollHybrid: features.payrollHybrid ?? !isBasic,
    }
    await db.plan.update({ where: { id: plan.id }, data: { features: updated } })
    console.log(`Updated ${plan.name}: payrollPerSession=${updated.payrollPerSession}, payrollHybrid=${updated.payrollHybrid}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
