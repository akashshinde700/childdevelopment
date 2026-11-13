/**
 * Seed the 6 standard therapy packages shown on the clinic's package card
 * reference design (Image 1).
 *
 *   Single Session      →  1 session   @ Rs.1000/session  = Rs.1,000
 *   Basic Plan          →  4 sessions  @ Rs.950/session   = Rs.3,800
 *   Introductory Plan   →  8 sessions  @ Rs.900/session   = Rs.7,200
 *   Foundation Plan     → 12 sessions  @ Rs.800/session   = Rs.9,600
 *   Progress Plan       → 24 sessions  @ Rs.750/session   = Rs.18,000
 *   Advantage Plan      → 48 sessions  @ Rs.700/session   = Rs.33,600
 *
 * Per-session price decreases as the session count increases (volume discount
 * tier) — matching the clinic's reference design (Image 2). All packages use
 * a 45-minute session duration.
 *
 * The script is IDEMPOTENT: it upserts by `name` and deactivates any legacy
 * packages that are NOT in the standard list so the Assign Package dialog
 * shows exactly the 6 reference cards.
 *
 * Run with:  bun run prisma/seed-standard-packages.ts
 */
import { db } from '../src/lib/db'

const STANDARD_PACKAGES = [
  {
    name: 'Single Session',
    therapyType: 'Speech Therapy',
    sessionCount: 1,
    sessionDuration: 45,
    amount: 1000,
    discount: 0,
    validityDays: 30,
  },
  {
    name: 'Basic Plan',
    therapyType: 'Speech Therapy',
    sessionCount: 4,
    sessionDuration: 45,
    amount: 3800,
    discount: 0,
    validityDays: 45,
  },
  {
    name: 'Introductory Plan',
    therapyType: 'Occupational Therapy',
    sessionCount: 8,
    sessionDuration: 45,
    amount: 7200,
    discount: 0,
    validityDays: 60,
  },
  {
    name: 'Foundation Plan',
    therapyType: 'Behavioral Therapy',
    sessionCount: 12,
    sessionDuration: 45,
    amount: 9600,
    discount: 0,
    validityDays: 90,
  },
  {
    name: 'Progress Plan',
    therapyType: 'Speech Therapy',
    sessionCount: 24,
    sessionDuration: 45,
    amount: 18000,
    discount: 0,
    validityDays: 120,
  },
  {
    name: 'Advantage Plan',
    therapyType: 'Comprehensive',
    sessionCount: 48,
    sessionDuration: 45,
    amount: 33600,
    discount: 0,
    validityDays: 180,
  },
] as const

const STANDARD_NAMES = STANDARD_PACKAGES.map((p) => p.name)

async function main() {
  console.log('Seeding standard packages...')

  // 1. Upsert each standard package (match by name).
  for (const pkg of STANDARD_PACKAGES) {
    const existing = await db.package.findFirst({ where: { name: pkg.name } })
    if (existing) {
      await db.package.update({
        where: { id: existing.id },
        data: {
          therapyType: pkg.therapyType,
          sessionCount: pkg.sessionCount,
          sessionDuration: pkg.sessionDuration,
          amount: pkg.amount,
          discount: pkg.discount,
          validityDays: pkg.validityDays,
          isActive: true,
        },
      })
      console.log(`  ✓ Updated: ${pkg.name} (${pkg.sessionCount} sessions, ₹${pkg.amount})`)
    } else {
      await db.package.create({ data: { ...pkg, isActive: true } })
      console.log(`  ✓ Created: ${pkg.name} (${pkg.sessionCount} sessions, ₹${pkg.amount})`)
    }
  }

  // 2. Deactivate any legacy packages not in the standard list so the Assign
  //    Package dialog shows exactly the 6 reference cards. Existing
  //    PatientPackage assignments are unaffected (they reference their own
  //    snapshot of the data).
  const legacy = await db.package.findMany({
    where: { name: { notIn: STANDARD_NAMES } },
    select: { id: true, name: true },
  })
  for (const l of legacy) {
    await db.package.update({ where: { id: l.id }, data: { isActive: false } })
    console.log(`  ↺ Deactivated legacy: ${l.name}`)
  }

  // 3. Summary
  const active = await db.package.findMany({
    where: { isActive: true },
    orderBy: { sessionCount: 'asc' },
    select: { name: true, sessionCount: true, amount: true, therapyType: true },
  })
  console.log('\nActive packages now in DB:')
  for (const p of active) {
    const per = p.sessionCount > 0 ? Math.round(p.amount / p.sessionCount) : 0
    console.log(`  ${p.name.padEnd(20)} ${String(p.sessionCount).padStart(2)} sessions  ₹${p.amount}  (₹${per}/session)  ${p.therapyType}`)
  }
  console.log(`\nDone. ${active.length} active packages.`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
