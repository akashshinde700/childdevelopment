import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { recalcPatientStatus } from '@/lib/patient-status'
import { requireSessionUser } from '@/lib/session'

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'receptionist') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const patientId = searchParams.get('patientId') || ''
    const patientPackageId = searchParams.get('patientPackageId') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = { organizationId }
    if (search) {
      where.OR = [
        { paymentNo: { contains: search } },
        { patient: { childName: { contains: search } } },
        { patient: { patientId: { contains: search } } },
        { referenceNo: { contains: search } },
        { notes: { contains: search } },
      ]
    }
    if (patientId) where.patientId = patientId
    if (patientPackageId) where.patientPackageId = patientPackageId

    // Payment mode filter
    const paymentMode = searchParams.get('paymentMode') || ''
    if (paymentMode) where.paymentMode = paymentMode

    // Status filter
    const status = searchParams.get('status') || ''
    if (status) where.status = status

    // Payment type filter (Task 69)
    const type = searchParams.get('type') || ''
    if (type) where.type = type

    // Date range filter (Task 69) — startDate / endDate (inclusive, ISO yyyy-mm-dd)
    const startDateStr = searchParams.get('startDate') || ''
    const endDateStr = searchParams.get('endDate') || ''
    if (startDateStr || endDateStr) {
      const dateFilter: Record<string, Date> = {}
      if (startDateStr) {
        const d = new Date(startDateStr)
        if (!isNaN(d.getTime())) dateFilter.gte = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      }
      if (endDateStr) {
        const d = new Date(endDateStr)
        if (!isNaN(d.getTime())) dateFilter.lt = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
      }
      where.date = dateFilter
    }

    // Today's date range
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)

    // This month's date range
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1)

    // For summary calculations, only count completed payments (exclude failed/refunded)
    const completedWhere = { ...where, status: 'completed' }

    // Pending amount: sum of all payment amounts where status !== 'completed'
    // (used for "Total Pending Amount" summary card). This is a raw sum of payment
    // amounts themselves (no balance tracking) so it reflects pending collections.
    const pendingWhere = { ...where, status: { not: 'completed' } }

    // Advance balance: sum of all advance-type payments (regardless of status)
    const advanceWhere = { ...where, type: 'advance', status: 'completed' }

    const [payments, total, summary, todaySummary, monthSummary, pendingSummary, advanceSummary, todayCount] = await Promise.all([
      db.payment.findMany({
        where,
        include: {
          patient: { select: { childName: true, patientId: true, mobile: true } },
          branch: { select: { name: true, code: true } },
          patientPackage: { select: { id: true, name: true, package: { select: { name: true } } } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.payment.count({ where }),
      db.payment.aggregate({ _sum: { amount: true }, where: completedWhere }),
      db.payment.aggregate({
        _sum: { amount: true },
        where: { date: { gte: todayStart, lt: todayEnd }, ...completedWhere },
      }),
      db.payment.aggregate({
        _sum: { amount: true },
        where: { date: { gte: monthStart, lt: monthEnd }, ...completedWhere },
      }),
      // Pending amount
      db.payment.aggregate({ _sum: { amount: true }, where: pendingWhere }),
      // Advance balance
      db.payment.aggregate({ _sum: { amount: true }, where: advanceWhere }),
      // Today's transaction count (all statuses)
      db.payment.count({ where: { date: { gte: todayStart, lt: todayEnd }, ...where } }),
    ])

    return NextResponse.json({
      payments,
      total,
      page,
      limit,
      totalCollected: summary._sum.amount || 0,
      todayCollection: todaySummary._sum.amount || 0,
      monthCollection: monthSummary._sum.amount || 0,
      pendingAmount: pendingSummary._sum.amount || 0,
      advanceBalance: advanceSummary._sum.amount || 0,
      todayCount,
    })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'receptionist') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()

    // Validate payment amount is greater than 0
    if (!body.amount || body.amount <= 0) {
      return NextResponse.json(
        { error: 'Payment amount must be greater than 0.' },
        { status: 400 }
      )
    }

    // If payment is linked to an invoice, check that amount doesn't exceed balance due
    if (body.invoiceId) {
      const invoice = await db.invoice.findFirst({ where: { id: body.invoiceId, organizationId } })
      if (invoice) {
        const balanceDue = invoice.balanceDue || 0
        if (body.amount > balanceDue) {
          return NextResponse.json(
            { error: `Payment amount (₹${body.amount}) exceeds the invoice balance due (₹${balanceDue}). Maximum allowed payment is ₹${balanceDue}.` },
            { status: 400 }
          )
        }
      }
    }

    const payment = await db.$transaction(async (tx) => {
      const lastPayment = await tx.payment.findFirst({ where: { organizationId }, orderBy: { createdAt: 'desc' }, select: { paymentNo: true } })
      let nextNum = 1
      if (lastPayment?.paymentNo) {
        const num = parseInt(lastPayment.paymentNo.replace('PAY-', ''))
        if (!isNaN(num)) nextNum = num + 1
      }

      const created = await tx.payment.create({
        data: {
          paymentNo: `PAY-${String(nextNum).padStart(4, '0')}`,
          patientId: body.patientId,
          invoiceId: body.invoiceId,
          patientPackageId: body.patientPackageId || null,
          amount: body.amount,
          paymentMode: body.paymentMode,
          referenceNo: body.referenceNo,
          type: body.type || 'payment',
          notes: body.notes,
          organizationId,
        },
      })

      // Update invoice if linked — same transaction as the payment write so
      // the two can never diverge on partial failure.
      if (body.invoiceId) {
        const invoice = await tx.invoice.findFirst({ where: { id: body.invoiceId, organizationId } })
        if (invoice) {
          const newPaid = (invoice.amountPaid || 0) + body.amount
          const newBalance = Math.max(0, invoice.totalAmount - newPaid)
          await tx.invoice.update({
            where: { id: body.invoiceId },
            data: {
              amountPaid: newPaid,
              balanceDue: newBalance,
              status: newBalance <= 0 ? 'paid' : 'partially_paid',
            },
          })
        }
      }

      return created
    })

    // Money just came in: a session-wise patient with a recently completed
    // session becomes "active" immediately rather than on the next
    // patients-list sweep. Best-effort — never fail the write over it.
    try { await recalcPatientStatus(payment.patientId) } catch { /* status is self-healing */ }

    return NextResponse.json(payment, { status: 201 })
  } catch (error) {
    console.error('Payment create error:', error)
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    // Find the payment first to check for linked invoice
    const payment = await db.payment.findFirst({ where: { id, organizationId } })
    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    await db.$transaction(async (tx) => {
      // If linked to an invoice, update the invoice's amountPaid and balanceDue
      // in the same transaction as the payment removal so they can never
      // diverge on partial failure.
      if (payment.invoiceId) {
        const invoice = await tx.invoice.findFirst({ where: { id: payment.invoiceId, organizationId } })
        if (invoice) {
          const newPaid = Math.max(0, (invoice.amountPaid || 0) - payment.amount)
          const newBalance = Math.max(0, invoice.totalAmount - newPaid)
          await tx.invoice.update({
            where: { id: payment.invoiceId },
            data: {
              amountPaid: newPaid,
              balanceDue: newBalance,
              status: newBalance <= 0 ? 'paid' : newPaid > 0 ? 'partially_paid' : 'pending',
            },
          })
        }
      }

      // Hard delete, per explicit request — permanently removes the row.
      await tx.payment.delete({ where: { id } })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete payment' }, { status: 500 })
  }
}
