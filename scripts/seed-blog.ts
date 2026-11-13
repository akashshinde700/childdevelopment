// One-off: converts the old hardcoded BLOG_POSTS (src/content/blog-posts.ts,
// now superseded by the DB-backed BlogPost model) into markdown-lite body
// text and inserts them into the DB, so the existing 4 articles survive the
// move to Platform-Admin-editable blog posts. Run once per environment:
//   npx tsx scripts/seed-blog.ts
import { PrismaClient } from '@prisma/client'
import { BLOG_POSTS, type BlogSection } from '../src/content/blog-posts'

const prisma = new PrismaClient()

function sectionsToBody(sections: BlogSection[]): string {
  const lines: string[] = []
  for (const s of sections) {
    if (s.type === 'h2') lines.push(`## ${s.text}`, '')
    else if (s.type === 'h3') lines.push(`### ${s.text}`, '')
    else if (s.type === 'p') lines.push(s.text, '')
    else if (s.type === 'ul') { for (const item of s.items) lines.push(`- ${item}`); lines.push('') }
  }
  return lines.join('\n').trim()
}

async function main() {
  for (const post of BLOG_POSTS) {
    const existing = await prisma.blogPost.findUnique({ where: { slug: post.slug } })
    if (existing) {
      console.log(`skip (exists): ${post.slug}`)
      continue
    }
    await prisma.blogPost.create({
      data: {
        slug: post.slug,
        title: post.title,
        description: post.description,
        body: sectionsToBody(post.sections),
        isPublished: true,
        publishedAt: new Date(post.publishedAt),
      },
    })
    console.log(`seeded: ${post.slug}`)
  }
}

main().finally(() => prisma.$disconnect())
