import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPublishedPostBySlug, type PublicBlogPost } from '@/lib/blog-db'
import { parseBlogBody, type BlogSection } from '@/lib/blog'

const SITE_URL = 'https://www.aetherdevsolutions.in'

// Content is admin-editable (Platform Admin -> Blog tab) — revalidate
// periodically instead of baking it in at build time, so edits show up
// without a redeploy. dynamicParams (default true) lets new slugs created
// after the last deploy resolve without one too.
export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = await getPublishedPostBySlug(slug)
  if (!post) return {}
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      url: `/blog/${post.slug}`,
      type: 'article',
      publishedTime: post.publishedAt.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      images: ['/logo1.png'],
    },
    twitter: {
      card: 'summary',
      title: post.title,
      description: post.description,
      images: ['/logo1.png'],
    },
  }
}

function articleJsonLd(post: PublicBlogPost) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: { '@type': 'Organization', name: 'AetherDev Solutions' },
    publisher: {
      '@type': 'Organization',
      name: 'AetherDev Solutions',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo1.png` },
    },
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
  }
}

function breadcrumbJsonLd(post: PublicBlogPost) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: post.title, item: `${SITE_URL}/blog/${post.slug}` },
    ],
  }
}

function Section({ section }: { section: BlogSection }) {
  switch (section.type) {
    case 'h2':
      return <h2 className="mt-8 text-xl font-bold text-slate-900">{section.text}</h2>
    case 'h3':
      return <h3 className="mt-6 text-lg font-semibold text-slate-800">{section.text}</h3>
    case 'ul':
      return (
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
          {section.items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )
    case 'p':
    default:
      return <p className="mt-3 text-sm leading-relaxed text-slate-600">{section.text}</p>
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPublishedPostBySlug(slug)
  if (!post) notFound()

  const sections = parseBlogBody(post.body)

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd(post)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(post)) }} />

      <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
        <Link href="/" className="hover:underline">Home</Link> / <Link href="/blog" className="hover:underline">Blog</Link>
      </nav>

      <h1 className="mt-4 text-3xl font-extrabold leading-tight text-slate-900">{post.title}</h1>
      <p className="mt-3 text-xs text-slate-400">
        Updated {new Date(post.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · {post.readingTime}
      </p>

      <div className="mt-6">
        {sections.map((s, i) => <Section key={i} section={s} />)}
      </div>

      <div className="mt-12 rounded-2xl bg-teal-50 p-6 text-center">
        <p className="font-semibold text-teal-900">Ready to move your clinic off WhatsApp and Excel?</p>
        <Link href="/#inquiry" className="mt-4 inline-block rounded-full bg-teal-700 px-8 py-3 text-sm font-bold text-white hover:bg-teal-800">
          Book a free demo
        </Link>
      </div>
    </article>
  )
}
