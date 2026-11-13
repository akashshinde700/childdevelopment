import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { recalcPatientStatus } from '@/lib/patient-status'
import { requireSessionUser } from '@/lib/session'
import { notifyPatientParent } from '@/lib/notifications'
import { syncPatientPackageDiscountFromInvoices, packageIdsFromInvoiceItems } from '@/lib/package-billing'

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
    const status = searchParams.get('status') || ''
    const type = searchParams.get('type') || ''
    const date = searchParams.get('date') || '' // single day, e.g. "2026-07-04"
    const fromDate = searchParams.get('fromDate') || ''
    const toDate = searchParams.get('toDate') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = { organizationId }
    if (search) {
      where.OR = [
        { invoiceNo: { contains: search } },
        { patient: { childName: { contains: search } } },
        { patient: { patientId: { contains: search } } },
        { notes: { contains: search } },
      ]
    }
    if (patientId) where.patientId = patientId
    if (status) where.status = status
    if (type) where.type = type
    if (date) {
      const dayStart = new Date(`${date}T00:00:00`)
      const dayEnd = new Date(`${date}T00:00:00`)
      dayEnd.setDate(dayEnd.getDate() + 1)
      where.date = { gte: dayStart, lt: dayEnd }
    } else if (fromDate || toDate) {
      const dateFilter: Record<string, Date> = {}
      if (fromDate) dateFilter.gte = new Date(`${fromDate}T00:00:00.000Z`)
      if (toDate) dateFilter.lte = new Date(`${toDate}T23:59:59.999Z`)
      where.date = dateFilter
    }

    const [invoices, total] = await Promise.all([
      db.invoice.findMany({
        where,
        include: {
          // The printed invoice fills Bill To from these (contact, address) and
          // the WhatsApp link needs the parent's number — selecting only
          // childName/patientId left those blank on every invoice.
          patient: {
            select: {
              childName: true, patientId: true, mobile: true,
              parentName: true, fatherName: true, motherName: true,
              address: true, city: true,
            },
          },
          invoiceItems: { orderBy: { id: 'asc' } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.invoice.count({ where }),
    ])

    return NextResponse.json({ invoices, total, page, limit })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
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

    // Validate subtotal >= 0
    if (body.subtotal !== undefined && body.subtotal < 0) {
      return NextResponse.json(
        { error: 'Subtotal must be greater than or equal to 0.' },
        { status: 400 }
      )
    }

    // Validate discount >= 0
    if (body.discount !== undefined && body.discount < 0) {
      return NextResponse.json(
        { error: 'Discount must be greater than or equal to 0.' },
        { status: 400 }
      )
    }

    // Validate invoice items — at least one line item (package or service)
    // is required, quantity must be > 0, and unit price/amount can't be negative.
    const hasAnyItem = Array.isArray(body.items) && body.items.some((item: { description?: string }) => item?.description?.trim())
    if (!hasAnyItem) {
      return NextResponse.json({ error: 'At least one line item is required.' }, { status: 400 })
    }
    if (body.items && Array.isArray(body.items)) {
      for (let i = 0; i < body.items.length; i++) {
        const item = body.items[i]
        if (!item.description?.trim()) continue
        if (item.quantity !== undefined && Number(item.quantity) <= 0) {
          return NextResponse.json(
            { error: `Item ${i + 1}: Quantity must be greater than 0.` },
            { status: 400 }
          )
        }
        if (item.rate !== undefined && item.rate < 0) {
          return NextResponse.json(
            { error: `Item ${i + 1}: Rate must be greater than or equal to 0.` },
            { status: 400 }
          )
        }
        if (item.amount !== undefined && item.amount < 0) {
          return NextResponse.json(
            { error: `Item ${i + 1}: Amount must be greater than or equal to 0.` },
            { status: 400 }
          )
        }
      }
    }

    // Discount cannot exceed the subtotal.
    if (body.subtotal !== undefined && body.discount !== undefined && Number(body.discount) > Number(body.subtotal)) {
      return NextResponse.json({ error: 'Discount cannot exceed the subtotal.' }, { status: 400 })
    }

    // Generate invoice number
    const lastInvoice = await db.invoice.findFirst({ where: { organizationId }, orderBy: { createdAt: 'desc' }, select: { invoiceNo: true } })
    let nextNum = 1
    if (lastInvoice?.invoiceNo) {
      const num = parseInt(lastInvoice.invoiceNo.replace('INV-', ''))
      if (!isNaN(num)) nextNum = num + 1
    }

    const { items, ...invoiceData } = body
    const subtotal = invoiceData.subtotal || 0
    const discount = invoiceData.discount || 0
    const cgst = invoiceData.cgst || 0
    const sgst = invoiceData.sgst || 0
    const totalAmount = subtotal - discount + cgst + sgst

    // Validate totalAmount >= 0
    if (totalAmount < 0) {
      return NextResponse.json(
        { error: 'Total amount must be greater than or equal to 0.' },
        { status: 400 }
      )
    }

    const amountPaid = invoiceData.amountPaid || 0

    // Accept an optional client-supplied invoice date (ISO or yyyy-MM-dd);
    // fall back to the schema default (now()) when absent/invalid.
    let invoiceDate: Date | undefined
    if (invoiceData.date) {
      const d = new Date(invoiceData.date)
      if (!isNaN(d.getTime())) invoiceDate = d
    }

    // ── Package-linked invoicing (INVOICE-PACKAGE-AUTO) ──
    // When a patientPackageId is supplied, the invoice is linked to that
    // specific PatientPackage assignment. The amount paid is recorded as a
    // Payment record scoped to that package so the package's billing
    // (amountPaid / dueAmount / paymentStatus) stays accurate and there is
    // no cross-contamination between packages.
    const patientPackageId = typeof body.patientPackageId === 'string' ? body.patientPackageId : null

    const balanceDue = totalAmount - amountPaid

    const invoice = await db.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          invoiceNo: `INV-${String(nextNum).padStart(4, '0')}`,
          patientId: invoiceData.patientId,
          branchId: invoiceData.branchId || null,
          ...(invoiceDate ? { date: invoiceDate } : {}),
          type: invoiceData.type || 'invoice',
          subtotal: invoiceData.subtotal || 0,
          discount: invoiceData.discount || 0,
          gstApplicable: invoiceData.gstApplicable || false,
          cgst: invoiceData.cgst || 0,
          sgst: invoiceData.sgst || 0,
          gstNumber: invoiceData.gstNumber,
          totalAmount,
          amountPaid,
          balanceDue: Math.max(0, balanceDue),
          paymentMode: invoiceData.paymentMode,
          status: balanceDue <= 0 ? 'paid' : amountPaid > 0 ? 'partially_paid' : 'pending',
          notes: invoiceData.notes,
          organizationId,
          invoiceItems: items ? {
            create: items
              .filter((item: { description?: string }) => item.description?.trim())
              .map((item: { type?: string; referenceId?: string; description: string; quantity: number; rate: number; amount: number }) => ({
                type: item.type || 'service',
                referenceId: item.referenceId || null,
                description: item.description,
                quantity: item.quantity,
                rate: item.rate,
                amount: item.amount,
                organizationId,
              })),
          } : undefined,
        },
        include: { invoiceItems: true },
      })

      // Create a package-scoped Payment record for the amount paid so the
      // package's billing reflects this invoice's payment.
      if (patientPackageId && amountPaid > 0) {
        const validPatientPackage = await tx.patientPackage.findFirst({
          where: { id: patientPackageId, organizationId },
          select: { id: true, patientId: true },
        })

        if (!validPatientPackage || validPatientPackage.patientId !== invoiceData.patientId) {
          console.warn('Skipping payment creation: invalid or mismatched patientPackageId', {
            patientPackageId,
            invoicePatientId: invoiceData.patientId,
            validPatientPackage,
          })
        } else {
          const lastPayment = await tx.payment.findFirst({ where: { organizationId }, orderBy: { createdAt: 'desc' }, select: { paymentNo: true } })
          let payNum = 1
          if (lastPayment?.paymentNo) {
            const n = parseInt(lastPayment.paymentNo.replace('PAY-', ''))
            if (!isNaN(n)) payNum = n + 1
          }
          await tx.payment.create({
            data: {
              paymentNo: `PAY-${String(payNum).padStart(4, '0')}`,
              patientId: invoiceData.patientId,
              invoiceId: inv.id,
              patientPackageId,
              amount: amountPaid,
              paymentMode: invoiceData.paymentMode || 'cash',
              type: 'payment',
              status: 'completed',
              notes: `Payment for invoice ${inv.invoiceNo}`,
              organizationId,
            },
          })
        }
      }

      // Keep every billed package's discount/netAmount in sync with this
      // invoice's discount — independent of whether anything has been paid
      // yet (see syncPatientPackageDiscountFromInvoices for why).
      for (const pkgId of packageIdsFromInvoiceItems(inv.invoiceItems)) {
        await syncPatientPackageDiscountFromInvoices(tx, pkgId)
      }

      return inv
    })

    if (amountPaid > 0) {
      await notifyPatientParent(organizationId ?? null, invoice.patientId, {
        type: 'payment',
        title: 'Payment Received',
        message: `A payment of ₹${amountPaid.toLocaleString('en-IN')} has been recorded against invoice ${invoice.invoiceNo}.`,
        link: 'parent-payments',
      })
    }

    // Money just came in: a session-wise patient with a recently completed
    // session becomes "active" immediately rather than on the next
    // patients-list sweep. Best-effort — never fail the write over it.
    try { await recalcPatientStatus(invoice.patientId) } catch { /* status is self-healing */ }

    return NextResponse.json(invoice, { status: 201 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Invoice create error:', error)
    return NextResponse.json({ error: (error instanceof Error ? error.message : 'Failed to create invoice') }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'receptionist') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { id, items, patientPackageId, ...rest } = body
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const ownedInvoice = await db.invoice.findFirst({ where: { id, organizationId } })
    if (!ownedInvoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    // Build updateData from an allowlist of Invoice fields only.
    // (Rejecting unknown / relation fields prevents Prisma from throwing on
    //  unrecognized keys — the root cause of the 500 error on Edit Invoice.)
    const updateData: Record<string, unknown> = {}
    const stringFields = ['patientId', 'branchId', 'type', 'gstNumber', 'paymentMode', 'notes', 'status']
    const numericFields = ['subtotal', 'discount', 'cgst', 'sgst', 'totalAmount', 'amountPaid', 'balanceDue']

    for (const f of stringFields) {
      if (rest[f] !== undefined) updateData[f] = rest[f] === null ? null : String(rest[f])
    }
    for (const f of numericFields) {
      if (rest[f] !== undefined) updateData[f] = Number(rest[f])
    }
    if (rest['gstApplicable'] !== undefined) updateData['gstApplicable'] = Boolean(rest['gstApplicable'])
    if (rest['date'] !== undefined) {
      // Accept ISO strings or yyyy-MM-dd; store as Date
      const d = new Date(rest['date'])
      if (!isNaN(d.getTime())) updateData['date'] = d
    }

    // Reconcile status with balanceDue / amountPaid if they were updated.
    // (Mirrors the POST handler's status-derivation logic so an edit that
    //  changes payment keeps the status in sync.)
    if ('amountPaid' in updateData || 'totalAmount' in updateData || 'balanceDue' in updateData) {
      const totalAmount = 'totalAmount' in updateData ? Number(updateData.totalAmount) : Number(rest._existingTotal ?? 0)
      const amountPaid = 'amountPaid' in updateData ? Number(updateData.amountPaid) : Number(rest._existingPaid ?? 0)
      const balanceDue = Math.max(0, totalAmount - amountPaid)
      updateData.balanceDue = balanceDue
      // Don't override an explicit status the client may have sent.
      if (!('status' in updateData)) {
        updateData.status = balanceDue <= 0 ? 'paid' : amountPaid > 0 ? 'partially_paid' : 'pending'
      }
    }

    // If a non-empty line-items array was explicitly provided, replace the
    // existing set (delete + recreate). When the client only edits payment
    // fields (amountPaid / status) and sends no items — or sends an empty
    // array — we leave the line items untouched so a payment edit never
    // wipes the invoice's line items. (INVOICE-LINE-ITEM-FIX)
    const hasItems = Array.isArray(items) && items.length > 0

    const invoice = await db.$transaction(async (tx) => {
      if (hasItems) {
        await tx.invoiceItem.deleteMany({ where: { invoiceId: id, organizationId } })
      }

      const updated = await tx.invoice.update({
        where: { id },
        data: {
          ...updateData,
          invoiceItems: hasItems
            ? {
                create: items.map((item: { type?: string; referenceId?: string; description: string; quantity: number; rate: number; amount: number }) => ({
                  type: item.type || 'service',
                  referenceId: item.referenceId || null,
                  description: String(item.description ?? ''),
                  quantity: Number(item.quantity ?? 1),
                  rate: Number(item.rate ?? 0),
                  amount: Number(item.amount ?? 0),
                })),
              }
            : undefined,
        },
        include: { invoiceItems: true },
      })

      // ── Reconcile the package-scoped Payment record (ROOT FIX) ──
      // POST creates a Payment row scoped to (invoiceId, patientPackageId)
      // so a package's billing (amountPaid/dueAmount/paymentStatus) reflects
      // its invoice. This PUT handler previously never touched that Payment
      // at all — editing an invoice's amountPaid (e.g. to add a discount and
      // record a partial payment) silently left every package-linked
      // aggregate (Packages list, Patient History, Patient Profile) exactly
      // as it was before the edit, still showing the pre-edit "pending"
      // state and "no payments found" even though the invoice itself showed
      // the new amount correctly. Keep it in sync the same way POST does.
      if ('amountPaid' in updateData) {
        const newAmountPaid = Number(updateData.amountPaid)
        const existingPayment = await tx.payment.findFirst({
          where: { invoiceId: id, type: 'payment', status: 'completed', organizationId },
        })
        const effectivePackageId: string | null =
          typeof patientPackageId === 'string' && patientPackageId
            ? patientPackageId
            : existingPayment?.patientPackageId ?? null

        if (newAmountPaid <= 0) {
          if (existingPayment) {
            await tx.payment.delete({ where: { id: existingPayment.id } })
          }
        } else if (existingPayment) {
          await tx.payment.update({
            where: { id: existingPayment.id },
            data: { amount: newAmountPaid, ...(effectivePackageId ? { patientPackageId: effectivePackageId } : {}) },
          })
        } else if (effectivePackageId) {
          const lastPayment = await tx.payment.findFirst({ where: { organizationId }, orderBy: { createdAt: 'desc' }, select: { paymentNo: true } })
          let payNum = 1
          if (lastPayment?.paymentNo) {
            const n = parseInt(lastPayment.paymentNo.replace('PAY-', ''))
            if (!isNaN(n)) payNum = n + 1
          }
          await tx.payment.create({
            data: {
              paymentNo: `PAY-${String(payNum).padStart(4, '0')}`,
              patientId: updated.patientId,
              invoiceId: id,
              patientPackageId: effectivePackageId,
              amount: newAmountPaid,
              paymentMode: updated.paymentMode || 'cash',
              type: 'payment',
              status: 'completed',
              notes: `Payment for invoice ${updated.invoiceNo}`,
              organizationId,
            },
          })
        }
      }

      // Keep every billed package's discount/netAmount in sync with this
      // invoice's (possibly just-edited) discount.
      for (const pkgId of packageIdsFromInvoiceItems(updated.invoiceItems)) {
        await syncPatientPackageDiscountFromInvoices(tx, pkgId)
      }

      return updated
    })

    try { await recalcPatientStatus(invoice.patientId) } catch { /* status is self-healing */ }

    return NextResponse.json(invoice)
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Invoice update error:', error)
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
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
    const owned = await db.invoice.findFirst({ where: { id, organizationId } })
    if (!owned) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    // Hard delete, per explicit request — permanently removes the invoice
    // (InvoiceItem cascades). Payment.invoiceId is a loose string reference
    // (no FK), so any payments already recorded against this invoice are
    // unlinked rather than left pointing at a row that no longer exists.
    await db.$transaction([
      db.payment.updateMany({ where: { invoiceId: id, organizationId }, data: { invoiceId: null } }),
      db.invoice.delete({ where: { id } }),
    ])
    return NextResponse.json({ success: true })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 })
  }
}
