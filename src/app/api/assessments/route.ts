import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { notifyPatientParent } from '@/lib/notifications'
import { accrueOnCompletion, reverseOnUncompletion, PayrollLockedError } from '@/lib/payroll-accrual'
import { ASSESSMENT_SERVICE_TYPE } from '@/lib/therapy-types'

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const { searchParams } = new URL(request.url)
    const patientId = searchParams.get('patientId') || ''
    const type = searchParams.get('type') || ''
    const status = searchParams.get('status') || ''
    const search = searchParams.get('search') || ''
    const startDate = searchParams.get('startDate') || searchParams.get('fromDate') || ''
    const endDate = searchParams.get('endDate') || searchParams.get('toDate') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '500')

    const where: Record<string, unknown> = { organizationId }
    if (patientId) where.patientId = patientId
    if (type) where.type = type
    if (status) where.status = status
    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {}
      if (startDate) dateFilter.gte = new Date(startDate + 'T00:00:00.000Z')
      if (endDate) dateFilter.lte = new Date(endDate + 'T23:59:59.999Z')
      where.scheduledDate = dateFilter
    }
    if (search) {
      where.OR = [
        { patient: { childName: { contains: search } } },
        { patient: { patientId: { contains: search } } },
        { notes: { contains: search } },
        { findings: { contains: search } },
      ]
    }

    // Therapists can only see their own assessments
    if (user.role.startsWith('therapist') || user.role === 'psychologist') {
      where.therapistName = user.name
    }

    // Parents only see their own child's assessment findings/recommendations.
    if (user.role === 'parent') {
      where.patientId = user.patientId || '__none__'
    }

    const [assessments, total] = await Promise.all([
      db.assessment.findMany({
        where,
        include: { patient: { select: { childName: true, patientId: true, mobile: true, gender: true, dateOfBirth: true } } },
        orderBy: { scheduledDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.assessment.count({ where }),
    ])

    return NextResponse.json({ assessments, total, page, limit })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch assessments' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    // Only admin/super_admin can schedule assessments
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden — only administrators can schedule assessments' }, { status: 403 })
    }
    const body = await request.json()

    // Historical data entry (migration mode): only allow when the center
    // setting `allowHistoricalEntry` is enabled by an admin.
    if (body.isHistorical === true) {
      const settings = await db.centerSettings.findFirst({ where: { organizationId } })
      if (!settings?.allowHistoricalEntry) {
        return NextResponse.json(
          { error: 'Historical data entry is disabled. Enable "Allow Historical Entry" in Center Settings first.' },
          { status: 403 }
        )
      }
    }

    // Status is auto-set to 'scheduled' — never accept status from the client
    const assessment = await db.assessment.create({
      data: {
        patientId: body.patientId,
        type: body.type,
        scheduledDate: new Date(body.scheduledDate),
        scheduledTime: body.scheduledTime || null,
        status: 'scheduled',
        therapistName: body.therapistName || null,
        reason: body.reason || null,
        instructions: body.instructions || null,
        scheduledBy: user.name,
        findings: body.findings || null,
        recommendations: body.recommendations || null,
        reportUrl: body.reportUrl || null,
        notes: body.notes || null,
        // Historical data entry audit fields
        isHistorical: body.isHistorical === true,
        enteredBy: body.isHistorical === true ? (body.enteredBy || user.name || null) : null,
        enteredDate: body.isHistorical === true ? new Date() : null,
        organizationId,
      },
    })
    return NextResponse.json(assessment, { status: 201 })
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error)
    if (errMessage === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Assessment create error:', error)
    return NextResponse.json({ error: 'Failed to create assessment', detail: errMessage }, { status: 500 })
  }
}

// Fields a therapist is allowed to update (assessment form fields + status draft/completed)
const THERAPIST_ALLOWED_FIELDS = [
  'diagnosis', 'history', 'findings', 'observations', 'therapistNotes',
  'treatmentPlan', 'goals', 'recommendation',
  'nextAssessmentDate', 'attachments', 'status',
]

