'use client'

// Public marketing landing page — rendered at the site root ("/") for
// signed-out visitors (see src/app/page.tsx) so both browsers and
// non-JS-executing crawlers (AI answer engines included) get the real
// marketing HTML on the very first response instead of an empty shell
// that only fills in after a client-side redirect to /landing.
//
// Prospective clinics land here, see what the platform does and submit an
// inquiry (POST /api/public/inquiry, no auth). Inquiries appear in the
// Platform Admin's Inquiries tab with follow-up tracking. Pricing cards
// read the live Plan table (/api/public/plans).

import { useEffect, useState } from 'react'
import {
  Users, CalendarDays, Receipt, UserCog, Heart, ShieldCheck,
  PhoneCall, MapPin, CheckCircle2, ArrowRight, Sparkles, Mail,
} from 'lucide-react'

const COMPANY_EMAIL = 'info@aetherdevsolutions.com'
const SITE_URL = 'https://www.aetherdevsolutions.in'

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white'

const FEATURES = [
  { icon: Users, title: 'Patients & Therapy Sessions', desc: 'Registrations, assessments, session notes, packages and progress — one record per child.' },
  { icon: CalendarDays, title: 'Appointments & Scheduling', desc: 'Therapist-wise calendars, reschedules with audit trail, parent notifications.' },
  { icon: Receipt, title: 'Billing, Invoices & Payments', desc: 'GST-ready invoices with your own letterhead, package-linked billing, payment tracking.' },
  { icon: UserCog, title: 'HR: Staff, Attendance & Payroll', desc: 'Employee records, leaves, attendance and salary — therapists to receptionists.' },
  { icon: Heart, title: 'Parent Portal', desc: 'Parents see appointments, reports, invoices and progress from their own login.' },
  { icon: ShieldCheck, title: 'Your Branding, Your Data', desc: 'Your logo, letterhead and bank details on every print. Your clinic’s data stays yours alone.' },
]

const STEPS = [
  { n: '1', title: 'Book a demo', desc: 'Fill the form below — we walk you through the platform on a call, on your own clinic’s workflow.' },
  { n: '2', title: 'We set you up', desc: 'Your clinic, branches, staff logins and letterhead configured for you. Bring your patient list — we import it.' },
  { n: '3', title: 'Go live on a free trial', desc: '7 days with your real data before you pay anything. Cancel anytime during trial.' },
]

const CONTACTS = [
  { name: 'Sanket Gulave', phone: '8975185770' },
  { name: 'Nilesh Sadgir', phone: '8262846316' },
  { name: 'Akash Shinde', phone: '8600098315' },
  { name: 'Jaydeep Khamkar', phone: '7775951999' },
]

// Answer-engine-friendly Q&A: short, direct-answer-first copy that reads
// well both as on-page content and as FAQPage structured data below.
const FAQS = [
  {
    q: 'What is AetherDev Solutions?',
    a: 'AetherDev Solutions is a cloud-based management platform built specifically for child therapy and development centers — speech therapy, occupational therapy, ABA, behavioral and special education clinics in India. It replaces WhatsApp, Excel and paper registers with one system for patients, appointments, billing, HR and a parent portal.',
  },
  {
    q: 'Which clinics is this platform for?',
    a: 'Any child therapy or development center — single-branch or multi-branch — running speech therapy, occupational therapy, ABA therapy, special education, behavioral therapy or developmental assessments.',
  },
  {
    q: 'Is our patient data secure and kept private?',
    a: 'Yes. Each clinic\'s data is isolated to that clinic\'s own account. Your data stays yours — it is never shared across clinics, and you can export it at any time.',
  },
  {
    q: 'Can we try it before paying?',
    a: 'Yes — every plan includes a 7-day free trial with your own real data, no card required, and you can cancel anytime during the trial.',
  },
  {
    q: 'We already keep records in Excel or WhatsApp — can you migrate them?',
    a: 'Yes. Patient data import from Excel is included as part of onboarding — bring your existing patient list and our team sets it up for you.',
  },
  {
    q: 'Does it support multiple branches?',
    a: 'Yes. Branch limits depend on the plan; higher plans include unlimited branches with therapist-wise scheduling and billing per branch.',
  },
]

function faqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
}

function orgJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'AetherDev Solutions',
    url: SITE_URL,
    logo: `${SITE_URL}/logo1.png`,
    email: COMPANY_EMAIL,
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Shivaji Chowk, 101, Raigad Building, Hinjawadi',
      addressLocality: 'Pune',
      addressRegion: 'Maharashtra',
      postalCode: '411057',
      addressCountry: 'IN',
    },
    contactPoint: CONTACTS.map((c) => ({
      '@type': 'ContactPoint',
      contactType: 'sales',
      name: c.name,
      telephone: `+91${c.phone}`,
      areaServed: 'IN',
    })),
  }
}

function softwareJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'AetherDev Solutions',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: 'Cloud-based practice management platform for child therapy centers — patients, appointments, therapy sessions, billing, HR/payroll and a parent portal.',
    url: SITE_URL,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      description: '7-day free trial, no card required',
    },
  }
}

// Live pricing from the Plan table (same data the Platform Admin edits) —
// hardcoding prices here once caused the landing page to contradict the
// admin panel.
type PublicPlan = {
  id: string; name: string; tier: string
  therapistLimit: number; branchLimit: number; userLimit: number
  storageLimitMB: number
  priceMonthly: number; priceYearly: number
  features: Record<string, boolean> | null
}

function planPoints(p: PublicPlan): string[] {
  const pts = [
    `Up to ${p.therapistLimit} therapist${p.therapistLimit === 1 ? '' : 's'}`,
    p.branchLimit >= 99 ? 'Unlimited branches' : `${p.branchLimit} branch${p.branchLimit === 1 ? '' : 'es'}`,
    `${p.userLimit} staff user${p.userLimit === 1 ? '' : 's'}`,
    `${Math.round(p.storageLimitMB / 1024)} GB storage`,
  ]
  const f = p.features || {}
  if (f.advancedReports) pts.push('Advanced reports')
  return pts
}

