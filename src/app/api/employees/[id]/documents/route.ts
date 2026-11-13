import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'

// GET /api/employees/[id]/documents — list all document text records for one employee
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser(request)
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const organizationId = user.organizationId
    const { id } = await params
    const documents = await db.employeeDocument.findMany({
      where: { employeeId: id, organizationId },
      orderBy: { updatedAt: 'desc' },
    })
    return NextResponse.json({ documents })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
  }
}

// POST /api/employees/[id]/documents — save (create or edit) one document's
// text value. Body: { label, value, docId? }. When `docId` is given, that
// exact row is updated (used for editing one entry in the "Any Other
// Documents" list, where the same label can repeat). Otherwise this
// upserts by [employeeId, label] — the predefined document types (Aadhaar
// Card, PAN Card, etc.) have exactly one row each, so re-saving edits it
// in place instead of creating a duplicate.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser(request)
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const organizationId = user.organizationId
    const { id } = await params

    const employee = await db.employee.findFirst({ where: { id, organizationId } })
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    const body = await request.json()
    const label = String(body.label || '').trim()
    const value = String(body.value ?? '').trim()
    const docId = body.docId ? String(body.docId) : null

    if (!label) {
      return NextResponse.json({ error: 'Document label is required' }, { status: 400 })
    }
    if (!value) {
      return NextResponse.json({ error: 'A value is required' }, { status: 400 })
    }

    if (docId) {
      const owned = await db.employeeDocument.findFirst({ where: { id: docId, organizationId, employeeId: id } })
      if (!owned) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      const updated = await db.employeeDocument.update({ where: { id: docId }, data: { label, value } })
      return NextResponse.json(updated)
    }

    const existing = await db.employeeDocument.findFirst({ where: { employeeId: id, label, organizationId } })
    const document = existing
      ? await db.employeeDocument.update({ where: { id: existing.id }, data: { value } })
      : await db.employeeDocument.create({ data: { employeeId: id, label, value, organizationId } })

    return NextResponse.json(document, { status: existing ? 200 : 201 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Employee document save error:', error)
    return NextResponse.json({ error: 'Failed to save document' }, { status: 500 })
  }
}

// DELETE /api/employees/[id]/documents?docId=xxx — clear one document value
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser(request)
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const organizationId = user.organizationId
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const docId = searchParams.get('docId')
    if (!docId) return NextResponse.json({ error: 'docId is required' }, { status: 400 })

    const doc = await db.employeeDocument.findFirst({ where: { id: docId, organizationId } })
    if (!doc || doc.employeeId !== id) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    await db.employeeDocument.delete({ where: { id: docId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}
