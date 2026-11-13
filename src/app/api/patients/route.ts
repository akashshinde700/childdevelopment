import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { syncAllPatientStatuses } from '@/lib/patient-status'
import { reconcileAllPackageUsage } from '@/lib/package-usage'
import fs from 'fs'
import path from 'path'

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads')

// file.name comes straight from the multipart body, so it can carry path
// separators or '..' — keep only a flat "<timestamp>-<name><ext>" that
// /api/uploads/[filename] will also accept.
function safeUploadName(original: string) {
  const ext = path.extname(original).toLowerCase().replace(/[^a-z0-9.]/g, '')
  const base = path.basename(original, path.extname(original)).replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 80)
  return `${Date.now()}-${base || 'file'}${ext}`
}

// GET /api/patients
export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const fromDate = searchParams.get('fromDate') || ''
    const toDate = searchParams.get('toDate') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    // Self-heal Active/Inactive before querying, so a package that quietly
    // expired is reflected immediately (see src/lib/patient-status.ts).
    await reconcileAllPackageUsage()
    await syncAllPatientStatuses()

    const where: Record<string, unknown> = { isDeleted: false, organizationId }
    if (search) {
      where.OR = [
        { childName: { contains: search } },
        { patientId: { contains: search } },
        { mobile: { contains: search } },
        { fatherName: { contains: search } },
        { motherName: { contains: search } },
      ]
    }
    if (status) where.status = status
    if (fromDate || toDate) {
      const dateFilter: Record<string, Date> = {}
      if (fromDate) dateFilter.gte = new Date(`${fromDate}T00:00:00.000Z`)
      if (toDate) dateFilter.lte = new Date(`${toDate}T23:59:59.999Z`)
      where.registrationDate = dateFilter
    }

    if (user.role === 'parent') {
      // Parents can only see their own linked child
      if (user.patientId) {
        where.id = user.patientId
      } else {
        return NextResponse.json({ patients: [], total: 0, page, limit })
      }
    } else if (user.role.startsWith('therapist')) {
      const assignedPatients = await db.appointment.findMany({
        where: { therapistId: user.name, organizationId },
        select: { patientId: true },
      })
      const patientIds = [...new Set(assignedPatients.map((record) => record.patientId))]
      if (!patientIds.length) {
        return NextResponse.json({ patients: [], total: 0, page, limit })
      }
      where.id = { in: patientIds }
    }

    const [patients, total] = await Promise.all([
      db.patient.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.patient.count({ where }),
    ])

    // Per-patient invoice summary for the current page only — lets the list
    // show outstanding balance directly instead of a per-row API call.
    const patientIds = patients.map((p) => p.id)
    const invoiceSummaryByPatient = new Map<string, { totalAmount: number; amountPaid: number; count: number }>()
    if (patientIds.length > 0) {
      const invoices = await db.invoice.findMany({
        where: { patientId: { in: patientIds }, status: { not: 'cancelled' }, organizationId },
        select: { patientId: true, totalAmount: true, amountPaid: true },
      })
      for (const inv of invoices) {
        const entry = invoiceSummaryByPatient.get(inv.patientId) || { totalAmount: 0, amountPaid: 0, count: 0 }
        entry.totalAmount += inv.totalAmount
        entry.amountPaid += inv.amountPaid
        entry.count += 1
        invoiceSummaryByPatient.set(inv.patientId, entry)
      }
    }
    const patientsWithInvoiceSummary = patients.map((p) => {
      const summary = invoiceSummaryByPatient.get(p.id)
      return {
        ...p,
        invoiceSummary: {
          count: summary?.count || 0,
          totalAmount: summary?.totalAmount || 0,
          amountPaid: summary?.amountPaid || 0,
          balanceDue: Math.max(0, (summary?.totalAmount || 0) - (summary?.amountPaid || 0)),
        },
      }
    })

    return NextResponse.json({ patients: patientsWithInvoiceSummary, total, page, limit })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Patient fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch patients' }, { status: 500 })
  }
}

