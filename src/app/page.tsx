import type { Metadata } from 'next'
import Home from '@/components/app-shell/Home'

// Signed-out visitors see the marketing landing page at this exact route
// (see Home's unauthenticated branch) — so the metadata for "/" is the
// product's marketing metadata, not the internal app's generic title.
// Signed-in staff get the SPA dashboard shell instead; this metadata is
// simply unused for that render path (browsers don't re-fetch it, and the
// dashboard isn't meant to be indexed).
export const metadata: Metadata = {
  title: 'AetherDev Solutions | Child Therapy Center Management Software',
  description: 'Run your child therapy clinic on one platform — patients, appointments, therapy sessions, billing, HR/payroll and a parent portal. Built for speech, OT, ABA and behavioral therapy centers in India. 7-day free trial.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'AetherDev Solutions | Child Therapy Center Management Software',
    description: 'Run your child therapy clinic on one platform — patients, appointments, therapy sessions, billing, HR/payroll and a parent portal. 7-day free trial, no card required.',
    url: '/',
    siteName: 'AetherDev Solutions',
    images: ['/logo1.png'],
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'AetherDev Solutions | Child Therapy Center Management Software',
    description: 'Run your child therapy clinic on one platform — patients, appointments, billing, HR and a parent portal.',
    images: ['/logo1.png'],
  },
}

export default function RootPage() {
  return <Home />
}
