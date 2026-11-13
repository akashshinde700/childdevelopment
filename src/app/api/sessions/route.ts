import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { recalcPatientStatus } from '@/lib/patient-status'
import { createSessionInvoice } from '@/lib/session-billing'
import { syncPackageUsage, syncBlockUsage } from '@/lib/package-usage'

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const { searchParams } = new URL(request.url)
    const patientId = searchParams.get('patientId') || ''
    const status = searchParams.get('status') || ''
    const search = searchParams.get('search') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = { organizationId }
    if (patientId) where.patientId = patientId
    if (status) where.status = status
    if (search) {
      where.OR = [
        { patient: { childName: { contains: search } } },
        { patient: { patientId: { contains: search } } },
        { notes: { contains: search } },
      ]
    }

    if (user.role.startsWith('therapist')) {
      where.therapistName = user.name
    }

    if (user.role === 'receptionist') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Parents only see their own child's session notes (SOAP notes etc).
    if (user.role === 'parent') {
      where.patientId = user.patientId || '__none__'
    }

    const [sessions, total] = await Promise.all([
      db.therapySession.findMany({
        where,
        include: {
          patient: { select: { childName: true, patientId: true, mobile: true } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.therapySession.count({ where }),
    ])

    // TherapySession has no roomId of its own — pull it from the linked
    // Appointment (set when the session was auto-generated from a package
    // or scheduled through Appointments) so the Sessions page can filter by
    // room without duplicating the field onto every TherapySession row.
    const appointmentIds = sessions.map((s) => s.appointmentId).filter((id): id is string => !!id)
    const roomByAppointmentId = new Map<string, string | null>()
    if (appointmentIds.length > 0) {
      const linkedAppointments = await db.appointment.findMany({
        where: { id: { in: appointmentIds }, organizationId },
        select: { id: true, roomId: true },
      })
      for (const a of linkedAppointments) roomByAppointmentId.set(a.id, a.roomId)
    }
    const sessionsWithRoom = sessions.map((s) => ({
      ...s,
      roomId: s.appointmentId ? roomByAppointmentId.get(s.appointmentId) ?? null : null,
    }))

    return NextResponse.json({ sessions: sessionsWithRoom, total, page, limit })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden: only Super Admin and Admin can create therapy sessions.' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // If therapist, auto-fill their name
    const therapistName = body.therapistName || (user.role.startsWith('therapist') ? user.name : null)
    const therapyType = body.therapyType || (user.role.startsWith('therapist') ? user.therapyType : null)

    // Pay-per-session charge, raised as an invoice so it lands in Billing
    // (see createSessionInvoice). Only for patients without a package on
    // this session — a package session is already paid for by the package.
    const fee = Number(body.fee)
    const chargeFee = !body.patientPackageId && Number.isFinite(fee) && fee > 0 ? fee : 0
    const feePaid = body.feePaid === true

    // Use a transaction: create Therapy Session + auto-create linked Appointment
    const result = await db.$transaction(async (tx) => {
      // 1. Charge for the session (if it is a paid-per-session one), then
      //    create the Therapy Session pointing at that invoice.
      let sessionInvoice: { invoiceId: string; invoiceNo: string } | null = null
      if (chargeFee > 0) {
        const patient = await tx.patient.findFirst({
          where: { id: body.patientId, organizationId },
          select: { branchId: true },
        })
        sessionInvoice = await createSessionInvoice(tx, {
          organizationId,
          patientId: body.patientId,
          fee: chargeFee,
          paid: feePaid,
          paymentMode: body.feePaymentMode,
          description: `${therapyType || 'Therapy'} session — ${new Date(body.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
          date: new Date(body.date),
          branchId: patient?.branchId ?? null,
        })
      }

      const session = await tx.therapySession.create({
        data: {
          patientId: body.patientId,
          patientPackageId: body.patientPackageId || null,
          therapistName,
          therapyType,
          date: new Date(body.date),
          startTime: body.startTime,
          endTime: body.endTime,
          status: body.status || 'planned',
          subjective: body.subjective,
          objective: body.objective,
          assessment: body.assessment,
          plan: body.plan,
          notes: body.notes,
          progressReport: body.progressReport,
          fee: chargeFee > 0 ? chargeFee : null,
          invoiceId: sessionInvoice?.invoiceId ?? null,
          organizationId,
        },
      })

      // 2. Auto-create a linked Appointment (Package → Session → Appointment)
      const sessionStatus = body.status || 'planned'
      const appointmentStatus = sessionStatus === 'planned' ? 'scheduled'
        : sessionStatus === 'in_progress' ? 'confirmed'
        : sessionStatus === 'completed' ? 'completed'
        : sessionStatus === 'cancelled' ? 'cancelled'
        : sessionStatus === 'no_show' ? 'no_show'
        : 'scheduled'

      const appointment = await tx.appointment.create({
        data: {
          patientId: body.patientId,
          // Package usage is counted from linked appointments — a session
          // booked against a package must link its appointment too.
          patientPackageId: body.patientPackageId || null,
          therapyType: therapyType || null,
          therapistId: therapistName,
          title: `${therapyType || 'Therapy'} Session`,
          date: new Date(body.date),
          startTime: body.startTime || '10:00',
          endTime: body.endTime || '10:45',
          status: appointmentStatus,
          type: 'therapy',
          notes: body.notes || '',
          organizationId,
        },
      })

      // Tie the session to the appointment just made for it. Left unset, the
      // two drifted apart — later edits fuzzy-matched by date/therapist and
      // could leave an orphan "completed" session behind (a duplicate one
      // patient's history showed).
      await tx.therapySession.update({ where: { id: session.id }, data: { appointmentId: appointment.id } })

      // Booked already-completed against a package (catch-up entry): count it.
      if (appointmentStatus === 'completed') {
        await syncPackageUsage(tx, organizationId, body.patientPackageId || null)
      }

      return { session, appointment }
    })

    return NextResponse.json(result.session, { status: 201 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Session create error:', error)
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  let body: Record<string, unknown> | undefined
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    // Allow admin, super_admin, and therapist roles to update sessions
    if (
      user.role !== 'admin' &&
      user.role !== 'super_admin' &&
      !user.role.startsWith('therapist') &&
      user.role !== 'psychologist'
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    body = await request.json()
    const { id: rawId, cancellationReason: rawReason, ...data } = body as Record<string, unknown>
    const id = typeof rawId === 'string' ? rawId : ''
    const cancellationReason = typeof rawReason === 'string' ? rawReason : ''
    if (!id) {
      console.error('Sessions PUT: No ID provided in request body')
      return NextResponse.json({ error: 'ID required' }, { status: 400 })
    }

    // If status is being changed to 'completed', check if already completed
    if (data.status === 'completed') {
      const existingSession = await db.therapySession.findFirst({ where: { id, organizationId } })
      if (existingSession && existingSession.status === 'completed') {
        return NextResponse.json(
          { error: 'This session has already been completed and cannot be modified.' },
          { status: 400 }
        )
      }
    }

    // Build session update data — only allow valid TherapySession fields
    const sessionUpdateData: Record<string, unknown> = {}
    const validSessionFields = [
      'status', 'therapistName', 'therapyType', 'date', 'startTime', 'endTime',
      'subjective', 'objective', 'assessment', 'plan', 'notes', 'progressReport',
      'patientPackageId', 'actualDuration',
    ]
    for (const field of validSessionFields) {
      if (field in data) {
        sessionUpdateData[field] = data[field]
      }
    }
    if (sessionUpdateData.date) {
      sessionUpdateData.date = new Date(sessionUpdateData.date as string)
    }

    // Append cancellation reason to notes if provided
    if (cancellationReason && data.status === 'cancelled') {
      const existingSession = await db.therapySession.findFirst({ where: { id, organizationId } })
      const existingNotes = existingSession?.notes ? existingSession.notes + ' ' : ''
      sessionUpdateData.notes = `${existingNotes}[Cancellation reason: ${cancellationReason}]`
    }

    // Use a transaction: update session + sync appointment + update package balance
    const session = await db.$transaction(async (tx) => {
      // 1. Fetch existing session to get appointmentId
      const existingSession = await tx.therapySession.findFirst({ where: { id, organizationId } })
      if (!existingSession) {
        throw new Error('Therapy session not found')
      }

      // 2. Update the Therapy Session
      const updatedSession = await tx.therapySession.update({
        where: { id },
        data: sessionUpdateData,
      })

      // 3. Sync linked Appointment status/date/time (Session → Appointment mirror).
      // Runs whenever status OR date/time changes — previously this whole block
      // was gated on `data.status` alone, so editing just the date/time on a
      // session (no status change) silently never reached the Appointment,
      // Scheduler, or Patient History, which all read from Appointment.date.
      if (data.status || data.date || data.startTime || data.endTime) {
        const appointmentStatus = data.status ? (
          data.status === 'planned' ? 'scheduled'
          : data.status === 'in_progress' ? 'confirmed'
          : data.status === 'completed' ? 'completed'
          : data.status === 'cancelled' ? 'cancelled'
          : data.status === 'no_show' ? 'no_show'
          : data.status === 'rescheduled' ? 'rescheduled'
          : 'scheduled'
        ) : undefined

        // Use appointmentId from the session record (reliable link)
        if (existingSession.appointmentId) {
          const linkedAppt = await tx.appointment.findFirst({
            where: { id: existingSession.appointmentId, organizationId },
          })

          if (linkedAppt) {
            const apptUpdateData: Record<string, unknown> = {}
            if (appointmentStatus) apptUpdateData.status = appointmentStatus
            // Add cancellation reason to appointment notes
            if (cancellationReason && data.status === 'cancelled') {
              const apptNotes = linkedAppt.notes ? linkedAppt.notes + ' ' : ''
              apptUpdateData.notes = `${apptNotes}[Cancellation reason: ${cancellationReason}]`
            }
            // Sync date/time whenever changed — not only when rescheduling status
            if (data.date) apptUpdateData.date = new Date(data.date as string)
            if (data.startTime) apptUpdateData.startTime = data.startTime
            if (data.endTime) apptUpdateData.endTime = data.endTime

            await tx.appointment.update({
              where: { id: existingSession.appointmentId },
              data: apptUpdateData,
            })
          } else {
            console.warn(`Sessions PUT: Linked appointment ${existingSession.appointmentId} not found for session ${id}`)
          }
        } else {
          // Fallback: try to find matching appointment by patient+therapist+date+time
          const matchingAppt = await tx.appointment.findFirst({
            where: {
              patientId: updatedSession.patientId,
              therapistId: updatedSession.therapistName || undefined,
              date: updatedSession.date,
              startTime: updatedSession.startTime || undefined,
              organizationId,
            },
          })

          if (matchingAppt) {
            const apptUpdateData: Record<string, unknown> = {}
            if (appointmentStatus) apptUpdateData.status = appointmentStatus
            if (cancellationReason && data.status === 'cancelled') {
              const apptNotes = matchingAppt.notes ? matchingAppt.notes + ' ' : ''
              apptUpdateData.notes = `${apptNotes}[Cancellation reason: ${cancellationReason}]`
            }

            await tx.appointment.update({
              where: { id: matchingAppt.id },
              data: apptUpdateData,
            })

            // Store the appointmentId on the session for future syncs
            await tx.therapySession.update({
              where: { id },
              data: { appointmentId: matchingAppt.id },
            })
          } else {
            console.warn(`Sessions PUT: No matching appointment found for session ${id} (patient: ${updatedSession.patientId}, therapist: ${updatedSession.therapistName}, date: ${updatedSession.date})`)
          }
        }
      }

      // 4. Package usage. Counted from the completed APPOINTMENTS linked to
      // the package (lib/package-usage), recounted on any move into or out
      // of completed — never ±1, so re-saving a completed session, double
      // taps and racing requests can't drift it. The appointment status was
      // synced in step 3; here we make sure it carries the package link.
      const movedIn = data.status === 'completed' && existingSession.status !== 'completed'
      const movedOut = !!data.status && data.status !== 'completed' && existingSession.status === 'completed'
      if (movedIn || movedOut) {
        let pkgId = existingSession.patientPackageId

        if (!pkgId && movedIn) {
          const sessionTherapy = existingSession.therapyType || ''
          const candidates = await tx.patientPackage.findMany({
            where: { patientId: existingSession.patientId, status: 'active', organizationId },
            include: { package: { select: { therapyType: true } } },
            orderBy: { createdAt: 'asc' },
          })
          const match = candidates.find((p) => {
            const pType = p.therapyType ?? p.package?.therapyType ?? ''
            return pType && pType.toLowerCase() === sessionTherapy.toLowerCase()
          }) || candidates[0]

          if (match) {
            pkgId = match.id
            await tx.therapySession.update({
              where: { id: existingSession.id },
              data: { patientPackageId: pkgId },
            })
          }
        }

        if (pkgId && existingSession.appointmentId) {
          const linkedAppt = await tx.appointment.findFirst({
            where: { id: existingSession.appointmentId, organizationId },
            select: { id: true, patientPackageId: true, patientPackageTherapyTypeId: true },
          })
          if (linkedAppt && !linkedAppt.patientPackageId) {
            await tx.appointment.update({ where: { id: linkedAppt.id }, data: { patientPackageId: pkgId } })
          }
          await syncBlockUsage(tx, organizationId, linkedAppt?.patientPackageTherapyTypeId)
        }
        // Completing (via recalcPatientStatus below) a package's last
        // session can flip the patient to Inactive.
        await syncPackageUsage(tx, organizationId, pkgId)
      }

      return updatedSession
    })

    if (data.status === 'completed') {
      await recalcPatientStatus(session.patientId)
    }

    return NextResponse.json(session)
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const errMsg = (error as Error).message
    console.error('Sessions PUT error:', {
      id: body?.id,
      status: body?.status,
      cancellationReason: body?.cancellationReason,
      error: errMsg,
    })

    // Return descriptive error messages
    if (errMsg.includes('not found')) {
      return NextResponse.json({ error: errMsg }, { status: 404 })
    }
    if (errMsg.includes('Unknown argument') || errMsg.includes('Invalid value')) {
      return NextResponse.json(
        { error: `Invalid data: ${errMsg}`, detail: errMsg },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update session', detail: errMsg },
      { status: 500 }
    )
  }
}

// DELETE /api/sessions?id=xxx — permanently remove a CANCELLED therapy
// session (and its mirrored Appointment, if any) so it disappears from the
// calendar, Appointments module, and Patient History everywhere at once.
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — only admins can delete sessions.' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const existing = await db.therapySession.findFirst({ where: { id, organizationId } })
    if (!existing) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    if (existing.status !== 'cancelled') {
      return NextResponse.json({ error: 'Only cancelled sessions can be deleted' }, { status: 400 })
    }

    await db.$transaction(async (tx) => {
      await tx.therapySession.delete({ where: { id } })
      if (existing.appointmentId) {
        await tx.actionLog.deleteMany({ where: { module: 'appointments', recordId: existing.appointmentId, organizationId } })
        await tx.appointment.delete({ where: { id: existing.appointmentId } }).catch(() => { /* already gone */ })
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Session delete error:', error)
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }
}
