import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { createNotification } from '@/lib/notifications'

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const category = searchParams.get('category') || ''
    const status = searchParams.get('status') || ''
    const fromDate = searchParams.get('fromDate') || ''
    const toDate = searchParams.get('toDate') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = { organizationId }
    if (search) {
      where.OR = [
        { description: { contains: search } },
        { vendor: { contains: search } },
        { category: { contains: search } },
      ]
    }
    // Category filter: handle both lowercase snake_case and legacy Title Case values
    // e.g., "rent" should match both "rent" and "Rent" in DB
    if (category) {
      const titleCase = category.replace(/(^|_)(\w)/g, (_, _sep, c) => c.toUpperCase())
      const snakeToSpace = category.replace(/_/g, ' ')
      const snakeToSpaceTitle = snakeToSpace.replace(/(^| )(\w)/g, (_, _sep, c) => c.toUpperCase())
      const categoryValues = [...new Set([category, titleCase, snakeToSpace, snakeToSpaceTitle])]
      where.category = { in: categoryValues }
    }
    if (status) where.status = status
    if (fromDate || toDate) {
      const dateFilter: Record<string, Date> = {}
      if (fromDate) dateFilter.gte = new Date(`${fromDate}T00:00:00.000Z`)
      if (toDate) dateFilter.lte = new Date(`${toDate}T23:59:59.999Z`)
      where.date = dateFilter
    }

    const [expenses, total, summary] = await Promise.all([
      db.expense.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.expense.count({ where }),
      db.expense.aggregate({ _sum: { totalAmount: true, gst: true }, where }),
    ])

    return NextResponse.json({
      expenses,
      total,
      page,
      limit,
      totalExpense: summary._sum.totalAmount || 0,
      totalGst: summary._sum.gst || 0,
    })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()

    // Validate required fields
    if (!body.category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 })
    }
    if (!body.amount || body.amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    const totalAmount = (body.amount || 0) + (body.gst || 0)

    const expense = await db.expense.create({
      data: {
        date: body.date ? new Date(body.date) : new Date(),
        category: String(body.category).toLowerCase(),
        vendor: body.vendor || null,
        description: body.description || null,
        amount: body.amount,
        gst: body.gst || 0,
        totalAmount,
        paymentMode: body.paymentMode || null,
        billUrl: body.billUrl || null,
        status: body.status || 'pending',
        approvedBy: body.approvedBy || null,
        branchId: body.branchId || user.branchId || null,
        createdByUserId: user.id,
        organizationId,
      },
    })
    return NextResponse.json(expense, { status: 201 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { id, ...data } = body
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
    const owned = await db.expense.findFirst({ where: { id, organizationId } })
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Normalize on write so category/status never drift into mixed casing —
    // done before any comparison below so every check sees the same value
    // that actually gets persisted.
    if (data.category) data.category = String(data.category).toLowerCase()
    if (data.status) data.status = String(data.status).toLowerCase()

    // Status-only updates must not overwrite the existing total. If either
    // monetary field changes, combine it with the persisted other field.
    // Never accept a client-supplied total independently of amount and GST.
    const updateData: Record<string, unknown> = { ...data }
    delete updateData.totalAmount
    for (const field of ['amount', 'gst'] as const) {
      if (data[field] !== undefined && (typeof data[field] !== 'number' || !Number.isFinite(data[field]) || data[field] < 0)) {
        return NextResponse.json({ error: `${field} must be a non-negative number` }, { status: 400 })
      }
    }
    if (data.amount !== undefined || data.gst !== undefined) {
      updateData.totalAmount = (data.amount ?? owned.amount) + (data.gst ?? owned.gst)
    }

    // When approving/rejecting, set approvedBy and approvedAt
    if (data.date) updateData.date = new Date(data.date)
    if (data.status === 'approved' || data.status === 'rejected') {
      updateData.approvedBy = user.name
      updateData.approvedAt = new Date()
    }

    const expense = await db.expense.update({
      where: { id },
      data: updateData as Prisma.ExpenseUpdateInput,
    })

    // Notify whoever submitted the expense, unless they're the one approving/
    // rejecting their own entry (avoids a redundant self-notification).
    if (
      (data.status === 'approved' || data.status === 'rejected') &&
      expense.createdByUserId &&
      expense.createdByUserId !== user.id
    ) {
      await createNotification(organizationId ?? null, {
        userId: expense.createdByUserId,
        type: 'expense',
        title: `Expense ${data.status === 'approved' ? 'Approved' : 'Rejected'}`,
        message: `Your ${expense.category} expense of ₹${expense.totalAmount.toLocaleString('en-IN')} has been ${data.status}.`,
        link: 'expenses',
      })
    }

    return NextResponse.json(expense)
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 })
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
    const owned = await db.expense.findFirst({ where: { id, organizationId } })
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await db.expense.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 })
  }
}
