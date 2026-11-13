import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { notifyRoles } from '@/lib/notifications'

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const allowedRoles = ['admin', 'super_admin', 'receptionist']
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const source = searchParams.get('source') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = { organizationId }
    if (search) where.OR = [
      { name: { contains: search } },
      { mobile: { contains: search } },
      { childName: { contains: search } },
    ]
    if (status) {
      // Normalize 'dropped' and 'lost' - both refer to the same status
      if (status === 'dropped' || status === 'lost') {
        where.status = { in: ['dropped', 'lost'] }
      } else {
        where.status = status
      }
    }
    if (source) where.source = source

    const [leads, total] = await Promise.all([
      db.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.lead.count({ where }),
    ])

    return NextResponse.json({ leads, total, page, limit })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const allowedRoles = ['admin', 'super_admin', 'receptionist']
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const lead = await db.lead.create({
      data: {
        name: body.name,
        mobile: body.mobile,
        email: body.email,
        childName: body.childName,
        childAge: body.childAge,
        concern: body.concern,
        source: body.source,
        // Normalize 'dropped' to 'lost' to match Prisma schema canonical values
        status: (body.status === 'dropped' ? 'lost' : body.status) || 'new',
        notes: body.notes,
        assignedTo: body.assignedTo,
        organizationId,
      },
    })
    await notifyRoles(organizationId ?? null, ['admin', 'super_admin', 'receptionist'], {
      type: 'general',
      title: 'New Lead',
      message: `${lead.name} enquired${lead.childName ? ` about ${lead.childName}` : ''}`,
      link: 'leads',
    })
    return NextResponse.json(lead, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const allowedRoles = ['admin', 'super_admin']
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { id, ...data } = body
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
    const owned = await db.lead.findFirst({ where: { id, organizationId } })
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // Normalize 'dropped' to 'lost' to match Prisma schema canonical values
    if (data.status === 'dropped') data.status = 'lost'
    const lead = await db.lead.update({ where: { id }, data })
    return NextResponse.json(lead)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const allowedRoles = ['admin', 'super_admin']
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
    const owned = await db.lead.findFirst({ where: { id, organizationId } })
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await db.lead.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 })
  }
}
