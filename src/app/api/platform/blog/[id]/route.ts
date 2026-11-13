import { NextRequest, NextResponse } from 'next/server'
import { dbUnscoped } from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/platform-session'

type BlogPostRecord = {
  id: string; slug: string; title: string; description: string; body: string
  isPublished: boolean; publishedAt: Date; createdAt: Date; updatedAt: Date
}
type BlogPostDelegate = {
  findUnique: (args: object) => Promise<BlogPostRecord | null>
  update: (args: object) => Promise<BlogPostRecord>
  delete: (args: object) => Promise<unknown>
}
const blogDb = (dbUnscoped as unknown as { blogPost: BlogPostDelegate }).blogPost

// PUT /api/platform/blog/[id] — edit title/description/body/publish state.
// Slug is intentionally NOT editable here — changing it would 404 every
// existing link/bookmark/search result pointing at the old URL.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin(request)
    const { id } = await params
    const body = await request.json()

    const existing = await blogDb.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

    const data: Record<string, unknown> = {}
    if (typeof body.title === 'string' && body.title.trim()) data.title = body.title
    if (typeof body.description === 'string' && body.description.trim()) data.description = body.description
    if (typeof body.body === 'string' && body.body.trim()) data.body = body.body
    if (typeof body.isPublished === 'boolean') data.isPublished = body.isPublished
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const post = await blogDb.update({ where: { id }, data })
    return NextResponse.json(post)
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('PUT /api/platform/blog/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update post' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin(request)
    const { id } = await params
    const existing = await blogDb.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    await blogDb.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('DELETE /api/platform/blog/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 })
  }
}
