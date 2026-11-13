import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { checkBranchLimit } from '@/lib/subscription-limits'

// GET - List all branches (authenticated users only)
export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId

    const branches = await db.branch.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: {
          select: {
            users: true,
            patients: true,
            employees: true,
          },
        },
      },
    })
    return NextResponse.json(branches)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Branch list error:', error)
    return NextResponse.json({ error: 'Failed to fetch branches' }, { status: 500 })
  }
}

// POST - Create a new branch (admin, super_admin only)
export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { name, code, address, phone, email, city, state, pincode } = body

    if (!name || !code) {
      return NextResponse.json({ error: 'Branch name and code are required' }, { status: 400 })
    }

    // Plan limit enforcement (SaaS): branches are capped by the plan.
    const branchCheck = await checkBranchLimit(organizationId ?? null)
    if (!branchCheck.ok) return branchCheck.response

    // Branch.code has a global @unique DB constraint (like User.email) — kept
    // as a global lookup so we don't hand out a code that would fail the
    // create with a unique-constraint error.
    const existing = await db.branch.findUnique({ where: { code } })
    if (existing) {
      return NextResponse.json({ error: 'Branch code already exists' }, { status: 409 })
    }

    const branch = await db.branch.create({
      data: { name, code, address, phone, email, city, state, pincode, organizationId },
    })

    return NextResponse.json(branch, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Branch create error:', error)
    return NextResponse.json({ error: 'Failed to create branch' }, { status: 500 })
  }
}

// PUT - Update a branch (admin, super_admin only)
export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { id, name, code, address, phone, email, city, state, pincode, isActive } = body

    if (!id) {
      return NextResponse.json({ error: 'Branch ID is required' }, { status: 400 })
    }

    const owned = await db.branch.findFirst({ where: { id, organizationId } })
    if (!owned) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
    }

    const branch = await db.branch.update({
      where: { id },
      data: { name, code, address, phone, email, city, state, pincode, isActive },
    })

    return NextResponse.json(branch)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Branch update error:', error)
    return NextResponse.json({ error: 'Failed to update branch' }, { status: 500 })
  }
}

// DELETE - Delete a branch (super_admin only)
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Branch ID is required' }, { status: 400 })
    }

    const owned = await db.branch.findFirst({ where: { id, organizationId } })
    if (!owned) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
    }

    const userCount = await db.user.count({ where: { branchId: id, organizationId } })
    const patientCount = await db.patient.count({ where: { branchId: id, organizationId } })

    if (userCount > 0 || patientCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete branch. It has ${userCount} users and ${patientCount} patients. Deactivate it instead.` },
        { status: 400 }
      )
    }

    await db.branch.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Branch delete error:', error)
    return NextResponse.json({ error: 'Failed to delete branch' }, { status: 500 })
  }
}
