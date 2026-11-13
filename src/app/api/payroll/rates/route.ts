import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'

const ALLOWED_ROLES = ['admin', 'super_admin']

// GET /api/payroll/rates
//   Lists every TherapistRate (per-therapist custom rate) and
//   OrganizationDefaultRate row for the org — feeds both the Employee form's
//   "Session Rates" section and Settings → Payroll's org-default table.
export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const organizationId = user.organizationId
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId') || ''

    const [therapistRates, organizationDefaultRates] = await Promise.all([
      db.therapistRate.findMany({
        where: { organizationId, ...(employeeId ? { employeeId } : {}) },
        orderBy: { serviceType: 'asc' },
      }),
      db.organizationDefaultRate.findMany({
        where: { organizationId },
        orderBy: { serviceType: 'asc' },
      }),
    ])

    return NextResponse.json({ therapistRates, organizationDefaultRates })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/payroll/rates error:', error)
    return NextResponse.json({ error: 'Failed to fetch rates' }, { status: 500 })
  }
}

const VALID_RATE_TYPES = ['FIXED', 'PERCENTAGE']

// POST /api/payroll/rates
//   Body: { employeeId?, serviceType, rate, rateType?, packageId?, branchId?,
//           doctorId?, effectiveFrom?, effectiveTo? }
//   employeeId present -> upsert a TherapistRate (per-therapist custom rate).
//   employeeId absent   -> upsert an OrganizationDefaultRate (fallback tier).
//   "Upsert" here means: match an existing row with the SAME scoping
//   (packageId/branchId, both null by default = the plain/default rate for
//   that service) and update it; otherwise create a new row. This keeps the
//   common case (one plain rate per therapist+service, edited from the
//   Employee form / Settings UI) a simple update-in-place, while still
//   allowing additional package/branch-scoped or future-dated rows to be
//   created by passing those fields explicitly — see TherapistRate's schema
//   comment for the full scoping/effective-dating model.
export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const organizationId = user.organizationId
    const body = await request.json()
    const { employeeId, serviceType, rate, packageId, branchId, doctorId, effectiveTo } = body
    const effectiveFrom = body.effectiveFrom ? new Date(body.effectiveFrom) : new Date()

    if (!serviceType || typeof serviceType !== 'string') {
      return NextResponse.json({ error: 'serviceType is required' }, { status: 400 })
    }
    const numericRate = Number(rate)
    if (!Number.isFinite(numericRate) || numericRate < 0) {
      return NextResponse.json({ error: 'rate must be a non-negative number' }, { status: 400 })
    }
    const rateType = VALID_RATE_TYPES.includes(body.rateType) ? body.rateType : 'FIXED'
    if (rateType === 'PERCENTAGE' && numericRate > 100) {
      return NextResponse.json({ error: 'A percentage rate cannot exceed 100.' }, { status: 400 })
    }

    if (employeeId) {
      const employeeOwned = await db.employee.findFirst({ where: { id: employeeId, organizationId } })
      if (!employeeOwned) {
        return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
      }
      const existing = await db.therapistRate.findFirst({
        where: { organizationId, employeeId, serviceType, packageId: packageId || null, branchId: branchId || null },
      })
      const data = { rateType, rate: numericRate, doctorId: doctorId || null, effectiveFrom, effectiveTo: effectiveTo ? new Date(effectiveTo) : null }
      const row = existing
        ? await db.therapistRate.update({ where: { id: existing.id }, data })
        : await db.therapistRate.create({ data: { employeeId, serviceType, packageId: packageId || null, branchId: branchId || null, organizationId, ...data } })
      return NextResponse.json(row, { status: 201 })
    }

    const existing = await db.organizationDefaultRate.findFirst({
      where: { organizationId, serviceType, packageId: packageId || null, branchId: branchId || null },
    })
    const data = { rateType, rate: numericRate, effectiveFrom, effectiveTo: effectiveTo ? new Date(effectiveTo) : null }
    const row = existing
      ? await db.organizationDefaultRate.update({ where: { id: existing.id }, data })
      : await db.organizationDefaultRate.create({ data: { organizationId, serviceType, packageId: packageId || null, branchId: branchId || null, ...data } })
    return NextResponse.json(row, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/payroll/rates error:', error)
    return NextResponse.json({ error: 'Failed to save rate' }, { status: 500 })
  }
}

// DELETE /api/payroll/rates?id=<id>&type=therapist|org
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const organizationId = user.organizationId
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const type = searchParams.get('type') || 'therapist'
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    if (type === 'org') {
      const owned = await db.organizationDefaultRate.findFirst({ where: { id, organizationId } })
      if (!owned) return NextResponse.json({ error: 'Rate not found' }, { status: 404 })
      await db.organizationDefaultRate.delete({ where: { id } })
    } else {
      const owned = await db.therapistRate.findFirst({ where: { id, organizationId } })
      if (!owned) return NextResponse.json({ error: 'Rate not found' }, { status: 404 })
      await db.therapistRate.delete({ where: { id } })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('DELETE /api/payroll/rates error:', error)
    return NextResponse.json({ error: 'Failed to delete rate' }, { status: 500 })
  }
}
