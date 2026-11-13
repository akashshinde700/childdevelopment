import { NextRequest, NextResponse } from 'next/server'
import { dbUnscoped } from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/platform-session'

// Narrow delegate cast (same convention as platform-db.ts) — keeps this
// route compiling even before `prisma generate` has re-run after BlogPost
// was added to schema.prisma.
type BlogPostRecord = {
  id: string; slug: string; title: string; description: string; body: string
  isPublished: boolean; publishedAt: Date; createdAt: Date; updatedAt: Date
}
type BlogPostDelegate = {
  findMany: (args?: object) => Promise<BlogPostRecord[]>
  findUnique: (args: object) => Promise<BlogPostRecord | null>
  create: (args: object) => Promise<BlogPostRecord>
}
const blogDb = (dbUnscoped as unknown as { blogPost: BlogPostDelegate }).blogPost

function slugify(input: string): string {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

// GET /api/platform/blog — admin-only list, includes unpublished drafts
// (the public /blog pages query the DB directly and filter isPublished).
export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin(request)
    const posts = await blogDb.findMany({ orderBy: { publishedAt: 'desc' } })
    return NextResponse.json(posts)
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('GET /api/platform/blog error:', error)
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 })
  }
}

// POST — create a post. Slug is derived from the title (with a numeric
// suffix on collision) so the admin never has to think about URLs.
export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdmin(request)
    const body = await request.json()
    const { title, description, body: content, isPublished } = body
    if (!title || !description || !content) {
      return NextResponse.json({ error: 'Title, description and body are required' }, { status: 400 })
    }

    let slug = slugify(title)
    let suffix = 1
    while (await blogDb.findUnique({ where: { slug } })) {
      suffix += 1
      slug = `${slugify(title)}-${suffix}`
    }

    const post = await blogDb.create({
      data: {
        slug,
        title,
        description,
        body: content,
        isPublished: isPublished !== false,
      },
    })
    return NextResponse.json(post, { status: 201 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('POST /api/platform/blog error:', error)
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 })
  }
}
