import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'receptionist') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const template = searchParams.get('template') || ''

    const where: Record<string, unknown> = { organizationId }
    if (search) {
      where.OR = [
        { mobile: { contains: search } },
        { template: { contains: search } },
        { message: { contains: search } },
      ]
    }
    if (status) where.status = status
    if (template) where.template = template

    const [logs, total] = await Promise.all([
      db.whatsAppLog.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.whatsAppLog.count({ where }),
    ])

    return NextResponse.json({ logs, total, page, limit })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch WhatsApp logs' }, { status: 500 })
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
    const log = await db.whatsAppLog.create({
      data: {
        patientId: body.patientId,
        mobile: body.mobile,
        template: body.template,
        message: body.message,
        status: body.status || 'sent',
        organizationId,
      },
    })
    return NextResponse.json(log, { status: 201 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to log WhatsApp message' }, { status: 500 })
  }
}