// POST /api/patients
// Supports BOTH `application/json` (used by the Import dialog / bulk import)
// and `multipart/form-data` (used by the regular patient form with file uploads).
export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden: only Super Admin and Admin can create patients.' },
        { status: 403 }
      )
    }

    const contentType = request.headers.get('content-type') || ''

    // Parsed body fields — populated from either JSON or FormData.
    let body: Record<string, unknown> = {}
    let photoFile: File | null = null
    let diagnosisReportFile: File | null = null

    if (contentType.includes('application/json')) {
      // JSON request — typically from the Import dialog (no file uploads).
      const jsonBody = await request.json().catch(() => null)
      if (!jsonBody || typeof jsonBody !== 'object' || Array.isArray(jsonBody)) {
        return NextResponse.json(
          { error: 'Invalid JSON request body.' },
          { status: 400 }
        )
      }
      body = jsonBody as Record<string, unknown>
    } else {
      // FormData request — typically from the regular patient form (may include files).
      const formData = await request.formData()
      body = Object.fromEntries(formData.entries())
      photoFile = formData.get('photo') as File | null
      // `diagnosisReport` is the uploaded diagnosis-report FILE (PDF/image).
      // `diagnosis` is the TEXT diagnosis (e.g. "Autism") — kept separate so
      // imports don't pollute the file-path field.
      diagnosisReportFile = formData.get('diagnosisReport') as File | null
    }

    // ── Validate mandatory fields ───────────────────────────────────────────
    const strVal = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    if (!strVal(body.childName)) {
      return NextResponse.json({ error: 'Patient Name is required' }, { status: 400 })
    }
    if (!strVal(body.mobile)) {
      return NextResponse.json({ error: 'Mobile Number is required' }, { status: 400 })
    }
    if (!strVal(body.dateOfBirth)) {
      return NextResponse.json({ error: 'Date of Birth is required' }, { status: 400 })
    }
    if (!strVal(body.gender)) {
      return NextResponse.json({ error: 'Gender is required' }, { status: 400 })
    }

    // ── Validate Date of Birth parses to a real date ────────────────────────
    const dobStr = strVal(body.dateOfBirth)
    const dobDate = new Date(dobStr)
    if (isNaN(dobDate.getTime())) {
      return NextResponse.json(
        { error: `Invalid Date of Birth value: "${dobStr}". Expected a valid date (e.g. 2020-01-15).` },
        { status: 400 }
      )
    }

    // ── Validate file types and sizes (FormData path only) ──────────────────
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf']
    const maxSizeBytes = 10 * 1024 * 1024 // 10MB

    const validateFile = (file: File) => {
      const fileName = file.name.toLowerCase()
      const ext = fileName.substring(fileName.lastIndexOf('.'))
      if (!allowedExtensions.includes(ext)) {
        return `Invalid file type '${file.name}'. Only PDF, JPG, JPEG, PNG, GIF, and WEBP files are allowed.`
      }
      if (file.size > maxSizeBytes) {
        return `File '${file.name}' exceeds the maximum allowed size of 10MB.`
      }
      return null
    }

    if (photoFile && photoFile.size > 0) {
      const error = validateFile(photoFile)
      if (error) return NextResponse.json({ error }, { status: 400 })
    }
    if (diagnosisReportFile && diagnosisReportFile.size > 0) {
      const error = validateFile(diagnosisReportFile)
      if (error) return NextResponse.json({ error }, { status: 400 })
    }

    // ── Validate Aadhaar number (12 digits) if provided ─────────────────────
    const aadhaarVal = strVal(body.aadhaar) || null
    if (aadhaarVal && !/^\d{12}$/.test(aadhaarVal)) {
      return NextResponse.json(
        { error: 'Aadhaar number must be 12 digits.' },
        { status: 400 }
      )
    }

    // ── Save uploaded files (FormData path only) ────────────────────────────
    let photoPath: string | null = null
    let diagnosisReportPath: string | null = null

    const saveFile = async (file: File) => {
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      const fileName = safeUploadName(file.name)
      const filePath = `/uploads/${fileName}`
      const fullPath = path.join(UPLOADS_DIR, fileName)

      if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true })
      }
      fs.writeFileSync(fullPath, buffer)
      return filePath
    }

    if (photoFile && photoFile.size > 0) photoPath = await saveFile(photoFile)
    if (diagnosisReportFile && diagnosisReportFile.size > 0) diagnosisReportPath = await saveFile(diagnosisReportFile)

    // ── Generate the next patient ID ────────────────────────────────────────
    const lastPatient = await db.patient.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { patientId: true },
    })

    let nextNum = 1
    if (lastPatient?.patientId) {
      const num = parseInt(lastPatient.patientId.replace('CM-', ''))
      if (!isNaN(num)) nextNum = num + 1
    }

    // ── Build the create payload ────────────────────────────────────────────
    // `diagnosis`       = TEXT diagnosis (e.g. "Autism") — from form or Excel import.
    // `diagnosisReport` = uploaded diagnosis-report FILE PATH (or null).
    // These are separate fields so Excel imports (which set `diagnosis` as
    // text) never produce a broken "View File" link in the UI.
    const diagnosisText = strVal(body.diagnosis) || null

    const patient = await db.patient.create({
      data: {
        patientId: `CM-${String(nextNum).padStart(4, '0')}`,

        childName: strVal(body.childName),
        gender: strVal(body.gender),
        dateOfBirth: dobDate,

        fatherName: strVal(body.fatherName) || null,
        motherName: strVal(body.motherName) || null,
        parentName: strVal(body.parentName) || null,
        mobile: strVal(body.mobile),
        alternateNumber: strVal(body.alternateNumber) || null,
        email: strVal(body.email) || null,
        address: strVal(body.address) || null,
        city: strVal(body.city) || null,
        state: strVal(body.state) || null,
        pincode: strVal(body.pincode) || null,
        schoolName: strVal(body.schoolName) || null,
        class: strVal(body.class) || null,
        referredBy: strVal(body.referredBy) || null,
        diagnosis: diagnosisText,
        diagnosisReport: diagnosisReportPath,

        medicalHistory: strVal(body.medicalHistory) || null,
        birthHistory: strVal(body.birthHistory) || null,

        photo: photoPath,
        aadhaar: aadhaarVal,
        organizationId,
      },
    })

    return NextResponse.json(patient, { status: 201 })
  } catch (error) {
    // Capture and return the ACTUAL backend error so the import dialog can
    // surface it (e.g. "Mobile already exists", "Unique constraint failed",
    // "Invalid date"). Previously this returned a generic
    // "Failed to create patient" which hid the real cause.
    const errMessage = error instanceof Error ? error.message : String(error)
    console.error('Patient create error:', error)

    // Map well-known Prisma / database errors to user-friendly messages.
    let userFacingError = errMessage
    let status = 500

    if (errMessage.includes('Unique constraint failed')) {
      // Prisma unique-constraint violation — try to identify the field.
      const fieldMatch = errMessage.match(/Fields: \((.+?)\)/)
      const field = fieldMatch?.[1] || 'mobile'
      userFacingError = `A patient with this ${field} already exists. Please use a different value or update the existing record.`
      status = 409
    } else if (errMessage.includes('Argument') && errMessage.includes('is missing')) {
      userFacingError = errMessage.replace(/\n/g, ' ').trim()
      status = 400
    } else if (
      errMessage.includes('Invalid value for argument') ||
      errMessage.includes('expected') ||
      errMessage.includes('cannot be cast')
    ) {
      userFacingError = `Invalid data: ${errMessage.replace(/\n/g, ' ').trim()}`
      status = 400
    } else if (errMessage === 'Unauthorized') {
      userFacingError = 'Unauthorized'
      status = 401
    }

    return NextResponse.json(
      {
        error: userFacingError,
        detail: errMessage,
        status,
      },
      { status }
    )
  }
}