// Fields only admin can update
const ADMIN_ALLOWED_FIELDS = [
  'patientId', 'type', 'scheduledDate', 'scheduledTime', 'therapistName',
  'reason', 'instructions', 'notes', 'reportUrl', 'recommendations', 'status',
]

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (!['admin', 'super_admin', 'therapist_speech', 'therapist_ot', 'therapist_behavioral', 'therapist_remedial', 'psychologist'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = await request.json()
    const { id, ...data } = body
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const existing = await db.assessment.findFirst({ where: { id, organizationId } })
    if (!existing) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
    }

    const isTherapist = user.role.startsWith('therapist') || user.role === 'psychologist'
    const isAdmin = user.role === 'admin' || user.role === 'super_admin'

    // Therapist permission checks:
    // - Cannot modify a completed assessment (only admin can reopen)
    // - Cannot change patient or assigned therapist
    if (isTherapist) {
      if (existing.status === 'completed' && data.status !== 'draft') {
        return NextResponse.json({ error: 'Completed assessments cannot be modified. Contact an administrator to reopen.' }, { status: 403 })
      }
      if (data.patientId && data.patientId !== existing.patientId) {
        return NextResponse.json({ error: 'Cannot change the assigned patient' }, { status: 403 })
      }
      if (data.therapistName && data.therapistName !== existing.therapistName) {
        return NextResponse.json({ error: 'Cannot change the assigned therapist' }, { status: 403 })
      }
    }

    // Build update data based on role
    const updateData: Record<string, unknown> = {}
    const allowedFields = isTherapist ? THERAPIST_ALLOWED_FIELDS : ADMIN_ALLOWED_FIELDS
    for (const field of allowedFields) {
      if (field in data) {
        updateData[field] = data[field]
      }
    }

    // Parse dates
    if (updateData.scheduledDate) updateData.scheduledDate = new Date(updateData.scheduledDate as string)
    if (updateData.nextAssessmentDate) updateData.nextAssessmentDate = new Date(updateData.nextAssessmentDate as string)
    else if (updateData.nextAssessmentDate === null) updateData.nextAssessmentDate = null

    // Handle status transitions
    const newStatus = updateData.status as string | undefined
    if (newStatus === 'completed') {
      updateData.completedDate = new Date()
      updateData.completedAt = new Date()
      if (isTherapist) updateData.completedBy = user.name
    } else if (newStatus === 'draft') {
      // Draft — clear any previous completion data
      updateData.completedDate = null
      updateData.completedAt = null
    } else if (newStatus === 'scheduled' && existing.status === 'completed') {
      // Admin reopening a completed assessment
      updateData.completedDate = null
      updateData.completedAt = null
      updateData.completedBy = null
    }

    const assessment = await db.$transaction(async (tx) => {
      // ── Payroll lock check ──
      // Reopening a completed assessment must be blocked if its earning has
      // already been folded into a generated payroll.
      if (newStatus !== 'completed' && existing.status === 'completed') {
        await reverseOnUncompletion(tx, 'assessment', id)
      }

      const updated = await tx.assessment.update({
        where: { id },
        data: updateData as Prisma.AssessmentUpdateInput,
      })

      // ── Payroll accrual ──
      // Assessments have no package/patientPackage link (no PERCENTAGE-mode
      // base amount is resolvable for them — see resolveBaseAmount), only a
      // branch, via the patient's registered branch.
      if (newStatus === 'completed') {
        const patient = await tx.patient.findFirst({ where: { id: updated.patientId, organizationId }, select: { branchId: true } })
        await accrueOnCompletion(tx, {
          organizationId,
          therapistName: updated.therapistName,
          sourceType: 'assessment',
          sourceId: updated.id,
          serviceType: ASSESSMENT_SERVICE_TYPE,
          sessionDate: updated.completedDate ?? updated.scheduledDate,
          branchId: patient?.branchId ?? null,
        })
      }

      return updated
    })

    if (newStatus === 'completed' && existing.status !== 'completed') {
      await notifyPatientParent(organizationId ?? null, assessment.patientId, {
        type: 'assessment',
        title: 'Assessment Completed',
        message: `The ${assessment.type || 'therapy'} assessment has been completed.`,
        link: 'parent-assessments',
      })
    }

    return NextResponse.json(assessment)
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof PayrollLockedError) {
      return NextResponse.json({ error: error.message }, { status: 423 })
    }
    console.error('Assessment update error:', error)
    return NextResponse.json({ error: 'Failed to update assessment' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden — only administrators can delete assessments' }, { status: 403 })
    }
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
    const existing = await db.assessment.findFirst({ where: { id, organizationId } })
    if (!existing) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
    }
    await db.assessment.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to delete assessment' }, { status: 500 })
  }
}
