import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    if (user.role === 'parent') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''

    if (!query || query.trim().length < 1) {
      return NextResponse.json({ results: [] })
    }

    const search = query.trim()
    const limit = 5 // max results per category
    const organizationId = user.organizationId

    // Search across multiple entities in parallel
    const [patients, invoices, payments, employees, leads] = await Promise.all([
      // Patients
      db.patient.findMany({
        where: {
          organizationId,
          isDeleted: false,
          OR: [
            { childName: { contains: search } },
            { patientId: { contains: search } },
            { mobile: { contains: search } },
            { fatherName: { contains: search } },
            { motherName: { contains: search } },
          ],
        },
        select: { id: true, patientId: true, childName: true, mobile: true, status: true },
        take: limit,
      }).catch(() => []),

      // Invoices
      db.invoice.findMany({
        where: {
          organizationId,
          OR: [
            { invoiceNo: { contains: search } },
            { patient: { childName: { contains: search } } },
            { patient: { patientId: { contains: search } } },
            { notes: { contains: search } },
          ],
        },
        select: {
          id: true, invoiceNo: true, totalAmount: true, status: true, date: true,
          patient: { select: { childName: true } },
        },
        take: limit,
      }).catch(() => []),

      // Payments
      db.payment.findMany({
        where: {
          organizationId,
          OR: [
            { paymentNo: { contains: search } },
            { patient: { childName: { contains: search } } },
            { patient: { patientId: { contains: search } } },
            { referenceNo: { contains: search } },
          ],
        },
        select: {
          id: true, paymentNo: true, amount: true, paymentMode: true, date: true,
          patient: { select: { childName: true } },
        },
        take: limit,
      }).catch(() => []),

      // Employees (admin and super_admin only)
      (user.role === 'admin' || user.role === 'super_admin')
        ? db.employee.findMany({
            where: {
              organizationId,
              OR: [
                { name: { contains: search } },
                { employeeId: { contains: search } },
                { mobile: { contains: search } },
                { designation: { contains: search } },
              ],
            },
            select: { id: true, employeeId: true, name: true, designation: true, status: true },
            take: limit,
          }).catch(() => [])
        : Promise.resolve([]),

      // Leads
      (user.role === 'admin' || user.role === 'super_admin')
        ? db.lead.findMany({
            where: {
              organizationId,
              OR: [
                { name: { contains: search } },
                { mobile: { contains: search } },
                { childName: { contains: search } },
              ],
            },
            select: { id: true, name: true, mobile: true, status: true, source: true },
            take: limit,
          }).catch(() => [])
        : Promise.resolve([]),
    ])

    const results: Record<string, unknown[]> = {}

    if (patients.length > 0) results.patients = patients
    if (invoices.length > 0) results.invoices = invoices
    if (payments.length > 0) results.payments = payments
    if (employees.length > 0) results.employees = employees
    if (leads.length > 0) results.leads = leads

    return NextResponse.json({ results })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