// PUT /api/patients
export async function PUT(request: NextRequest) {
      try {
        const user = await requireSessionUser(request)
        const organizationId = user.organizationId
        if (user.role !== 'super_admin' && user.role !== 'admin') {
          return NextResponse.json(
            { error: 'Forbidden: only Super Admin and Admin can edit patients.' },
            { status: 403 }
          )
        }
        // Support both JSON (for document field updates like clearing photo/aadhaar/diagnosisReport)
        // and multipart/form-data (for file uploads).
        const contentType = request.headers.get('content-type') || ''
        let body: Record<string, unknown> = {}
        let photoFile: File | null = null
        let diagnosisReportFile: File | null = null

        if (contentType.includes('application/json')) {
          body = await request.json()
        } else {
          const formData = await request.formData()
          body = Object.fromEntries(formData.entries())
          photoFile = formData.get('photo') as File | null
          diagnosisReportFile = formData.get('diagnosisReport') as File | null
        }

        const id = body.id as string

        if (!id) {
          return NextResponse.json(
            { error: 'Patient ID required' },
            { status: 400 }
          )
        }
        // Flag sent by the UI to clear an invalid/removed diagnosis report.
        const clearDiagnosisReport = body.clearDiagnosisReport === 'true'

        // Validate file types and sizes
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf']
        const maxSizeBytes = 10 * 1024 * 1024 // 10MB

        const validateFile = (file: File, _fieldName: string) => {
          const fileName = file.name.toLowerCase()
          const ext = fileName.substring(fileName.lastIndexOf('.'))
          if (!allowedExtensions.includes(ext)) {
            return `Invalid file type '${file.name}'. Only PDF, JPG, JPEG, PNG, GIF, and WEBP files are allowed.`
          }
          if (file.size > maxSizeBytes) {
            return `File '${file.name}' exceeds the maximum allowed size of 10MB.`
          }
          return null
        }

        if (photoFile && photoFile.size > 0) {
          const error = validateFile(photoFile, 'photo')
          if (error) return NextResponse.json({ error }, { status: 400 })
        }
        if (diagnosisReportFile && diagnosisReportFile.size > 0) {
          const error = validateFile(diagnosisReportFile, 'diagnosisReport')
          if (error) return NextResponse.json({ error }, { status: 400 })
        }

        // Get current patient data
        const existingPatient = await db.patient.findFirst({
          where: { id, organizationId },
        })

        if (!existingPatient) {
          return NextResponse.json(
            { error: 'Patient not found' },
            { status: 404 }
          )
        }

    let photoPath = existingPatient.photo
    let diagnosisReportPath = existingPatient.diagnosisReport

    // Helper function to save files
    const saveFile = async (file: File) => {
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      const fileName = safeUploadName(file.name)
      const filePath = `/uploads/${fileName}`
      const fullPath = path.join(UPLOADS_DIR, fileName)

      if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true })
      }

      fs.writeFileSync(fullPath, buffer)

      return filePath
    }

    // Save new photo if uploaded
    if (photoFile && photoFile.size > 0) {
      photoPath = await saveFile(photoFile)
    }
    // Replace the diagnosis report if a new file is uploaded.
    if (diagnosisReportFile && diagnosisReportFile.size > 0) {
      diagnosisReportPath = await saveFile(diagnosisReportFile)
    } else if (clearDiagnosisReport) {
      // UI requested removal (e.g. the stored file returned 404, or the user
      // clicked "Remove"). Clear the invalid path so the upload UI shows.
      diagnosisReportPath = null
    }

    // Handle JSON-sent null values for document fields (e.g. delete from Documents tab)
    if (contentType.includes('application/json')) {
      if ('photo' in body && body.photo === null) photoPath = null
      if ('diagnosisReport' in body && body.diagnosisReport === null) diagnosisReportPath = null
    }

    // Build the update payload with a field allowlist. Only include fields
    // that are actually present in the FormData to avoid overwriting valid
    // existing values with empty strings.
    const strVal = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

    // Aadhaar is a plain 12-digit text field (not a file) — validate before update.
    if ('aadhaar' in body) {
      const aadhaarVal = strVal(body.aadhaar)
      if (aadhaarVal && !/^\d{12}$/.test(aadhaarVal)) {
        return NextResponse.json(
          { error: 'Aadhaar number must be 12 digits.' },
          { status: 400 }
        )
      }
    }

    const updateData: Record<string, unknown> = {
      photo: photoPath,
      diagnosisReport: diagnosisReportPath,
    }
    const textFields = [
      'childName', 'gender', 'fatherName', 'motherName', 'parentName',
      'mobile', 'alternateNumber', 'email', 'address', 'city', 'state',
      'pincode', 'schoolName', 'class', 'referredBy', 'diagnosis',
      'medicalHistory', 'birthHistory', 'aadhaar',
    ] as const
    for (const f of textFields) {
      if (f in body) {
        const val = strVal(body[f])
        // Preserve nullable fields as null when empty, otherwise the trimmed string.
        updateData[f] = val || null
      }
    }
    // dateOfBirth — only update if a valid date string is provided.
    if ('dateOfBirth' in body && strVal(body.dateOfBirth)) {
      const dob = new Date(strVal(body.dateOfBirth))
      if (!isNaN(dob.getTime())) {
        updateData.dateOfBirth = dob
      }
    }

    const patient = await db.patient.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(patient)
  } catch (error) {
    console.error('Patient update error:', error)
    const errMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errMessage || 'Failed to update patient' },
      { status: 500 }
    )
  }
}

