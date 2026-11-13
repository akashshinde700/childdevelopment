import { db } from '@/lib/db'

// Same shape the rest of the app uses for a transaction handle (see
// payroll-accrual.ts) — the extended client's tx isn't Prisma.TransactionClient.
type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

/**
 * Raise the invoice for a pay-per-session charge.
 *
 * Patients on a package are billed through the package; patients who pay
 * session by session are charged here, at the moment the session is booked.
 * The charge becomes an ordinary Invoice so it shows up in Billing, counts
 * toward the patient's outstanding balance, and can be paid from there —
 * nothing about session fees needs its own parallel billing screen.
 *
 * Marked paid up front (cash handed over at the desk) also writes the
 * Payment row, so Payments and the patient's "received" totals match.
 */
export async function createSessionInvoice(
  tx: TxClient,
  params: {
    organizationId: string | null | undefined
    patientId: string
    fee: number
    paid: boolean
    paymentMode?: string | null
    description: string
    date: Date
    branchId?: string | null
  }
): Promise<{ invoiceId: string; invoiceNo: string } | null> {
  const organizationId = params.organizationId ?? null
  const fee = Number(params.fee)
  if (!Number.isFinite(fee) || fee <= 0) return null

  const lastInvoice = await tx.invoice.findFirst({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: { invoiceNo: true },
  })
  let nextNum = 1
  if (lastInvoice?.invoiceNo) {
    const n = parseInt(lastInvoice.invoiceNo.replace('INV-', ''))
    if (!isNaN(n)) nextNum = n + 1
  }
  const invoiceNo = `INV-${String(nextNum).padStart(4, '0')}`
  const amountPaid = params.paid ? fee : 0

  const invoice = await tx.invoice.create({
    data: {
      invoiceNo,
      patientId: params.patientId,
      branchId: params.branchId ?? null,
      date: params.date,
      type: 'invoice',
      subtotal: fee,
      discount: 0,
      gstApplicable: false,
      totalAmount: fee,
      amountPaid,
      balanceDue: fee - amountPaid,
      paymentMode: params.paid ? (params.paymentMode || 'cash') : null,
      status: params.paid ? 'paid' : 'pending',
      notes: 'Pay-per-session charge',
      organizationId,
      invoiceItems: {
        create: [{
          // 'service' (not 'package') — this charge is not tied to a package
          // assignment, which is exactly what makes it a session-wise one.
          type: 'service',
          description: params.description,
          quantity: 1,
          rate: fee,
          amount: fee,
          organizationId,
        }],
      },
    },
    select: { id: true, invoiceNo: true },
  })

  if (params.paid) {
    const lastPayment = await tx.payment.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { paymentNo: true },
    })
    let payNum = 1
    if (lastPayment?.paymentNo) {
      const n = parseInt(lastPayment.paymentNo.replace('PAY-', ''))
      if (!isNaN(n)) payNum = n + 1
    }
    await tx.payment.create({
      data: {
        paymentNo: `PAY-${String(payNum).padStart(4, '0')}`,
        patientId: params.patientId,
        invoiceId: invoice.id,
        amount: fee,
        paymentMode: params.paymentMode || 'cash',
        type: 'payment',
        status: 'completed',
        date: params.date,
        notes: `Payment for invoice ${invoice.invoiceNo}`,
        organizationId,
      },
    })
  }

  return { invoiceId: invoice.id, invoiceNo: invoice.invoiceNo }
}
