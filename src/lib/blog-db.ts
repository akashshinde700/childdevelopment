import { dbUnscoped } from './db'
import { estimateReadingTime } from './blog'

// BlogPost is platform-level content (not tenant data), same convention as
// Plan/PlatformAdmin — dbUnscoped, narrow delegate cast so this compiles
// even before `prisma generate` has re-run after the model was added.
export interface BlogPostRecord {
  id: string
  slug: string
  title: string
  description: string
  body: string
  isPublished: boolean
  publishedAt: Date
  updatedAt: Date
}

interface BlogPostDelegate {
  findMany: (args?: object) => Promise<BlogPostRecord[]>
  findUnique: (args: object) => Promise<BlogPostRecord | null>
}

const blogDb = (dbUnscoped as unknown as { blogPost: BlogPostDelegate }).blogPost

export interface PublicBlogPost extends BlogPostRecord {
  readingTime: string
}

export async function getPublishedPosts(): Promise<PublicBlogPost[]> {
  const posts = await blogDb.findMany({
    where: { isPublished: true },
    orderBy: { publishedAt: 'desc' },
  })
  return posts.map((p) => ({ ...p, readingTime: estimateReadingTime(p.body) }))
}

export async function getPublishedPostBySlug(slug: string): Promise<PublicBlogPost | null> {
  const post = await blogDb.findUnique({ where: { slug } })
  if (!post || !post.isPublished) return null
  return { ...post, readingTime: estimateReadingTime(post.body) }
}
