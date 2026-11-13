import { NextRequest, NextResponse } from 'next/server'
import { platformDb } from '@/lib/platform-db'
import { requirePlatformAdmin } from '@/lib/platform-session'
import { invalidateSubscriptionCache } from '@/lib/subscription-limits'
import { hashPassword } from '@/lib/password'
import { encryptSecret } from '@/lib/secret-crypto'
import { randomBytes } from 'crypto'
import { isTherapistRole } from '@/lib/subscription-limits'

// PATCH /api/platform/organizations/[id] — one endpoint for all platform
// actions on an org, selected by `action`:
//   suspend | activate      → Organization.status + Subscription.status
//   markPaid                → Subscription.status='active', advances period
//   extendTrial             → push trialEndsAt by `days`
//   changePlan              → Subscription.planId = planId
//   resetAdminPassword      → new temp password for the org's super_admin
//   listAdminCandidates     → users that could be made Org Admin (repair)
//   restoreOrgAdmin         → make a user Org Admin when none is left
// Every action writes an ActionLog row — platform actions on a clinic's
// account must never be silent (children's health data).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePlatformAdmin(request)
    const { id } = await params
    const body = await request.json()
    const { action } = body

    const org = await platformDb.organization.findUnique({
      where: { id },
      include: { subscription: true },
    })
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

    const log = async (actionType: string, notes: string) => {
      await platformDb.actionLog.create({
        data: {
          module: 'platform', actionType, recordId: id, notes,
          performedBy: admin.id,
          performedByName: `Platform Admin: ${admin.name} <${admin.email}>`,
          userRole: 'platform_admin',
          organizationId: id,
        },
      })
    }

    if (action === 'suspend' || action === 'activate') {
      const status = action === 'suspend' ? 'suspended' : 'active'
      await platformDb.organization.update({ where: { id }, data: { status } })
      if (org.subscription) {
        const subData: { status: string; billingCycle?: string; currentPeriodStart?: Date; currentPeriodEnd?: Date; trialEndsAt?: null } = {
          status: action === 'suspend' ? 'suspended' : 'active',
        }
        // Activating carries a billing cycle (Monthly/Yearly, chosen in the
        // popup) — extends the paid period the same way markPaid does, so
        // reactivating a suspended clinic doesn't leave it instantly "past
        // due" again on a stale currentPeriodEnd.
        if (action === 'activate' && (body.billingCycle === 'monthly' || body.billingCycle === 'yearly')) {
          const cycle = body.billingCycle as 'monthly' | 'yearly'
          const months = cycle === 'yearly' ? 12 : 1
          const now = new Date()
          const base = org.subscription.currentPeriodEnd && org.subscription.currentPeriodEnd > now
            ? org.subscription.currentPeriodEnd
            : now
          const end = new Date(base)
          end.setMonth(end.getMonth() + months)
          subData.billingCycle = cycle
          subData.currentPeriodStart = now
          subData.currentPeriodEnd = end
          subData.trialEndsAt = null
        }
        await platformDb.subscription.update({ where: { organizationId: id }, data: subData })
      }
      await log(`org_${action}d`, `Organization ${action}d${body.billingCycle ? ` (${body.billingCycle} billing)` : ''}`)
      invalidateSubscriptionCache(id)
      return NextResponse.json({ ok: true, status })
    }

    if (action === 'markPaid') {
      if (!org.subscription) return NextResponse.json({ error: 'No subscription on this organization' }, { status: 400 })
      const cycle: 'monthly' | 'yearly' = body.billingCycle === 'yearly' ? 'yearly' : 'monthly'
      const months = cycle === 'yearly' ? 12 : Number(body.months ?? 1)
      const now = new Date()
      const base = org.subscription.currentPeriodEnd && org.subscription.currentPeriodEnd > now
        ? org.subscription.currentPeriodEnd
        : now
      const end = new Date(base)
      end.setMonth(end.getMonth() + months)
      await platformDb.subscription.update({
        where: { organizationId: id },
        data: { status: 'active', billingCycle: cycle, currentPeriodStart: now, currentPeriodEnd: end, trialEndsAt: null },
      })
      await log('subscription_mark_paid', `Marked paid (${cycle}) for ${months} month(s), period ends ${end.toISOString().slice(0, 10)} (payment collected outside the system)`)
      invalidateSubscriptionCache(id)
      return NextResponse.json({ ok: true, currentPeriodEnd: end })
    }

    if (action === 'extendTrial') {
      if (!org.subscription) return NextResponse.json({ error: 'No subscription on this organization' }, { status: 400 })
      const days = Number(body.days ?? 7)
      const base = org.subscription.trialEndsAt && org.subscription.trialEndsAt > new Date()
        ? org.subscription.trialEndsAt
        : new Date()
      const newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
      await platformDb.subscription.update({
        where: { organizationId: id },
        data: { status: 'trialing', trialEndsAt: newEnd },
      })
      await log('trial_extended', `Trial extended by ${days} day(s) to ${newEnd.toISOString().slice(0, 10)}`)
      invalidateSubscriptionCache(id)
      return NextResponse.json({ ok: true, trialEndsAt: newEnd })
    }

    if (action === 'changePlan') {
      const { planId } = body
      if (!planId) return NextResponse.json({ error: 'planId required' }, { status: 400 })
      const plan = await platformDb.plan.findUnique({ where: { id: planId } })
      if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
      if (org.subscription) {
        await platformDb.subscription.update({ where: { organizationId: id }, data: { planId } })
      } else {
        await platformDb.subscription.create({
          data: { organizationId: id, planId, status: 'active', currentPeriodStart: new Date() },
        })
      }
      await log('plan_changed', `Plan changed to ${plan.name}`)
      invalidateSubscriptionCache(id)
      return NextResponse.json({ ok: true, plan: plan.name })
    }

    // customizePlan — clones the org's CURRENT plan into a new plan row
    // scoped to this org alone (name "Custom — <clinic>", tier "custom",
    // isActive=false so it never appears on the public pricing page) and
    // points the subscription at it. Editing that clone (Plans tab) only
    // ever affects this one clinic — unlike editing a shared plan, which
    // would move every other org on that plan too.
    if (action === 'customizePlan') {
      const basePlan = org.subscription
        ? await platformDb.plan.findUnique({ where: { id: org.subscription.planId } })
        : await platformDb.plan.findFirst({ where: { isActive: true }, orderBy: { priceMonthly: 'asc' } })
      if (!basePlan) return NextResponse.json({ error: 'No plan available to clone — create a base plan first' }, { status: 400 })

      const customPlan = await platformDb.plan.create({
        data: {
          name: `Custom — ${org.name}`,
          tier: 'custom',
          therapistLimit: basePlan.therapistLimit,
          branchLimit: basePlan.branchLimit,
          userLimit: basePlan.userLimit,
          storageLimitMB: basePlan.storageLimitMB,
          priceMonthly: basePlan.priceMonthly,
          priceYearly: basePlan.priceYearly,
          features: basePlan.features ?? {},
          isActive: false,
        },
      })
      if (org.subscription) {
        await platformDb.subscription.update({ where: { organizationId: id }, data: { planId: customPlan.id } })
      } else {
        await platformDb.subscription.create({
          data: { organizationId: id, planId: customPlan.id, status: 'active', currentPeriodStart: new Date() },
        })
      }
      await log('plan_customized', `Cloned "${basePlan.name}" into a dedicated custom plan for this clinic`)
      invalidateSubscriptionCache(id)
      return NextResponse.json({ ok: true, plan: customPlan })
    }

    if (action === 'resetAdminPassword') {
      const orgAdmin = await platformDb.user.findFirst({
        where: { organizationId: id, role: 'super_admin', isActive: true },
        orderBy: { createdAt: 'asc' },
      })
      if (!orgAdmin) return NextResponse.json({ error: 'No active Org Admin found' }, { status: 404 })
      const tempPassword = randomBytes(9).toString('base64url')
      await platformDb.user.update({
        where: { id: orgAdmin.id },
        data: { password: await hashPassword(tempPassword), generatedPasswordEnc: encryptSecret(tempPassword) },
      })
      await log('org_admin_password_reset', `Password reset for Org Admin ${orgAdmin.email}`)
      return NextResponse.json({ ok: true, email: orgAdmin.email, temporaryPassword: tempPassword })
    }

    // ── Repair: a clinic left with no Org Admin ──
    // Possible when the only super_admin had its role changed or was
    // deactivated (the tenant API now blocks that, but existing clinics can
    // already be in this state). Without an Org Admin nobody can reach
    // Settings/staff/billing and "Login as" fails, and a tenant admin can't
    // fix it because super_admin isn't an assignable role inside the app.
    if (action === 'listAdminCandidates') {
      const users = await platformDb.user.findMany({
        where: { organizationId: id, role: { not: 'parent' } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      })
      const hasActiveAdmin = users.some((u) => u.role === 'super_admin' && u.isActive)
      return NextResponse.json({ users, hasActiveAdmin })
    }

    if (action === 'restoreOrgAdmin') {
      const userId = typeof body.userId === 'string' ? body.userId : ''
      if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

      // Only a repair, never a way to mint extra admins: refuse while the
      // clinic still has a working Org Admin.
      const existingAdmin = await platformDb.user.findFirst({
        where: { organizationId: id, role: 'super_admin', isActive: true },
        select: { email: true },
      })
      if (existingAdmin) {
        return NextResponse.json(
          { error: `This clinic already has an active Org Admin (${existingAdmin.email}).` },
          { status: 409 }
        )
      }

      const target = await platformDb.user.findFirst({ where: { id: userId, organizationId: id } })
      if (!target) return NextResponse.json({ error: 'User not found in this organization' }, { status: 404 })
      if (target.role === 'parent') {
        return NextResponse.json({ error: 'A parent account cannot be made Org Admin' }, { status: 400 })
      }

      // Their old role often describes the job they actually do (e.g. a
      // physiotherapist who also owns the clinic) — keep them in the
      // therapist lists instead of silently dropping that. Defaults on for
      // any non-admin previous role; the caller can override.
      const wasTherapist = isTherapistRole(target.role) ||
        !['super_admin', 'admin', 'receptionist'].includes(target.role)
      const keptTherapyRole = typeof body.takesSessions === 'boolean'
        ? body.takesSessions
        : (wasTherapist || target.takesSessions)
      await platformDb.user.update({
        where: { id: userId },
        data: {
          role: 'super_admin',
          isActive: true,
          takesSessions: keptTherapyRole,
          ...(keptTherapyRole && typeof body.therapyType === 'string' && body.therapyType.trim()
            ? { therapyType: body.therapyType.trim() }
            : {}),
        },
      })
      await log(
        'org_admin_restored',
        `${target.email} (was "${target.role}"${target.isActive ? '' : ', inactive'}) made Org Admin — clinic had no active Org Admin`
      )
      return NextResponse.json({ ok: true, email: target.email, previousRole: target.role, takesSessions: keptTherapyRole })
    }

    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('PATCH /api/platform/organizations/[id] error:', error)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}

