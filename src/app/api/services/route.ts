import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'

// GET /api/services — Services Master list, for the invoice line-item
// dropdown (Consultation Fee, Assessment Fee, etc.). Any authenticated user
// can read it (needed to build an invoice); only admins can create/edit.
export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const { searchParams } = new URL(request.url)
    const showAll = searchParams.get('showAll') === 'true'

    const services = await db.service.findMany({
      where: showAll ? { organizationId } : { isActive: true, organizationId },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ services })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 })
  }
}

// POST /api/services — add a new billable service to the Services Master so
// it's immediately available in every invoice's service dropdown.
export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'Service name is required' }, { status: 400 })
    }
    const defaultPrice = Number(body.defaultPrice) || 0
    if (defaultPrice < 0) {
      return NextResponse.json({ error: 'Default price cannot be negative' }, { status: 400 })
    }

    const service = await db.service.create({ data: { name, defaultPrice, organizationId } })
    return NextResponse.json(service, { status: 201 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'A service with this name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create service' }, { status: 500 })
  }
}
