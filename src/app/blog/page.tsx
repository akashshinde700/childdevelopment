import type { Metadata } from 'next'
import Link from 'next/link'
import { getPublishedPosts } from '@/lib/blog-db'

export const metadata: Metadata = {
  title: 'Blog — Running a Child Therapy Clinic',
  description: 'Practical guides on running a speech therapy, occupational therapy, ABA or child development clinic in India — scheduling, billing, GST invoicing, multi-branch operations and more.',
  alternates: { canonical: '/blog' },
}

// Content is admin-editable (Platform Admin -> Blog tab) — revalidate
// periodically instead of baking it in at build time, so edits show up
// without a redeploy.
export const revalidate = 60

export default async function BlogIndexPage() {
  const posts = await getPublishedPosts()
  return (
    <>
      <h1 className="text-3xl font-extrabold text-slate-900">Blog</h1>
      <p className="mt-2 text-slate-500">Practical guides for running a child therapy clinic — scheduling, billing, compliance and growth.</p>
      {posts.length === 0 && <p className="mt-10 text-sm text-slate-400">No posts yet — check back soon.</p>}
      <div className="mt-10 space-y-8">
        {posts.map((p) => (
          <article key={p.slug} className="border-b border-slate-100 pb-8">
            <h2 className="text-xl font-bold text-slate-800">
              <Link href={`/blog/${p.slug}`} className="hover:text-teal-700">{p.title}</Link>
            </h2>
            <p className="mt-2 text-sm text-slate-600">{p.description}</p>
            <p className="mt-3 text-xs text-slate-400">
              {new Date(p.publishedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · {p.readingTime}
            </p>
          </article>
        ))}
      </div>
    </>
  )
}
