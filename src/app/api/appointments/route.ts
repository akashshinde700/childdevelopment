import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { istStartOfToday, istMinutesSinceMidnight, istStartOfDateString, istEndOfDateString } from '@/lib/timezone'
import { canDeleteAppointments } from '@/store/app-store'
import { notifyPatientParent, notifyTherapistByName } from '@/lib/notifications'
import { recalcPatientStatus } from '@/lib/patient-status'
import { syncPackageUsage, syncBlockUsage } from '@/lib/package-usage'
import { accrueOnCompletion, reverseOnUncompletion, PayrollLockedError } from '@/lib/payroll-accrual'

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const date = searchParams.get('date') || ''
    const startDate = searchParams.get('startDate') || searchParams.get('fromDate') || ''
    const endDate = searchParams.get('endDate') || searchParams.get('toDate') || ''
    const therapistId = searchParams.get('therapistId') || ''
    const patientId = searchParams.get('patientId') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = { organizationId }
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { patient: { childName: { contains: search } } },
        { patient: { patientId: { contains: search } } },
      ]
    }
    if (status) where.status = status
    if (therapistId) where.therapistId = therapistId
    // Was silently ignored before — the client could pass ?patientId=X and
    // get back every appointment in the system instead of an error or a
    // filtered result, which is exactly what made an earlier audit's test
    // queries look like two different patients shared the same 172
    // appointments. Applied before the role-scoping below so a parent's own
    // scoping still wins over anything a client tries to pass.
    if (patientId) where.patientId = patientId

    // Range filter (inclusive) takes precedence over single date param.
    // startDate/endDate are each independently optional — e.g. "Upcoming"
    // queries send only startDate (meaning "on or after this date", open-
    // ended), which previously required BOTH params to be set before any
    // date filter was applied at all, silently returning every appointment
    // ever (including past ones) whenever endDate was omitted.
    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {}
      if (startDate) dateFilter.gte = istStartOfDateString(startDate)
      if (endDate) dateFilter.lte = istEndOfDateString(endDate)
      where.date = dateFilter
    } else if (date) {
      // Use date range filter to avoid timezone/exact-match issues
      where.date = { gte: istStartOfDateString(date), lte: istEndOfDateString(date) }
    }

    // Therapist scoping: therapist_* roles see only their own appointments.
    // super_admin / admin / receptionist see ALL.
    if (user.role.startsWith('therapist')) {
      where.therapistId = user.name
    }
    // Parent scoping: parents only see their own child's appointments.
    if (user.role === 'parent') {
      where.patientId = user.patientId || '__none__'
    }

    const [appointments, total] = await Promise.all([
      db.appointment.findMany({
        where,
        include: { patient: true },
        orderBy: { date: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.appointment.count({ where }),
    ])

    return NextResponse.json({ appointments, total, page, limit })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch appointments' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const body = await request.json()

    // Historical data entry (migration mode): only allow when the center
    // setting `allowHistoricalEntry` is enabled by an admin. This guards
    // against accidental back-dating during normal operation.
    if (body.isHistorical === true) {
      if (user.role !== 'super_admin' && user.role !== 'admin') {
        return NextResponse.json(
          { error: 'Only administrators can enter historical records.' },
          { status: 403 }
        )
      }
      const settings = await db.centerSettings.findFirst({ where: { organizationId } })
      if (!settings?.allowHistoricalEntry) {
        return NextResponse.json(
          { error: 'Historical data entry is disabled. Enable "Allow Historical Entry" in Center Settings first.' },
          { status: 403 }
        )
      }
    }

    // Check for duplicate appointment: same therapist OR same patient, same date, overlapping time slot.
    // A patient cannot be in two appointments at the same time, and a therapist cannot double-book.
    if (body.date && body.startTime && body.endTime && (body.therapistId || body.patientId)) {
      const appointmentDate = new Date(body.date)
      const nextDay = new Date(appointmentDate)
      nextDay.setDate(nextDay.getDate() + 1)
      const dayStart = new Date(appointmentDate.getFullYear(), appointmentDate.getMonth(), appointmentDate.getDate())

      const newStart = body.startTime
      const newEnd = body.endTime

      // Therapist overlap check (skip if no therapist assigned)
      if (body.therapistId) {
        const therapistAppts = await db.appointment.findMany({
          where: {
            therapistId: body.therapistId,
            date: { gte: dayStart, lt: nextDay },
            status: { not: 'cancelled' },
            organizationId,
          },
          select: { startTime: true, endTime: true, patientId: true },
        })
        const therapistOverlap = therapistAppts.some((appt) => newStart < appt.endTime && appt.startTime < newEnd)
        if (therapistOverlap) {
          return NextResponse.json(
            { error: 'This therapist already has an appointment at this time slot. Please choose a different time or therapist.' },
            { status: 409 }
          )
        }
      }

      // Same-patient overlap check — a patient cannot have two appointments at the same time.
      if (body.patientId) {
        const patientAppts = await db.appointment.findMany({
          where: {
            patientId: body.patientId,
            date: { gte: dayStart, lt: nextDay },
            status: { not: 'cancelled' },
            organizationId,
          },
          select: { startTime: true, endTime: true },
        })
        const patientOverlap = patientAppts.some((appt) => newStart < appt.endTime && appt.startTime < newEnd)
        if (patientOverlap) {
          return NextResponse.json(
            { error: 'This patient already has an appointment at this time slot. Please choose a different time.' },
            { status: 409 }
          )
        }
      }
    }

    // Use a transaction: create Appointment + auto-create linked Therapy Session (for therapy-type appointments)
    const appointment = await db.$transaction(async (tx) => {
      const appt = await tx.appointment.create({
        data: {
          patientId: body.patientId,
          therapistId: body.therapistId || null,
          roomId: body.roomId,
          title: body.title || 'Appointment',
          date: new Date(body.date),
          startTime: body.startTime,
          endTime: body.endTime,
          status: body.status || 'scheduled',
          type: body.type,
          notes: body.notes,
          // Historical data entry (migration mode) — admin can back-date records.
          isHistorical: body.isHistorical === true,
          enteredBy: body.isHistorical ? (body.enteredBy || user.name || null) : null,
          enteredDate: body.isHistorical ? new Date() : null,
          // Package-generated session linkage — set when this appointment was
          // auto-generated from a package assignment (see PackagesPage.tsx).
          // patientPackageId is the canonical link used to reconcile
          // "purchased" vs "actually scheduled" session counts.
          therapyType: body.therapyType || null,
          sessionNumber: typeof body.sessionNumber === 'number' ? body.sessionNumber : null,
          patientPackageId: body.patientPackageId || null,
          patientPackageTherapyTypeId: body.patientPackageTherapyTypeId || null,
          organizationId,
        },
      })

      // Auto-create a linked Therapy Session for therapy-type appointments
      if (body.type === 'therapy' || body.type === 'consultation' || !body.type) {
        const sessionStatus = body.status === 'scheduled' ? 'planned'
          : body.status === 'confirmed' ? 'in_progress'
          : body.status === 'completed' ? 'completed'
          : body.status === 'cancelled' ? 'cancelled'
          : body.status === 'no_show' ? 'no_show'
          : 'planned'

        await tx.therapySession.create({
          data: {
            patientId: body.patientId,
            appointmentId: appt.id,
            therapistName: body.therapistId || null,
            therapyType: body.therapyType || body.type || 'Therapy',
            date: new Date(body.date),
            startTime: body.startTime,
            endTime: body.endTime,
            status: sessionStatus,
            notes: body.notes || null,
            organizationId,
          },
        })
      }

      // A session can be created ALREADY completed (bulk historical data
      // entry — see `isHistorical`/`enteredBy` above), bypassing the PUT
      // completion flow that normally increments this. Mirror that increment
      // here so `PatientPackage.sessionsCompleted` — the reliable source
      // GET /api/patient-packages reads "Used Sessions" from — stays correct
      // regardless of which path completed the session. Only applies when a
      // package link was actually given; no fuzzy fallback matching here
      // (unlike PUT's completion path) since a brand-new appointment has no
      // prior linked state to resolve from — an unlinked historical entry
      // simply isn't counted, same "don't guess" rule as everywhere else.
      if (appt.status === 'completed') {
        await syncPackageUsage(tx, organizationId, appt.patientPackageId)
        await syncBlockUsage(tx, organizationId, appt.patientPackageTherapyTypeId)
      }

      return appt
    })
    void user

    const dateLabel = new Date(appointment.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    await Promise.all([
      notifyPatientParent(organizationId ?? null, appointment.patientId, {
        type: 'appointment',
        title: 'Appointment Scheduled',
        message: `A new appointment has been scheduled on ${dateLabel} at ${appointment.startTime}.`,
        link: 'parent-appointments',
      }),
      notifyTherapistByName(organizationId ?? null, appointment.therapistId, {
        type: 'appointment',
        title: 'New Appointment Assigned',
        message: `You have a new appointment on ${dateLabel} at ${appointment.startTime}.`,
        link: 'appointments',
      }),
    ])

    return NextResponse.json(appointment, { status: 201 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Appointment create error:', error)
    return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 })
  }
}

// Statuses that require super_admin/admin role to set via PUT.
// Therapists CAN set: in_progress, completed, no_show (session execution)
// Only admins CAN set: rescheduled, cancelled (management actions)
const ADMIN_ONLY_STATUSES = new Set(['rescheduled', 'cancelled'])

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const body = await request.json()
    const { id, ...data } = body
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const existing = await db.appointment.findFirst({ where: { id, organizationId } })
    if (!existing) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    const newStatus = typeof data.status === 'string' ? (data.status as string) : undefined
    // A reschedule APPROVAL carries a concrete new date/time and lands the
    // appointment back on 'scheduled' (not 'rescheduled' — that status is
    // only the pending "requested" state). Detected by slot fields being
    // present, independent of what newStatus is being set to.
    const isSlotChange = data.date !== undefined || data.startTime !== undefined || data.endTime !== undefined
    const isRescheduleAction = newStatus === 'rescheduled' || (isSlotChange && newStatus === 'scheduled')

    // ── Role check:
    // Therapists can execute sessions: in_progress, completed, no_show
    // Only admins can manage: rescheduled, cancelled, or any slot (date/time) change
    if ((newStatus && ADMIN_ONLY_STATUSES.has(newStatus)) || isSlotChange) {
      if (user.role !== 'super_admin' && user.role !== 'admin' && user.role !== 'receptionist') {
        return NextResponse.json(
          { error: 'Forbidden: only admins/receptionists can reschedule or cancel appointments. Therapists can complete sessions or mark no-show.' },
          { status: 403 }
        )
      }
    }

    // ── Cancel requires cancellationReason (stored in notes with prefix).
    if (newStatus === 'cancelled') {
      const reason = typeof body.cancellationReason === 'string' ? body.cancellationReason.trim() : ''
      if (!reason) {
        return NextResponse.json(
          { error: 'Cancellation reason is required' },
          { status: 400 }
        )
      }
      const existingNotes = existing.notes ? existing.notes + ' ' : ''
      data.notes = `${existingNotes}[Cancellation reason: ${reason}]`
    }

    // ── Complete validation: date → time → clinic hours → session details.
    // Rescheduled appointments CAN be completed (the new slot is the source of truth).
    // Therapists are exempt from the clinic-hours restriction (they may complete
    // sessions that ran outside normal hours). IST is used for all "today" checks.
    if (newStatus === 'completed') {
      // 1. Date check (IST): the appointment date must be today or earlier.
      //    Future-dated appointments cannot be completed.
      const istToday = istStartOfToday()
      const apptDate = new Date(existing.date.getFullYear(), existing.date.getMonth(), existing.date.getDate())
      if (apptDate.getTime() > istToday.getTime() + 24 * 60 * 60 * 1000) {
        return NextResponse.json(
          { error: 'Cannot complete a future-dated appointment. Please reschedule it to today or an earlier date first.' },
          { status: 400 }
        )
      }

      // 2. Time check: start/end times must be present and valid.
      if (!existing.startTime || !existing.endTime) {
        return NextResponse.json(
          { error: 'Appointment is missing start/end time. Please set the time slot before completing.' },
          { status: 400 }
        )
      }

      // 3. Clinic hours check (admin/receptionist only — therapists are exempt
      //    so they can complete sessions that ran outside normal hours).
      const isTherapist = user.role.startsWith('therapist') || user.role === 'psychologist'
      if (!isTherapist) {
        const nowMin = istMinutesSinceMidnight()
        // Clinic hours: 10:00 (600) – 22:00 (1320). Outside this window, only
        // therapists can complete (they have first-hand knowledge of the session).
        if (nowMin < 600 || nowMin > 1320) {
          return NextResponse.json(
            { error: 'Appointments can only be completed during clinic hours (10:00 AM – 10:00 PM IST). Therapists are exempt from this restriction.' },
            { status: 400 }
          )
        }
      }

      // 4. Session detail fields (the actual completion payload).
      const missing: string[] = []
      const sessionFocus = typeof body.sessionFocus === 'string' ? body.sessionFocus.trim() : ''
      const goalTargeted = typeof body.goalTargeted === 'string' ? body.goalTargeted.trim() : ''
      const progressAchieved = typeof body.progressAchieved === 'string' ? body.progressAchieved.trim() : ''
      const sessionRemarks = typeof body.sessionRemarks === 'string' ? body.sessionRemarks.trim() : ''
      if (!sessionFocus) missing.push('sessionFocus')
      if (!goalTargeted) missing.push('goalTargeted')
      if (!progressAchieved) missing.push('progressAchieved')
      if (!sessionRemarks) missing.push('sessionRemarks')
      if (missing.length > 0) {
        return NextResponse.json(
          { error: 'Missing required session details', missing },
          { status: 400 }
        )
      }
      data.sessionFocus = sessionFocus
      data.goalTargeted = goalTargeted
      data.progressAchieved = progressAchieved
      data.sessionRemarks = sessionRemarks
    }

    // ── Reschedule: optional therapist overlap guard (409 on conflict).
    // Uses the NEW therapist (data.therapistId) when the reschedule also
    // moves the appointment to a different therapist; falls back to the
    // existing therapist when unchanged.
    const rescheduleTherapistId = typeof data.therapistId === 'string' && data.therapistId
      ? data.therapistId
      : existing.therapistId
    if (isRescheduleAction && rescheduleTherapistId) {
      const newDate = data.date ? new Date(data.date) : existing.date
      const newStart = typeof data.startTime === 'string' ? data.startTime : existing.startTime
      const newEnd = typeof data.endTime === 'string' ? data.endTime : existing.endTime
      if (newStart && newEnd) {
        const dayStart = new Date(newDate.getFullYear(), newDate.getMonth(), newDate.getDate())
        const nextDay = new Date(dayStart)
        nextDay.setDate(nextDay.getDate() + 1)
        const conflicts = await db.appointment.findMany({
          where: {
            therapistId: rescheduleTherapistId,
            date: { gte: dayStart, lt: nextDay },
            status: { notIn: ['cancelled', 'rescheduled'] },
            id: { not: id },
            organizationId,
          },
          select: { startTime: true, endTime: true },
        })
        const overlap = conflicts.some((a) => newStart < a.endTime && a.startTime < newEnd)
        if (overlap) {
          return NextResponse.json(
            { error: 'This therapist already has another appointment at the requested time slot' },
            { status: 409 }
          )
        }
      }
    }

    // Build update payload — never let client set id/cancellationReason verbatim.
    // Also strip `actualDuration` — it belongs to TherapySession, not Appointment.
    const updateData: Record<string, unknown> = { ...data }
    if (data.date) updateData.date = new Date(data.date)
    delete updateData.id
    delete updateData.cancellationReason
    delete updateData.actualDuration
    // The parent's review is written only via /api/appointments/[id]/review —
    // staff (including the therapist being reviewed) can never set or edit it.
    delete updateData.parentRating
    delete updateData.parentReview
    delete updateData.parentReviewedAt

    // Package slots and payroll move only on a real status transition:
    //   becameCompleted — moved INTO completed (uses one session)
    //   leftCompleted   — explicitly moved OUT of completed (gives it back)
    // Re-saving an already-completed appointment, or a save that sends no
    // status at all (notes, time), must do neither — both used to: the
    // first re-counted the session, the second silently handed it back.
    const becameCompleted = newStatus === 'completed' && existing.status !== 'completed'
    const leftCompleted = newStatus !== undefined && newStatus !== 'completed' && existing.status === 'completed'

    const updated = await db.$transaction(async (tx) => {
      const appt = await tx.appointment.update({
        where: { id },
        data: updateData,
        include: { patient: true },
      })

      // ── Payroll lock check ──
      // Undoing a completed session (explicit undo, or a reschedule/cancel
      // applied to an already-completed one) must be blocked if its earning
      // has already been folded into a generated payroll — throwing here
      // rolls back the whole transaction, including the appt.update above.
      if (leftCompleted) {
        await reverseOnUncompletion(tx, 'appointment', id)
      }

      // ── Sync linked Therapy Session ──
      // Find the therapy session linked to this appointment (by appointmentId)
      const linkedSession = await tx.therapySession.findFirst({
        where: { appointmentId: id, organizationId },
      })

      // Payroll accrual context (Payroll Engine) — filled in below whenever a
      // patientPackageId is resolved, so the accrual call at the end of this
      // transaction can compute a PERCENTAGE rate's base amount and apply any
      // package-scoped TherapistRate, without a second lookup.
      let payrollPatientPackageId: string | null = appt.patientPackageId
      let payrollPackageId: string | null = null

      if (linkedSession) {
        // Map appointment status → therapy session status
        const sessionStatus = newStatus === 'scheduled' ? 'planned'
          : newStatus === 'confirmed' || newStatus === 'in_progress' ? 'in_progress'
          : newStatus === 'completed' ? 'completed'
          : newStatus === 'cancelled' ? 'cancelled'
          : newStatus === 'no_show' ? 'no_show'
          : newStatus === 'rescheduled' ? 'rescheduled'
          : undefined

        const sessionUpdateData: Record<string, unknown> = {}
        if (sessionStatus) sessionUpdateData.status = sessionStatus
        if (data.date) sessionUpdateData.date = new Date(data.date)
        if (data.startTime) sessionUpdateData.startTime = data.startTime
        if (data.endTime) sessionUpdateData.endTime = data.endTime
        if (data.notes !== undefined) sessionUpdateData.notes = data.notes

        // Sync session details from appointment completion
        if (newStatus === 'completed') {
          if (body.sessionFocus) sessionUpdateData.subjective = body.sessionFocus
          if (body.sessionRemarks) sessionUpdateData.notes = body.sessionRemarks
          // actualDuration is a TherapySession field, not Appointment
          if (typeof body.actualDuration === 'number' && body.actualDuration > 0) {
            sessionUpdateData.actualDuration = body.actualDuration
          }
        }

        if (Object.keys(sessionUpdateData).length > 0) {
          await tx.therapySession.update({
            where: { id: linkedSession.id },
            data: sessionUpdateData,
          })
        }

        // Update package balance when session is completed.
        // Prefer the RELIABLE direct link (Appointment.patientPackageId, set
        // at package-assignment time — see PackagesPage.tsx handleAssign).
        // Only fall back to fuzzy therapy-type matching for legacy
        // appointments that predate that link (manually created, or created
        // before this field existed) — this avoids the old fallback silently
        // linking to the WRONG package when a patient has 2+ active ones.
        if (becameCompleted) {
          let pkgId = appt.patientPackageId || linkedSession.patientPackageId

          if (!pkgId) {
            // No reliable link at all — find the patient's active package.
            // Try to match by therapy type first (assignment-level, then template).
            const sessionTherapy = linkedSession.therapyType || ''
            const candidates = await tx.patientPackage.findMany({
              where: {
                patientId: existing.patientId,
                status: 'active',
                organizationId,
              },
              include: { package: { select: { therapyType: true } } },
              orderBy: { createdAt: 'asc' },
            })
            // Prefer a package whose therapy type matches the session
            const match = candidates.find((p) => {
              const pType = p.therapyType ?? p.package?.therapyType ?? ''
              return pType && pType.toLowerCase() === sessionTherapy.toLowerCase()
            }) || candidates[0]

            if (match) pkgId = match.id
          }

          if (pkgId && !linkedSession.patientPackageId) {
            // Keep the TherapySession copy of the link in sync for any other
            // code path that still reads it.
            await tx.therapySession.update({
              where: { id: linkedSession.id },
              data: { patientPackageId: pkgId },
            })
          }

          if (pkgId) {
            const pp = await tx.patientPackage.findFirst({ where: { id: pkgId, organizationId } })
            if (pp) {
              payrollPatientPackageId = pp.id
              payrollPackageId = pp.packageId
              // The appointment is what package usage is counted from, so it
              // must carry the link too — a fuzzily-resolved package used to
              // be recorded on the session only.
              if (!appt.patientPackageId) {
                await tx.appointment.update({ where: { id: appt.id }, data: { patientPackageId: pp.id } })
                appt.patientPackageId = pp.id
              }
            }
          }
        } else if (leftCompleted) {
          // Undo a previous completion (explicit "Undo Completion", or a
          // reschedule/cancel applied to an already-completed session) —
          // give back the session it consumed. The recount below does this:
          // the appointment is no longer 'completed', so it drops out.
          if (!appt.patientPackageId && linkedSession.patientPackageId) {
            await tx.appointment.update({ where: { id: appt.id }, data: { patientPackageId: linkedSession.patientPackageId } })
            appt.patientPackageId = linkedSession.patientPackageId
          }
        }
      }

      // ── Package usage: recount, never ±1 ──
      // Recounted from the completed appointments (see lib/package-usage) on
      // any move into or out of completed. Idempotent, so saving a completed
      // appointment again, double-taps and racing requests can't drift it.
      // Bundled packages also recount the specific therapy-type block.
      if (becameCompleted || leftCompleted) {
        await syncPackageUsage(tx, organizationId, appt.patientPackageId)
        await syncBlockUsage(tx, organizationId, appt.patientPackageTherapyTypeId)
      }

      // ── Payroll accrual ──
      // Appointment.therapistId is, despite the name, a free-text therapist
      // NAME (see `where.therapistId = user.name` in GET above / the
      // `notifyTherapistByName` calls) — same convention as
      // Assessment/TherapySession.therapistName.
      if (newStatus === 'completed') {
        // appt.therapyType can be null for package-generated appointments
        // from before the package-assignment flow was fixed to always set it
        // (single-type, non-bundle packages used to leave it null) — fall
        // back to the linked package's own therapyType so those existing
        // sessions still resolve a rate instead of silently landing on the
        // un-rated "General" bucket.
        let serviceType = appt.therapyType
        if (!serviceType && payrollPatientPackageId) {
          const linkedPkg = await tx.patientPackage.findFirst({
            where: { id: payrollPatientPackageId, organizationId },
            select: { therapyType: true },
          })
          serviceType = linkedPkg?.therapyType ?? null
        }

        await accrueOnCompletion(tx, {
          organizationId,
          therapistName: appt.therapistId,
          sourceType: 'appointment',
          sourceId: appt.id,
          serviceType: serviceType || 'General',
          sessionDate: appt.date,
          packageId: payrollPackageId,
          branchId: appt.patient?.branchId ?? null,
          patientPackageId: payrollPatientPackageId,
        })
      }

      return appt
    })

    // ── ActivityLog for status actions.
    if ((newStatus && ADMIN_ONLY_STATUSES.has(newStatus)) || isRescheduleAction) {
      const actionMap: Record<string, string> = {
        rescheduled: 'appointment_rescheduled',
        cancelled: 'appointment_cancelled',
        completed: 'appointment_completed',
        no_show: 'appointment_no_show',
      }
      const logAction = isRescheduleAction ? 'appointment_rescheduled' : actionMap[newStatus as string]
      const detailParts: string[] = [
        `Appointment ${existing.id} (patient ${existing.patientId}) marked as ${newStatus}`,
      ]
      if (newStatus === 'cancelled') {
        const reason = typeof body.cancellationReason === 'string' ? body.cancellationReason.trim() : ''
        detailParts.push(`Reason: ${reason}`)
      }
      if (newStatus === 'completed') {
        detailParts.push(`Session Focus: ${data.sessionFocus}`)
        detailParts.push(`Goal Targeted: ${data.goalTargeted}`)
        detailParts.push(`Progress Achieved: ${data.progressAchieved}`)
        detailParts.push(`Remarks: ${data.sessionRemarks}`)
      }
      if (isRescheduleAction && (data.date || data.startTime || data.endTime)) {
        const newDate = data.date ? new Date(data.date) : existing.date
        const newStart = typeof data.startTime === 'string' ? data.startTime : existing.startTime
        const newEnd = typeof data.endTime === 'string' ? data.endTime : existing.endTime
        detailParts.push(`New slot: ${newDate.toISOString().slice(0, 10)} ${newStart}-${newEnd}`)
      }
      try {
        await db.activityLog.create({
          data: {
            userId: user.id,
            action: logAction,
            module: 'appointments',
            details: detailParts.join(' | '),
            organizationId,
          },
        })
      } catch (logErr) {
        console.error('ActivityLog write failed:', logErr)
      }
    }

    // A parent's pending reschedule request is settled by what staff actually
    // did: moving the slot approves it, cancelling the appointment closes it.
    // The parent is told through the notification just below.
    if ((isSlotChange && newStatus === 'scheduled') || newStatus === 'cancelled') {
      try {
        await db.rescheduleRequest.updateMany({
          where: { appointmentId: id, status: 'pending' },
          data: {
            status: newStatus === 'cancelled' ? 'cancelled' : 'approved',
            respondedBy: user.name,
            respondedAt: new Date(),
          },
        })
      } catch (reqErr) {
        console.error('Failed to settle reschedule request:', reqErr)
      }
    }

    if (newStatus === 'cancelled' || isRescheduleAction) {
      const label = newStatus === 'cancelled' ? 'Cancelled' : 'Rescheduled'
      const dateLabel = new Date(updated.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      await Promise.all([
        notifyPatientParent(organizationId ?? null, updated.patientId, {
          type: 'appointment',
          title: `Appointment ${label}`,
          message: `Your appointment on ${dateLabel} at ${updated.startTime} has been ${label.toLowerCase()}.`,
          link: 'parent-appointments',
        }),
        notifyTherapistByName(organizationId ?? null, updated.therapistId, {
          type: 'appointment',
          title: `Appointment ${label}`,
          message: `The appointment on ${dateLabel} at ${updated.startTime} has been ${label.toLowerCase()}.`,
          link: 'appointments',
        }),
      ])
    }

    if (newStatus === 'completed') {
      await recalcPatientStatus(updated.patientId)
    }

    return NextResponse.json(updated)
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof PayrollLockedError) {
      return NextResponse.json({ error: error.message }, { status: 423 })
    }
    console.error('Appointment update error:', error)
    return NextResponse.json({ error: 'Failed to update appointment' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (!canDeleteAppointments(user.role)) {
      return NextResponse.json({ error: 'Forbidden — only admins/receptionists can delete appointments' }, { status: 403 })
    }
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const existing = await db.appointment.findFirst({ where: { id, organizationId } })
    if (!existing) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }
    // Only cancelled appointments can be permanently deleted — this endpoint
    // backs the "Delete" option in the Cancelled Appointment popup only.
    if (existing.status !== 'cancelled') {
      return NextResponse.json({ error: 'Only cancelled appointments can be deleted' }, { status: 400 })
    }

    // Transaction: remove the appointment plus every record that references
    // it, so no orphans remain in Patient History / action logs anywhere.
    await db.$transaction([
      db.therapySession.deleteMany({ where: { appointmentId: id, organizationId } }),
      db.actionLog.deleteMany({ where: { module: 'appointments', recordId: id, organizationId } }),
      db.appointment.delete({ where: { id } }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Appointment delete error:', error)
    return NextResponse.json({ error: 'Failed to delete appointment' }, { status: 500 })
  }
}