// DELETE /api/patients?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden: only Super Admin and Admin can delete patients.' },
        { status: 403 }
      )
    }
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    // Parse deletion reason from query or body
    let deletionReason = searchParams.get('reason') || ''
    if (!deletionReason) {
      try {
        const body = await request.json()
        deletionReason = body?.reason || body?.deletionReason || ''
      } catch { /* body not JSON — check query above */ }
    }
    if (!deletionReason.trim()) {
      return NextResponse.json({ error: 'Deletion reason is required.' }, { status: 400 })
    }

    const existing = await db.patient.findFirst({ where: { id, organizationId } })
    if (!existing) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    // Collect uploaded-file paths (photo/diagnosis report/assessment
    // attachments) before the owning rows are deleted, so they can be
    // removed from disk after the transaction commits.
    const assessments = await db.assessment.findMany({
      where: { patientId: id, organizationId },
      select: { attachments: true, reportUrl: true },
    })
    const filesToDelete: string[] = []
    if (existing.photo) filesToDelete.push(existing.photo)
    if (existing.diagnosisReport) filesToDelete.push(existing.diagnosisReport)
    for (const a of assessments) {
      if (a.reportUrl) filesToDelete.push(a.reportUrl)
      if (a.attachments) {
        try {
          const parsed = JSON.parse(a.attachments)
          if (Array.isArray(parsed)) {
            filesToDelete.push(...parsed.filter((p): p is string => typeof p === 'string'))
          }
        } catch { /* not JSON — ignore */ }
      }
    }

    // ── Transaction: hard delete, per explicit request — permanently
    // removes the Patient row. Appointment/TherapySession/Assessment/
    // PatientPackage/Invoice/Payment all have onDelete: Cascade from Patient
    // in the schema, so they're wiped automatically by the DB in the same
    // statement (InvoiceItem cascades from Invoice in turn). There is no
    // undo, and this includes financial/billing history (invoices,
    // payments) — permanently gone, not archived.
    await db.$transaction([
      db.whatsAppLog.deleteMany({ where: { patientId: id, organizationId } }),
      // Parent-role logins linked to this child lose the link and are deactivated.
      db.user.updateMany({ where: { patientId: id, organizationId }, data: { patientId: null, isActive: false } }),
      db.actionLog.create({
        data: {
          module: 'patients',
          recordId: id,
          actionType: 'deleted',
          notes: `Hard-deleted patient — all appointments, sessions, packages, assessments, invoices and payments permanently removed. Reason: ${deletionReason.trim()}`,
          performedBy: user.id,
          performedByName: user.name || 'Unknown',
          userRole: user.role,
          organizationId,
        },
      }),
      db.patient.delete({ where: { id } }),
    ])

    // Best-effort disk cleanup — runs after the DB transaction commits so a
    // filesystem error never rolls back an otherwise-successful deletion.
    for (const relPath of filesToDelete) {
      try {
        const fullPath = path.join(UPLOADS_DIR, path.basename(relPath))
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
      } catch (fileErr) {
        console.error('Failed to delete file during patient deletion:', relPath, fileErr)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Patient delete error:', error)
    return NextResponse.json({ error: 'Failed to delete patient' }, { status: 500 })
  }
}