function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {/* White chip behind the logo — the artwork has dark tones that
          disappear straight onto the teal navbar. */}
      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-md ring-1 ring-black/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo1.png" alt="AetherDev Solutions logo" className="h-full w-full object-contain" />
      </span>
      <div className="leading-tight text-left">
        <p className={`text-base font-extrabold tracking-widest ${dark ? 'text-slate-800' : 'text-white'}`}>AETHERDEV</p>
        <p className={`text-[10px] uppercase tracking-[0.3em] ${dark ? 'text-slate-500' : 'text-teal-200'}`}>Solutions</p>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const [form, setForm] = useState({ clinicName: '', contactName: '', email: '', phone: '', city: '', message: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [plans, setPlans] = useState<PublicPlan[]>([])

  useEffect(() => {
    fetch('/api/public/plans')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (Array.isArray(data)) setPlans(data) })
      .catch(() => {})
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.clinicName.trim() || !form.contactName.trim() || !form.email.trim()) {
      setError('Clinic name, your name and email are required')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/public/inquiry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Submission failed — please try again'); return }
      setDone(true)
    } catch {
      setError('Network error — please try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen scroll-smooth bg-white text-slate-800" style={{ scrollBehavior: 'smooth' }}>
      {/* Structured data: lets search engines and AI answer engines (Google
          AI Overview, ChatGPT, Perplexity, Gemini) parse who we are, what
          the product does and answer common questions directly. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }} />

      {/* ── Sticky navbar ── */}
      <nav className="sticky top-0 z-40 border-b border-white/10 bg-teal-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Brand />
          <div className="hidden items-center gap-6 text-sm text-teal-100 sm:flex">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#pricing" className="hover:text-white">Pricing</a>
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#faq" className="hover:text-white">FAQ</a>
            <a href="/blog" className="hover:text-white">Blog</a>
            <a href="#contact" className="hover:text-white">Contact</a>
          </div>
          <a
            href="/login"
            className="rounded-full border border-white/40 px-5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white hover:text-teal-800"
          >
            Login
          </a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="relative overflow-hidden bg-gradient-to-br from-teal-900 via-teal-800 to-slate-900 px-6 pb-24 pt-16 text-center text-white">
        {/* decorative glows */}
        <div aria-hidden className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-teal-500/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />

        <p className="inline-flex items-center gap-2 rounded-full border border-teal-400/40 bg-teal-500/10 px-4 py-1.5 text-xs uppercase tracking-[0.25em] text-teal-200">
          <Sparkles className="h-3.5 w-3.5" /> Child Therapy Center Management Software
        </p>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
          Run your therapy clinic on <span className="text-teal-300">one platform</span> — not on WhatsApp, Excel and paper registers
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-teal-100/90">
          Patients, appointments, therapy sessions, billing, HR and a parent portal — built specifically
          for speech, OT, behavioral and child development clinics in India.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <a href="#inquiry" className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-bold text-teal-900 shadow-xl transition-transform hover:scale-105">
            Book a free demo <ArrowRight className="h-4 w-4" />
          </a>
          <a href="#pricing" className="rounded-full border border-white/40 px-8 py-3.5 text-sm font-semibold text-white hover:bg-white/10">
            See pricing
          </a>
        </div>
        <p className="mt-6 text-xs text-teal-200/80">7-day free trial · Your data stays yours · Setup done for you</p>
      </header>

      {/* ── Features ── */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
        <h2 className="text-center text-3xl font-bold">Everything a therapy clinic needs</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-slate-500">
          One login for the whole clinic — owner, receptionists, therapists and parents each see exactly what they need.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="group rounded-2xl border border-slate-200 p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-teal-300 hover:shadow-lg">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700 transition-colors group-hover:bg-teal-600 group-hover:text-white">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold text-slate-800">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="scroll-mt-20 bg-teal-900 px-6 py-20 text-white">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold">From demo to go-live in days</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative rounded-2xl border border-white/10 bg-white/5 p-6">
                <span className="absolute -top-5 left-6 flex h-10 w-10 items-center justify-center rounded-full bg-teal-400 text-lg font-extrabold text-teal-950 shadow-lg">{s.n}</span>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-teal-100/80">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Plans ── */}
      <section id="pricing" className="scroll-mt-20 bg-slate-50 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold">Simple pricing, 7-day free trial</h2>
          <p className="mt-3 text-center text-slate-500">No card needed for the trial. Upgrade or downgrade anytime.</p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {plans.length === 0 && (
              <p className="col-span-full text-center text-sm text-slate-400">Loading plans…</p>
            )}
            {plans.map((p, i) => (
              <div
                key={p.id}
                className={`relative flex flex-col rounded-2xl border bg-white p-7 shadow-sm transition-all hover:shadow-xl ${i === 1 ? 'border-teal-500 ring-2 ring-teal-500/20 md:-translate-y-2' : 'border-slate-200'}`}
              >
                {i === 1 && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-teal-600 px-4 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow">Most popular</span>
                )}
                <h3 className="font-semibold text-slate-700">{p.name}</h3>
                <p className="mt-3 text-4xl font-extrabold text-teal-700">
                  ₹{p.priceMonthly.toLocaleString('en-IN')}<span className="text-sm font-normal text-slate-400">/month</span>
                </p>
                {p.priceYearly > 0 && (
                  <p className="mt-1 text-xs text-slate-400">or ₹{p.priceYearly.toLocaleString('en-IN')}/year</p>
                )}
                <ul className="mt-5 flex-1 space-y-2.5 text-sm text-slate-600">
                  {planPoints(p).map((pt) => (
                    <li key={pt} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" /> {pt}
                    </li>
                  ))}
                </ul>
                <a
                  href="#inquiry"
                  className={`mt-6 block rounded-full py-2.5 text-center text-sm font-bold transition-colors ${i === 1 ? 'bg-teal-700 text-white hover:bg-teal-800' : 'border border-teal-700 text-teal-700 hover:bg-teal-50'}`}
                >
                  Start with {p.name}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ — direct-answer format for search & AI answer engines ── */}
      <section id="faq" className="mx-auto max-w-4xl scroll-mt-20 px-6 py-20">
        <h2 className="text-center text-3xl font-bold">Frequently asked questions</h2>
        <div className="mt-10 space-y-6">
          {FAQS.map((f) => (
            <div key={f.q} className="rounded-2xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-800">{f.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Inquiry ── */}
      <section id="inquiry" className="mx-auto max-w-5xl scroll-mt-20 px-6 py-20">
        <div className="grid gap-10 md:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="text-3xl font-bold">Get a demo for your clinic</h2>
            <p className="mt-3 text-slate-500">Fill this in — we&apos;ll call you back within one working day.</p>
            <ul className="mt-6 space-y-3 text-sm text-slate-600">
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" /> Live walkthrough on your clinic&apos;s own workflow</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" /> Pricing guidance for your therapist count</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" /> Patient data import from Excel included</li>
            </ul>
            {/* Compact direct-contact card — the full contact list lives in
                the footer; repeating all four numbers here was noise. */}
            <div className="mt-8 space-y-3 rounded-2xl bg-teal-50 p-5 text-sm">
              <p className="font-semibold text-teal-900">Prefer to reach us directly?</p>
              <p className="flex items-center gap-2 text-slate-700">
                <Mail className="h-4 w-4 shrink-0 text-teal-700" />
                <a href={`mailto:${COMPANY_EMAIL}`} className="font-medium text-teal-700 hover:underline">{COMPANY_EMAIL}</a>
              </p>
              <p className="flex items-center gap-2 text-slate-700">
                <PhoneCall className="h-4 w-4 shrink-0 text-teal-700" />
                <a href={`tel:+91${CONTACTS[0].phone}`} className="font-medium text-teal-700 hover:underline">
                  {CONTACTS[0].phone.replace(/(\d{5})(\d{5})/, '$1 $2')}
                </a>
                <span className="text-slate-400">· <a href="#contact" className="hover:underline">all contacts ↓</a></span>
              </p>
            </div>
          </div>

          <div>
            {done && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDone(false)}>
                <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-3xl">✓</div>
                  <h3 className="mt-4 text-xl font-bold text-slate-800">Thank you, {form.contactName || 'friend'}!</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Your demo request for <span className="font-semibold">{form.clinicName}</span> has been received.
                    We&apos;ll call you back within one working day on the details you shared.
                  </p>
                  <button
                    className="mt-6 w-full rounded-full bg-teal-700 py-3 text-sm font-bold text-white hover:bg-teal-800"
                    onClick={() => setDone(false)}
                  >
                    Okay, got it
                  </button>
                </div>
              </div>
            )}
            {done ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
                <p className="text-lg font-semibold text-emerald-700">Inquiry received ✓</p>
                <p className="mt-2 text-sm text-emerald-600">We&apos;ll reach out within one working day.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
                {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
                <div className="grid gap-4 sm:grid-cols-2">
                  <input className={inputCls} placeholder="Clinic name *" value={form.clinicName} onChange={(e) => setForm({ ...form, clinicName: e.target.value })} />
                  <input className={inputCls} placeholder="Your name *" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
                  <input className={inputCls} type="email" placeholder="Email *" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  <input className={inputCls} placeholder="Phone / WhatsApp" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <input className={inputCls} placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                <textarea
                  className={`${inputCls} min-h-[100px]`}
                  placeholder="Tell us about your clinic — how many therapists, current setup…"
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-full bg-teal-700 py-3.5 text-sm font-bold text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
                >
                  {busy ? 'Submitting…' : 'Request a demo'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ── Contact & company details ── */}
      <footer id="contact" className="scroll-mt-20 border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <Brand dark />
              <p className="mt-5 flex max-w-sm items-start gap-3 text-sm text-slate-600">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                  <MapPin className="h-4 w-4" />
                </span>
                <span className="pt-1">Shivaji Chowk, 101, Raigad Building,<br />Hinjawadi, Maharashtra – 411057</span>
              </p>
              <p className="mt-3 flex items-center gap-3 text-sm text-slate-600">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                  <Mail className="h-4 w-4" />
                </span>
                <a href={`mailto:${COMPANY_EMAIL}`} className="font-medium text-teal-700 hover:underline">{COMPANY_EMAIL}</a>
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Contact us</h4>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {CONTACTS.map((c) => (
                  <a
                    key={c.phone}
                    href={`tel:+91${c.phone}`}
                    className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-teal-300 hover:bg-teal-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700 group-hover:bg-teal-100">
                      <PhoneCall className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800">{c.name}</span>
                      <span className="block text-sm text-teal-700">{c.phone.replace(/(\d{5})(\d{5})/, '$1 $2')}</span>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-12 border-t border-slate-200 pt-6 text-center text-xs text-slate-400">
            © {new Date().getFullYear()} AetherDev Solutions · All rights reserved
          </p>
        </div>
      </footer>
    </div>
  )
}
