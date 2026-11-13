/**
 * Shared Payment Status Logic
 *
 * Used across: Patient History, Dashboard, Billing & Invoices, Payments
 *
 * Business Rules:
 * 1. No package AND no invoice → "Not Enrolled"
 * 2. Invoice exists, outstanding = 0 → "Paid"
 * 3. Invoice exists, paid = 0, outstanding > 0 → "Pending"
 * 4. Invoice exists, paid > 0, outstanding > 0 → "Partially Paid"
 * 5. Due date passed, balance remains → "Overdue"
 */

export type PaymentStatus = 'Not Enrolled' | 'Paid' | 'Pending' | 'Partially Paid' | 'Overdue' | 'N/A'

export interface PaymentStatusInput {
  totalPackageAmount: number
  totalAmountPaid: number
  pendingAmount: number
  hasInvoices?: boolean
  hasPackages?: boolean
  invoiceDueDate?: string | null
}

/**
 * Calculate payment status based on package/invoice data.
 *
 * NEVER returns "Paid" when there is no package and no invoice.
 * A patient with ₹0 everywhere is "Not Enrolled", not "Paid".
 */
export function getPaymentStatus(input: PaymentStatusInput): PaymentStatus {
  const {
    totalPackageAmount = 0,
    totalAmountPaid = 0,
    pendingAmount = 0,
    hasInvoices = false,
    hasPackages = false,
    invoiceDueDate = null,
  } = input

  // 1. No package AND no invoice → Not Enrolled
  if (!hasPackages && !hasInvoices && totalPackageAmount === 0) {
    return 'Not Enrolled'
  }

  // 2. Outstanding = 0 (and there IS a package or invoice) → Paid
  if (pendingAmount <= 0) {
    return 'Paid'
  }

  // 3. Paid = 0, outstanding > 0 → Pending
  if (totalAmountPaid === 0) {
    // 5. Check if due date has passed → Overdue
    if (invoiceDueDate) {
      const dueDate = new Date(invoiceDueDate)
      const now = new Date()
      if (dueDate < now && pendingAmount > 0) {
        return 'Overdue'
      }
    }
    return 'Pending'
  }

  // 4. Paid > 0, outstanding > 0 → Partially Paid
  // 5. Check if due date has passed → Overdue
  if (invoiceDueDate) {
    const dueDate = new Date(invoiceDueDate)
    const now = new Date()
    if (dueDate < now && pendingAmount > 0) {
      return 'Overdue'
    }
  }

  return 'Partially Paid'
}

/**
 * Get badge variant for a payment status.
 */
export function getPaymentStatusVariant(status: PaymentStatus): 'success' | 'warning' | 'destructive' | 'secondary' | 'default' {
  switch (status) {
    case 'Paid':
      return 'success'
    case 'Pending':
      return 'warning'
    case 'Partially Paid':
      return 'default'
    case 'Overdue':
      return 'destructive'
    case 'Not Enrolled':
      return 'secondary'
    default:
      return 'secondary'
  }
}

/**
 * Get Tailwind classes for a payment status badge.
 */
export function getPaymentStatusClasses(status: PaymentStatus): string {
  switch (status) {
    case 'Paid':
      return 'bg-green-100 text-green-700 border-green-200'
    case 'Pending':
      return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'Partially Paid':
      return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'Overdue':
      return 'bg-red-100 text-red-700 border-red-200'
    case 'Not Enrolled':
      return 'bg-gray-100 text-gray-500 border-gray-200'
    default:
      return 'bg-gray-100 text-gray-500 border-gray-200'
  }
}