// DELETE /api/platform/organizations/[id] — PERMANENTLY removes an
// organization and EVERY row it owns (patients, invoices, sessions, staff,
// document metadata — everything). There is no undo. Two safeguards:
//   1. body.confirmName must exactly match the organization's name;
//   2. every deletion runs in one transaction — a failure rolls back fully.
// Child tables are cleared before their parents (FK-safe order).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePlatformAdmin(request)
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const org = await platformDb.organization.findUnique({ where: { id } })
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

    // Both sides trimmed: names created before trimming was added can carry a
    // trailing space that the admin can't see and so can never type.
    if (!body.confirmName || String(body.confirmName).trim() !== org.name.trim()) {
      return NextResponse.json(
        { error: `Type the exact clinic name ("${org.name.trim()}") to confirm deletion` },
        { status: 400 }
      )
    }

    console.info(`ORG DELETE started by platform admin ${admin.email}: "${org.name}" (${id})`)

    await platformDb.$transaction(async (tx) => {
      const where = { organizationId: id }
      // deepest children first
      await tx.activityLog.deleteMany({ where })
      await tx.notification.deleteMany({ where })
      await tx.actionLog.deleteMany({ where })
      await tx.whatsAppLog.deleteMany({ where })
      await tx.payment.deleteMany({ where })
      await tx.invoiceItem.deleteMany({ where })
      await tx.invoice.deleteMany({ where })
      await tx.patientPackageTherapyType.deleteMany({ where })
      await tx.therapySession.deleteMany({ where })
      await tx.patientPackage.deleteMany({ where })
      await tx.packageTherapyType.deleteMany({ where })
      await tx.package.deleteMany({ where })
      await tx.assessment.deleteMany({ where })
      await tx.appointment.deleteMany({ where })
      await tx.employeeDocument.deleteMany({ where })
      await tx.attendance.deleteMany({ where })
      await tx.leave.deleteMany({ where })
      await tx.payrollRecord.deleteMany({ where })
      // Also hold a foreign key to Organization — left out, they made any
      // clinic with therapist rates/earnings undeletable.
      await tx.therapistEarning.deleteMany({ where })
      await tx.therapistRate.deleteMany({ where })
      await tx.organizationDefaultRate.deleteMany({ where })
      await tx.leavePolicy.deleteMany({ where })
      await tx.expense.deleteMany({ where })
      await tx.lead.deleteMany({ where })
      await tx.service.deleteMany({ where })
      await tx.employee.deleteMany({ where })
      await tx.patient.deleteMany({ where })
      await tx.user.deleteMany({ where })
      await tx.role.deleteMany({ where })
      await tx.systemConfig.deleteMany({ where })
      await tx.centerSettings.deleteMany({ where })
      await tx.branch.deleteMany({ where })
      await tx.subscription.deleteMany({ where })
      await tx.organization.delete({ where: { id } })
    }, { timeout: 60_000 })

    console.info(`ORG DELETE completed: "${org.name}" (${id})`)
    return NextResponse.json({ ok: true, deleted: org.name })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('DELETE /api/platform/organizations/[id] error:', error)
    return NextResponse.json({ error: 'Deletion failed — nothing was removed (transaction rolled back)' }, { status: 500 })
  }
}
