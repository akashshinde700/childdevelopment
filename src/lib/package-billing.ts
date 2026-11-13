import type { db } from './db'

// Derived directly from `db.$transaction`'s own callback parameter type
// (rather than a hand-written union of Prisma's generic client types) so it
// always matches exactly what `db`'s soft-delete query extension actually
// produces at every call site — a hand-rolled `PrismaClient | Prisma.
// TransactionClient` union does NOT structurally match an extended client.
type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

// A PatientPackage's `discountAmount`/`netAmount` are an assignment-time
// snapshot (set when the package was first assigned, e.g. via the "Assign
// Package" wizard's own Discount field). In real usage, though, discounts
// are usually applied later — at billing time, on the Invoice raised for
// that package.
//
// Every screen that shows a package's amount owed (Packages list, Patient
// History list, Patient Profile) all read PatientPackage.netAmount /
// discountAmount / amountPaid as their one source of truth — so instead of
// teaching each of those read-paths a second, invoice-aware calculation
// (which is how "Package Summary showed the full ₹9,600 price with a false
// 'Pending' status" and "Patient History showed ₹6,000 outstanding instead
// of ₹5,000" both happened — the invoice's ₹1,000 discount existed nowhere
// on the package side), this keeps PatientPackage itself as the single
// source of truth and syncs it FROM its linked invoices whenever one of
// them is created or edited.
//
// The join to "which invoices bill this package" is InvoiceItem
// (type: 'package', referenceId: patientPackageId) — a permanent line-item
// record set at invoice-creation time, present regardless of how much (if
// anything) has been paid yet. This is used instead of Payment.
// patientPackageId, which only exists once an amountPaid > 0 payment has
// actually been recorded — a discount must apply immediately, before any
// payment is made.
export async function syncPatientPackageDiscountFromInvoices(
  tx: TxClient,
  patientPackageId: string
): Promise<void> {
  // Tenant scope is derived from the package row itself (single source of
  // truth) so callers don't need to thread organizationId through — and the
  // invoiceItem/invoice lookups below stay inside that package's clinic.
  const pkg = await tx.patientPackage.findUnique({
    where: { id: patientPackageId },
    select: { totalAmount: true, discountAmount: true, organizationId: true },
  })
  if (!pkg) return

  const items = await tx.invoiceItem.findMany({
    where: { type: 'package', referenceId: patientPackageId, organizationId: pkg.organizationId },
    select: { invoiceId: true },
  })
  const invoiceIds = [...new Set(items.map((i) => i.invoiceId))]
  if (invoiceIds.length === 0) return

  const linkedInvoices = await tx.invoice.findMany({
    where: { id: { in: invoiceIds }, status: { not: 'cancelled' }, organizationId: pkg.organizationId },
    select: { discount: true },
  })
  const totalDiscount = linkedInvoices.reduce((sum, inv) => sum + (inv.discount || 0), 0)

  if (pkg.discountAmount === totalDiscount) return

  const netAmount = Math.max(0, pkg.totalAmount - totalDiscount)
  await tx.patientPackage.update({
    where: { id: patientPackageId },
    data: { discountAmount: totalDiscount, netAmount },
  })
}

/** Every distinct PatientPackage referenced by this invoice's package-type line items. */
export function packageIdsFromInvoiceItems(invoiceItems: Array<{ type: string; referenceId: string | null }>): string[] {
  return [...new Set(
    invoiceItems
      .filter((it) => it.type === 'package' && it.referenceId)
      .map((it) => it.referenceId as string)
  )]
}
