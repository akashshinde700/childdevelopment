'use client'

// Platform Admin portal — the SaaS control panel (Phase C).
// Completely separate from the tenant app: its own login (PlatformAdmin
// table, /api/platform/auth/*), its own session cookie, and every API it
// calls requires a platform session. Login is two-step: password, then a
// 6-digit OTP emailed via nodemailer.

import { useCallback, useEffect, useState } from 'react'
import { THERAPY_TYPES } from '@/lib/therapy-types'

type Plan = {
  id: string; name: string; tier: string
  therapistLimit: number; branchLimit: number; userLimit: number
  storageLimitMB: number
  priceMonthly: number; priceYearly: number
  features: Record<string, boolean>; isActive: boolean
}

type Org = {
  id: string; name: string; slug: string; status: string; createdAt: string
  subscription: null | {
    status: string; trialEndsAt: string | null; currentPeriodEnd: string | null
    billingCycle: string | null
    plan: Plan
  }
  usage: { patients: number; therapists: number; staff: number; branches: number }
  // Org Admin's current login credentials — generatedPassword is only ever
  // populated for Platform Admin's eyes (see GET /api/platform/organizations).
  adminEmail: string | null
  generatedPassword: string | null
}

type Admin = { id: string; email: string; name: string }

type AdminCandidate = { id: string; name: string; email: string; role: string; isActive: boolean }

type BlogPost = {
  id: string; slug: string; title: string; description: string; body: string
  isPublished: boolean; publishedAt: string; updatedAt: string
}

type FollowUp = { id: string; date: string; by: string; note: string; nextDate?: string | null }

type Inquiry = {
  id: string; clinicName: string; contactName: string; email: string
  phone: string | null; city: string | null; message: string | null
  status: string; followUps: FollowUp[]; createdAt: string
}

const INQUIRY_STATUSES = ['new', 'follow_up', 'demo', 'converted', 'closed'] as const

const INQUIRY_STATUS_COLORS: Record<string, string> = {
  new: 'bg-sky-100 text-sky-700',
  follow_up: 'bg-amber-100 text-amber-700',
  demo: 'bg-purple-100 text-purple-700',
  converted: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-slate-200 text-slate-600',
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500'
const btnCls = 'rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50'
const btnGhostCls = 'rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50'

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    trialing: 'bg-sky-100 text-sky-700',
    suspended: 'bg-red-100 text-red-700',
    past_due: 'bg-amber-100 text-amber-700',
    cancelled: 'bg-slate-200 text-slate-600',
  }
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || 'bg-slate-100 text-slate-600'}`}>{status}</span>
}

export default function PlatformAdminPage() {
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [needsBootstrap, setNeedsBootstrap] = useState(false)
  const [checked, setChecked] = useState(false)
  const [dbNotReady, setDbNotReady] = useState(false)
  // OTP login DISABLED — password-only sign-in. Kept commented for re-enable.
  // const [otpEmail, setOtpEmail] = useState<string | null>(null) // set = waiting for emailed code
  const [tab, setTab] = useState<'orgs' | 'plans' | 'inquiries' | 'blog'>('orgs')
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [orgs, setOrgs] = useState<Org[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showCreatePlan, setShowCreatePlan] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [showCreatePost, setShowCreatePost] = useState(false)
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null)
  const [busy, setBusy] = useState(false)
  // Activate / Mark Paid popup — lets the plan + billing cycle be confirmed
  // (with the amount auto-filled from the plan's price) before either action
  // actually flips subscription status, instead of the old one-click buttons.
  const [billingModal, setBillingModal] = useState<{ orgId: string; mode: 'activate' | 'markPaid' } | null>(null)
  // "Fix Org Admin" repair popup — only reachable for a clinic whose
  // adminEmail is null (no active super_admin left).
  const [adminFixModal, setAdminFixModal] = useState<{ org: Org; users: AdminCandidate[] } | null>(null)
  const [adminFixUserId, setAdminFixUserId] = useState('')
  const [adminFixTakesSessions, setAdminFixTakesSessions] = useState(true)
  const [adminFixTherapyType, setAdminFixTherapyType] = useState('')
  const [billingPlanId, setBillingPlanId] = useState('')
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')

  const loadData = useCallback(async () => {
    const [orgRes, planRes, inqRes, postRes] = await Promise.all([
      fetch('/api/platform/organizations'),
      fetch('/api/platform/plans'),
      fetch('/api/platform/inquiries'),
      fetch('/api/platform/blog'),
    ])
    if (orgRes.status === 401) { setAdmin(null); return }
    if (orgRes.ok) setOrgs(await orgRes.json())
    if (planRes.ok) setPlans(await planRes.json())
    if (inqRes.ok) {
      const raw = await inqRes.json()
      setInquiries(raw.map((i: Inquiry) => ({ ...i, followUps: Array.isArray(i.followUps) ? i.followUps : [] })))
    }
    if (postRes.ok) setPosts(await postRes.json())
  }, [])

  useEffect(() => {
    // Session restore FIRST: the httpOnly cookie survives refreshes — if
    // it's still valid, skip the login form entirely.
    Promise.all([
      fetch('/api/platform/auth/me')
        .then(async (r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch('/api/platform/auth/bootstrap')
        .then(async (r) => {
          const d = await r.json().catch(() => ({}))
          // A 500 here almost always means the PlatformAdmin table doesn't
          // exist yet (schema changed but `prisma db push` not run). Say so
          // explicitly instead of showing a login form that can never work.
          if (!r.ok) { setDbNotReady(true); return }
          setNeedsBootstrap(!!d.needsBootstrap)
        })
        .catch(() => setDbNotReady(true)),
    ])
      .then(([me]) => { if (me?.admin) setAdmin(me.admin) })
      .finally(() => setChecked(true))
  }, [])

  useEffect(() => { if (admin) loadData() }, [admin, loadData])

  // Refetch whenever a tab is opened — inquiries especially arrive from the
  // public landing page while the portal sits open, so the once-at-login
  // load went stale (an inquiry submitted after login never showed up).
  useEffect(() => { if (admin) loadData() }, [tab, admin, loadData])

  // Notices auto-dismiss so "Done." doesn't sit at the top forever —
  // EXCEPT one-time credentials (reset/create password), which must stay
  // until manually dismissed or the user navigates away.
  useEffect(() => {
    if (!notice || /password/i.test(notice)) return
    const t = setTimeout(() => setNotice(''), 6000)
    return () => clearTimeout(t)
  }, [notice])

  async function handleAuth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(''); setBusy(true)
    const form = new FormData(e.currentTarget)
    const payload = Object.fromEntries(form.entries())
    try {
      if (needsBootstrap) {
        const res = await fetch('/api/platform/auth/bootstrap', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error || 'Setup failed'); return }
        setNeedsBootstrap(false)
        setNotice('Platform admin created — log in now.')
        return
      }
      // ── OTP step DISABLED (kept commented for re-enable) ──
      // if (otpEmail) {
      //   // Step 2: verify the emailed code
      //   const res = await fetch('/api/platform/auth/verify-otp', {
      //     method: 'POST', headers: { 'Content-Type': 'application/json' },
      //     body: JSON.stringify({ email: otpEmail, code: payload.code }),
      //   })
      //   const data = await res.json()
      //   if (!res.ok) { setError(data.error || 'Verification failed'); return }
      //   setOtpEmail(null)
      //   setNotice('')
      //   setAdmin(data.admin)
      //   return
      // }
      // Password check — the API now returns the session directly (no OTP).
      const res = await fetch('/api/platform/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Login failed'); return }
      // if (data.otpRequired) {
      //   setOtpEmail(data.email)
      //   setNotice(`A 6-digit code has been emailed to ${data.email} — enter it below.`)
      //   return
      // }
      setAdmin(data.admin)
    } finally { setBusy(false) }
  }

  async function orgAction(id: string, action: string, extra: Record<string, unknown> = {}) {
    setError(''); setNotice('')
    const res = await fetch(`/api/platform/organizations/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Action failed'); return }
    if (action === 'resetAdminPassword') {
      setNotice(`New password for ${data.email}: ${data.temporaryPassword} — share it privately; it is shown only once.`)
    } else if (action === 'customizePlan') {
      setNotice(`Dedicated plan created for this clinic — edit its limits below. Changes here affect only this clinic.`)
      setEditingPlan(data.plan)
    } else {
      setNotice('Done.')
    }
    loadData()
  }

  async function openAdminFix(org: Org) {
    setError(''); setNotice('')
    const res = await fetch(`/api/platform/organizations/${org.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'listAdminCandidates' }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Could not load users'); return }
    if (data.hasActiveAdmin) { setError('This clinic already has an active Org Admin.'); loadData(); return }
    if (!data.users?.length) { setError('This clinic has no staff account to make Org Admin — create one first.'); return }
    setAdminFixUserId(data.users[0].id)
    setAdminFixTakesSessions(true)
    setAdminFixTherapyType('')
    setAdminFixModal({ org, users: data.users })
  }

  async function submitAdminFix() {
    if (!adminFixModal || !adminFixUserId) return
    setBusy(true)
    try {
      const res = await fetch(`/api/platform/organizations/${adminFixModal.org.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'restoreOrgAdmin',
          userId: adminFixUserId,
          takesSessions: adminFixTakesSessions,
          therapyType: adminFixTherapyType || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not set the Org Admin'); return }
      setNotice(
        `${data.email} is now Org Admin of "${adminFixModal.org.name}"` +
        (data.takesSessions ? ' (kept in the therapist lists)' : '') +
        ' — they must sign out and back in for the new role to apply.'
      )
      setAdminFixModal(null)
      loadData()
    } finally {
      setBusy(false)
    }
  }

  function openBillingModal(org: Org, mode: 'activate' | 'markPaid') {
    setBillingPlanId(org.subscription?.plan.id || plans[0]?.id || '')
    setBillingCycle(org.subscription?.billingCycle === 'yearly' ? 'yearly' : 'monthly')
    setBillingModal({ orgId: org.id, mode })
  }

  async function submitBillingModal() {
    if (!billingModal || !billingPlanId) return
    setBusy(true)
    try {
      const org = orgs.find((o) => o.id === billingModal.orgId)
      if (org && org.subscription?.plan.id !== billingPlanId) {
        await orgAction(billingModal.orgId, 'changePlan', { planId: billingPlanId })
      }
      await orgAction(billingModal.orgId, billingModal.mode, { billingCycle })
      setBillingModal(null)
    } finally {
      setBusy(false)
    }
  }

  async function impersonate(id: string) {
    const res = await fetch('/api/platform/impersonate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId: id }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Impersonation failed'); return }
    // One-shot handoff consumed by /impersonate in the new tab, which logs
    // the tenant app store in with the short-lived session.
    localStorage.setItem('platform-impersonation-handoff', JSON.stringify({ token: data.token, user: data.user }))
    window.open('/impersonate', '_blank')
    setNotice(`Support session opened as ${data.user.email} — logged to the audit trail.`)
  }

  async function deleteOrg(org: Org) {
    setError(''); setNotice('')
    const typed = prompt(
      `PERMANENT DELETE — this removes "${org.name}" and ALL its data ` +
      `(${org.usage.patients} patients, ${org.usage.staff + org.usage.therapists} staff, every invoice & session). ` +
      `There is no undo.\n\nType the clinic name exactly to confirm:`
    )
    if (typed === null) return
    const res = await fetch(`/api/platform/organizations/${org.id}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmName: typed }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Deletion failed'); return }
    setNotice(`"${data.deleted}" permanently deleted.`)
    loadData()
  }

  async function patchInquiry(id: string, patch: { status?: string; followUps?: FollowUp[] }) {
    setError('')
    const res = await fetch(`/api/platform/inquiries/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Update failed'); return null }
    setInquiries((list) => list.map((i) => (i.id === id ? { ...i, ...data, followUps: Array.isArray(data.followUps) ? data.followUps : [] } : i)))
    return data
  }

  async function deleteInquiry(inq: Inquiry) {
    if (!confirm(`Delete inquiry from "${inq.clinicName}"?`)) return
    const res = await fetch(`/api/platform/inquiries/${inq.id}`, { method: 'DELETE' })
    if (res.ok) setInquiries((list) => list.filter((i) => i.id !== inq.id))
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(''); setBusy(true)
    const form = new FormData(e.currentTarget)
    const raw = Object.fromEntries(form.entries()) as Record<string, string>
    // startOption bundles "trial length" and "billing cycle once active" into
    // one dropdown — split it back out into what the API actually expects.
    const { startOption, adminTakesSessions, ...rest } = raw
    const payload: Record<string, string | number | boolean> = { ...rest }
    // Unchecked checkboxes aren't in FormData at all, so absence means false.
    payload.adminTakesSessions = adminTakesSessions === 'on'
    if (startOption === 'trial14') payload.trialDays = 14
    else if (startOption === 'active_monthly') { payload.trialDays = 0; payload.billingCycle = 'monthly' }
    else if (startOption === 'active_yearly') { payload.trialDays = 0; payload.billingCycle = 'yearly' }
    else payload.trialDays = 7
    try {
      const res = await fetch('/api/platform/organizations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Creation failed'); return }
      setShowCreate(false)
      setNotice(`Clinic "${data.organization.name}" created. Org Admin: ${data.orgAdmin.email} / ${data.temporaryPassword} — shown only once, share privately.`)
      loadData()
    } finally { setBusy(false) }
  }

  async function savePlan(plan: Plan, patch: Partial<Plan>) {
    const res = await fetch('/api/platform/plans', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: plan.id, ...patch }),
    })
    if (res.ok) { setNotice(`Plan "${plan.name}" updated.`); loadData() }
    else setError('Plan update failed')
  }

  async function handleCreatePlan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(''); setBusy(true)
    const form = new FormData(e.currentTarget)
    const payload = {
      name: form.get('name'),
      tier: form.get('tier'),
      therapistLimit: form.get('therapistLimit'),
      branchLimit: form.get('branchLimit'),
      userLimit: form.get('userLimit'),
      storageLimitMB: Number(form.get('storageLimitGB')) * 1024,
      priceMonthly: form.get('priceMonthly'),
      priceYearly: form.get('priceYearly'),
    }
    try {
      const res = await fetch('/api/platform/plans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Plan creation failed'); return }
      setShowCreatePlan(false)
      setNotice(`Plan "${data.name}" created.`)
      loadData()
    } finally { setBusy(false) }
  }

  async function handleEditPlan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editingPlan) return
    setError(''); setBusy(true)
    const form = new FormData(e.currentTarget)
    const payload = {
      id: editingPlan.id,
      name: form.get('name'),
      tier: form.get('tier'),
      therapistLimit: Number(form.get('therapistLimit')),
      branchLimit: Number(form.get('branchLimit')),
      userLimit: Number(form.get('userLimit')),
      storageLimitMB: Number(form.get('storageLimitGB')) * 1024,
      priceMonthly: Number(form.get('priceMonthly')),
      priceYearly: Number(form.get('priceYearly')),
    }
    try {
      const res = await fetch('/api/platform/plans', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Plan update failed'); return }
      setEditingPlan(null)
      setNotice(`Plan "${data.name}" updated.`)
      loadData()
    } finally { setBusy(false) }
  }

  async function handleDeletePlan(plan: Plan) {
    if (!confirm(`Delete "${plan.name}"? This can't be undone.`)) return
    const res = await fetch(`/api/platform/plans/${plan.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setNotice(`Plan "${plan.name}" deleted.`); loadData() }
    else setError(data.error || 'Plan delete failed')
  }

  async function handleCreatePost(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(''); setBusy(true)
    const form = new FormData(e.currentTarget)
    const payload = {
      title: form.get('title'),
      description: form.get('description'),
      body: form.get('body'),
      isPublished: form.get('isPublished') === 'on',
    }
    try {
      const res = await fetch('/api/platform/blog', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Post creation failed'); return }
      setShowCreatePost(false)
      setNotice(`Post "${data.title}" created.`)
      loadData()
    } finally { setBusy(false) }
  }

  async function handleEditPost(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editingPost) return
    setError(''); setBusy(true)
    const form = new FormData(e.currentTarget)
    const payload = {
      title: form.get('title'),
      description: form.get('description'),
      body: form.get('body'),
      isPublished: form.get('isPublished') === 'on',
    }
    try {
      const res = await fetch(`/api/platform/blog/${editingPost.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Post update failed'); return }
      setEditingPost(null)
      setNotice(`Post "${data.title}" updated.`)
      loadData()
    } finally { setBusy(false) }
  }

  async function handleDeletePost(post: BlogPost) {
    if (!confirm(`Delete "${post.title}"? This can't be undone.`)) return
    const res = await fetch(`/api/platform/blog/${post.id}`, { method: 'DELETE' })
    if (res.ok) { setNotice(`Post "${post.title}" deleted.`); loadData() }
    else setError('Post delete failed')
  }

  if (!checked) return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>

  if (dbNotReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
          <h1 className="text-lg font-semibold text-slate-800">Database not migrated yet</h1>
          <p className="mt-2 text-sm text-slate-600">
            The platform tables don&apos;t exist in the database yet. Stop the dev server and run:
          </p>
          <pre className="mt-3 rounded-lg bg-slate-900 p-3 text-xs text-emerald-300">npx prisma generate{'\n'}npm run db:push</pre>
          <p className="mt-3 text-sm text-slate-600">Then restart <code className="rounded bg-slate-100 px-1">npm run dev</code> and reload this page.</p>
        </div>
      </div>
    )
  }

  if (!admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-900 via-teal-800 to-slate-900 p-4">
        <form onSubmit={handleAuth} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
          <h1 className="text-xl font-semibold text-slate-800">Platform Admin</h1>
          <p className="mt-1 text-sm text-slate-500">
            {needsBootstrap
              ? 'First-run setup: create the platform owner account.'
              : 'SaaS control panel — authorized personnel only.'}
          </p>
          {notice && <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700">{notice}</p>}
          {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-600">{error}</p>}
          <div className="mt-5 space-y-3">
            {/* ── OTP code input DISABLED — password-only sign-in. Kept for re-enable:
            {otpEmail ? (
              <input
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="6-digit code"
                required
                autoFocus
                className={`${inputCls} text-center text-lg tracking-[0.4em] font-semibold`}
              />
            ) : (
            */}
            {needsBootstrap && <input name="name" placeholder="Your name" required className={inputCls} />}
            <input name="email" type="email" placeholder="Email" required className={inputCls} />
            <input name="password" type="password" placeholder={needsBootstrap ? 'Password (min 10 chars)' : 'Password'} required minLength={needsBootstrap ? 10 : undefined} className={inputCls} />
          </div>
          <button type="submit" disabled={busy} className={`${btnCls} mt-5 w-full`}>
            {needsBootstrap ? 'Create platform account' : busy ? 'Signing in…' : 'Sign in'}
          </button>
          {/* Back-to-password link removed with the OTP step:
          {otpEmail && (
            <button
              type="button"
              className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-700"
              onClick={() => { setOtpEmail(null); setNotice(''); setError('') }}
            >
              Back to password
            </button>
          )}
          */}
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Platform Admin</h1>
          <p className="text-xs text-slate-500">{admin.name} · {admin.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={btnGhostCls} onClick={() => { setTab('orgs') }} style={tab === 'orgs' ? { background: '#0d9488', color: 'white', borderColor: '#0d9488' } : {}}>Organizations</button>
          <button className={btnGhostCls} onClick={() => { setTab('plans') }} style={tab === 'plans' ? { background: '#0d9488', color: 'white', borderColor: '#0d9488' } : {}}>Plans</button>
          <button className={btnGhostCls} onClick={() => { setTab('inquiries') }} style={tab === 'inquiries' ? { background: '#0d9488', color: 'white', borderColor: '#0d9488' } : {}}>
            Inquiries{inquiries.filter((i) => i.status === 'new').length > 0 ? ` (${inquiries.filter((i) => i.status === 'new').length} new)` : ''}
          </button>
          <button className={btnGhostCls} onClick={() => { setTab('blog') }} style={tab === 'blog' ? { background: '#0d9488', color: 'white', borderColor: '#0d9488' } : {}}>Blog</button>
          <button
            className={btnGhostCls}
            onClick={async () => { await fetch('/api/platform/auth/logout', { method: 'POST' }); setAdmin(null) }}
          >Logout</button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        {notice && <p className="mb-4 break-all rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
        {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        {tab === 'orgs' && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-700">Organizations ({orgs.length})</h2>
              <button className={btnCls} onClick={() => setShowCreate(true)}>+ Create clinic</button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Clinic</th>
                    <th className="px-4 py-3">Login</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Usage</th>
                    <th className="px-4 py-3">Period / Trial</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((org) => {
                    const sub = org.subscription
                    return (
                      <tr key={org.id} className="border-b border-slate-100 align-top last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{org.name}</div>
                          <div className="text-xs text-slate-400">{org.slug}</div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {/* whitespace-nowrap, not break-all: the table's overflow-x-auto
                              wrapper already scrolls horizontally — breaking mid-word here
                              turned the email into an unreadable single-letter-per-line
                              stack on narrow screens instead of just scrolling to it. */}
                          <div className="text-slate-600 whitespace-nowrap">{org.adminEmail || '—'}</div>
                          {org.generatedPassword ? (
                            <div className="mt-1 flex items-center gap-1.5">
                              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{org.generatedPassword}</code>
                              <button
                                type="button"
                                title="Copy password"
                                className="text-slate-400 hover:text-teal-600"
                                onClick={() => { navigator.clipboard.writeText(org.generatedPassword!); setNotice(`Password for ${org.adminEmail} copied to clipboard.`) }}
                              >📋</button>
                            </div>
                          ) : (
                            <div className="mt-1 text-slate-400">— reset to reveal —</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            className="rounded border border-slate-200 px-1 py-0.5 text-xs"
                            value={sub?.plan.id || ''}
                            onChange={(e) => orgAction(org.id, 'changePlan', { planId: e.target.value })}
                          >
                            {!sub && <option value="">— no plan —</option>}
                            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={sub?.status || org.status} /></td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {org.usage.therapists}{sub ? `/${sub.plan.therapistLimit}` : ''} therapists<br />
                          {org.usage.branches}{sub ? `/${sub.plan.branchLimit}` : ''} branches · {org.usage.staff}{sub ? `/${sub.plan.userLimit}` : ''} staff<br />
                          {org.usage.patients} patients
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {sub?.status === 'trialing' && sub.trialEndsAt && <>Trial ends {new Date(sub.trialEndsAt).toLocaleDateString()}</>}
                          {sub?.status !== 'trialing' && sub?.currentPeriodEnd && (
                            <>
                              Paid until {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                              {sub.billingCycle && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">{sub.billingCycle}</span>}
                            </>
                          )}
                          {!sub && 'Grandfathered (no plan)'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            <button className={btnGhostCls} onClick={() => openBillingModal(org, 'markPaid')}>Mark paid</button>
                            <button className={btnGhostCls} onClick={() => orgAction(org.id, 'extendTrial', { days: 7 })}>+7d trial</button>
                            {org.status === 'active'
                              ? <button className={btnGhostCls} onClick={() => { if (confirm(`Suspend ${org.name}? All their users lose access immediately.`)) orgAction(org.id, 'suspend') }}>Suspend</button>
                              : <button className={btnGhostCls} onClick={() => openBillingModal(org, 'activate')}>Activate</button>}
                            <button
                              className={btnGhostCls}
                              title="Clone this clinic's current plan into a dedicated one you can edit without affecting other clinics"
                              onClick={() => { if (confirm(`Create a dedicated custom plan for ${org.name}? You'll be able to edit its limits without affecting any other clinic.`)) orgAction(org.id, 'customizePlan') }}
                            >Customize plan</button>
                            {org.adminEmail ? (
                              <>
                                <button className={btnGhostCls} onClick={() => orgAction(org.id, 'resetAdminPassword')}>Reset pwd</button>
                                <button className={btnGhostCls} onClick={() => impersonate(org.id)}>Login as</button>
                              </>
                            ) : (
                              <button
                                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                                onClick={() => openAdminFix(org)}
                              >Fix Org Admin</button>
                            )}
                            <button
                              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                              onClick={() => deleteOrg(org)}
                            >Delete</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {orgs.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">No organizations yet — create your first clinic.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'inquiries' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-700">Inquiries ({inquiries.length})</h2>
              <button className={btnGhostCls} onClick={() => loadData()}>↻ Refresh</button>
            </div>
            {inquiries.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
                No inquiries yet — share your landing page: <span className="font-mono text-slate-600">/</span>
              </div>
            )}
            {inquiries.map((inq) => (
              <InquiryCard key={inq.id} inquiry={inq} onPatch={patchInquiry} onDelete={() => deleteInquiry(inq)} />
            ))}
          </div>
        )}

        {tab === 'plans' && (() => {
          const mainPlans = plans.filter((p) => p.tier !== 'custom')
          const customPlans = plans.filter((p) => p.tier === 'custom')
          return (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-700">Plans ({plans.length})</h2>
                <button className={btnCls} onClick={() => setShowCreatePlan(true)}>+ Add plan</button>
              </div>
              {plans.length === 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
                  No plans yet — click &quot;+ Add plan&quot; to create one.
                </div>
              )}

              {mainPlans.length > 0 && (
                <>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Standard plans</h3>
                  <div className="grid gap-4 md:grid-cols-3">
                    {mainPlans.map((plan) => (
                      <PlanCard key={plan.id} plan={plan} onEdit={() => setEditingPlan(plan)} onDelete={() => handleDeletePlan(plan)} onToggleFeature={(k, v) => savePlan(plan, { features: { ...plan.features, [k]: !v } })} />
                    ))}
                  </div>
                </>
              )}

              {customPlans.length > 0 && (
                <>
                  <h3 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wide text-slate-500">Custom plans (per clinic)</h3>
                  <div className="grid gap-4 md:grid-cols-3">
                    {customPlans.map((plan) => (
                      <PlanCard key={plan.id} plan={plan} onEdit={() => setEditingPlan(plan)} onDelete={() => handleDeletePlan(plan)} onToggleFeature={(k, v) => savePlan(plan, { features: { ...plan.features, [k]: !v } })} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )
        })()}

        {tab === 'blog' && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-700">Blog posts ({posts.length})</h2>
              <button className={btnCls} onClick={() => setShowCreatePost(true)}>+ New post</button>
            </div>
            {posts.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
                No posts yet — click &quot;+ New post&quot; to write one.
              </div>
            )}
            <div className="space-y-3">
              {posts.map((post) => (
                <div key={post.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-slate-800">{post.title}</h3>
                      {!post.isPublished && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">Draft</span>}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-400">/blog/{post.slug} · updated {new Date(post.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer" className={btnGhostCls}>View</a>
                    <button className={btnGhostCls} onClick={() => setEditingPost(post)}>Edit</button>
                    <button className={btnGhostCls} onClick={() => handleDeletePost(post)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-800">Create clinic</h3>
            <p className="mt-1 text-xs text-slate-500">Provisions the organization, subscription, first branch and Org Admin account in one step. Credentials are shown once.</p>
            <div className="mt-4 space-y-3">
              <input name="name" placeholder="Clinic name" required className={inputCls} />
              <input name="branchName" placeholder="Main branch name (optional)" className={inputCls} />
              <input name="adminName" placeholder="Owner / Org Admin name" required className={inputCls} />
              <input name="adminEmail" type="email" placeholder="Org Admin email" required className={inputCls} />
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="adminTakesSessions" defaultChecked className="mt-0.5" />
                  <span>
                    Owner also treats patients
                    <span className="block text-xs text-slate-500">
                      Lists them as a therapist for appointments, sessions and assessments. Uncheck for an owner who only runs the business.
                    </span>
                  </span>
                </label>
                <input
                  name="adminTherapyType"
                  list="therapy-types"
                  placeholder="Specialization (optional) — pick one or type your own"
                  className={`${inputCls} mt-2`}
                />
              </div>
              <select name="planId" required className={inputCls} defaultValue="">
                <option value="" disabled>Select plan…</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — ₹{p.priceMonthly.toLocaleString('en-IN')}/mo</option>)}
              </select>
              <select name="startOption" className={inputCls} defaultValue="trial7">
                <option value="trial7">7-day trial</option>
                <option value="trial14">14-day trial</option>
                <option value="active_monthly">No trial — active immediately (Monthly billing)</option>
                <option value="active_yearly">No trial — active immediately (Yearly billing)</option>
              </select>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={btnGhostCls} onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" disabled={busy} className={btnCls}>Create</button>
            </div>
          </form>
        </div>
      )}

      {showCreatePlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreatePlan(false)}>
          <form onSubmit={handleCreatePlan} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-800">Add plan</h3>
            <p className="mt-1 text-xs text-slate-500">Feature flags start off — toggle them on the plan card after creating.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <input name="name" placeholder="Plan name" required className={inputCls} />
              <input name="tier" placeholder="Tier (e.g. basic, enterprise)" required className={inputCls} />
              <input name="therapistLimit" type="number" min="0" placeholder="Therapist limit" required className={inputCls} />
              <input name="branchLimit" type="number" min="0" placeholder="Branch limit" required className={inputCls} />
              <input name="userLimit" type="number" min="0" placeholder="Staff user limit" required className={inputCls} />
              <input name="storageLimitGB" type="number" min="0" placeholder="Storage (GB)" required className={inputCls} />
              <input name="priceMonthly" type="number" min="0" placeholder="Price / month (₹)" required className={inputCls} />
              <input name="priceYearly" type="number" min="0" placeholder="Price / year (₹)" required className={inputCls} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={btnGhostCls} onClick={() => setShowCreatePlan(false)}>Cancel</button>
              <button type="submit" disabled={busy} className={btnCls}>Create</button>
            </div>
          </form>
        </div>
      )}

      {editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditingPlan(null)}>
          <form onSubmit={handleEditPlan} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-800">Edit plan</h3>
            <p className="mt-1 text-xs text-slate-500">Feature flags are toggled directly on the plan card, not here.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <input name="name" placeholder="Plan name" required defaultValue={editingPlan.name} className={inputCls} />
              <input name="tier" placeholder="Tier (e.g. basic, enterprise)" required defaultValue={editingPlan.tier} className={inputCls} />
              <input name="therapistLimit" type="number" min="0" placeholder="Therapist limit" required defaultValue={editingPlan.therapistLimit} className={inputCls} />
              <input name="branchLimit" type="number" min="0" placeholder="Branch limit" required defaultValue={editingPlan.branchLimit} className={inputCls} />
              <input name="userLimit" type="number" min="0" placeholder="Staff user limit" required defaultValue={editingPlan.userLimit} className={inputCls} />
              <input name="storageLimitGB" type="number" min="0" placeholder="Storage (GB)" required defaultValue={Math.round(editingPlan.storageLimitMB / 1024)} className={inputCls} />
              <input name="priceMonthly" type="number" min="0" placeholder="Price / month (₹)" required defaultValue={editingPlan.priceMonthly} className={inputCls} />
              <input name="priceYearly" type="number" min="0" placeholder="Price / year (₹)" required defaultValue={editingPlan.priceYearly} className={inputCls} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={btnGhostCls} onClick={() => setEditingPlan(null)}>Cancel</button>
              <button type="submit" disabled={busy} className={btnCls}>Save changes</button>
            </div>
          </form>
        </div>
      )}

      {showCreatePost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreatePost(false)}>
          <form onSubmit={handleCreatePost} onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-800">New post</h3>
            <p className="mt-1 text-xs text-slate-500">
              URL is generated from the title automatically. Body formatting: <code className="rounded bg-slate-100 px-1">## Heading</code>, <code className="rounded bg-slate-100 px-1">### Subheading</code>, <code className="rounded bg-slate-100 px-1">- list item</code>, blank line = new paragraph.
            </p>
            <div className="mt-4 space-y-3">
              <input name="title" placeholder="Title" required className={inputCls} />
              <textarea name="description" placeholder="Meta description (1-2 sentences — also shown on the blog index)" required rows={2} className={inputCls} />
              <textarea name="body" placeholder="## First heading&#10;&#10;Paragraph text goes here.&#10;&#10;- list item one&#10;- list item two" required rows={16} className={`${inputCls} font-mono text-xs`} />
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="isPublished" defaultChecked /> Published (unchecked = draft, hidden from /blog)
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={btnGhostCls} onClick={() => setShowCreatePost(false)}>Cancel</button>
              <button type="submit" disabled={busy} className={btnCls}>Create post</button>
            </div>
          </form>
        </div>
      )}

      {editingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditingPost(null)}>
          <form onSubmit={handleEditPost} onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-800">Edit post</h3>
            <p className="mt-1 text-xs text-slate-500">/blog/{editingPost.slug} — URL doesn&apos;t change when you edit the title.</p>
            <div className="mt-4 space-y-3">
              <input name="title" placeholder="Title" required defaultValue={editingPost.title} className={inputCls} />
              <textarea name="description" placeholder="Meta description" required rows={2} defaultValue={editingPost.description} className={inputCls} />
              <textarea name="body" required rows={16} defaultValue={editingPost.body} className={`${inputCls} font-mono text-xs`} />
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="isPublished" defaultChecked={editingPost.isPublished} /> Published (unchecked = draft, hidden from /blog)
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={btnGhostCls} onClick={() => setEditingPost(null)}>Cancel</button>
              <button type="submit" disabled={busy} className={btnCls}>Save changes</button>
            </div>
          </form>
        </div>
      )}

      {/* Suggestions for every specialization box on this page; any other
          value can be typed in. */}
      <datalist id="therapy-types">
        {THERAPY_TYPES.map((t) => <option key={t} value={t} />)}
      </datalist>

      {adminFixModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAdminFixModal(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-800">Fix Org Admin — {adminFixModal.org.name}</h3>
            <p className="mt-2 text-sm text-slate-500">
              This clinic has no active Org Admin, so nobody there can open Settings, manage staff or billing.
              Pick the account that should own the clinic.
            </p>
            <div className="mt-4">
              <label className="text-xs font-medium text-slate-500">Make Org Admin</label>
              <select className={inputCls} value={adminFixUserId} onChange={(e) => setAdminFixUserId(e.target.value)}>
                {adminFixModal.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {u.email} · {u.role}{u.isActive ? '' : ' (inactive)'}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={adminFixTakesSessions}
                  onChange={(e) => setAdminFixTakesSessions(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Also treats patients
                  <span className="block text-xs text-slate-500">
                    Keeps them in the therapist dropdowns for appointments, sessions and assessments.
                  </span>
                </span>
              </label>
              {adminFixTakesSessions && (
                <input
                  list="therapy-types"
                  placeholder="Specialization (optional) — pick one or type your own"
                  className={`${inputCls} mt-2`}
                  value={adminFixTherapyType}
                  onChange={(e) => setAdminFixTherapyType(e.target.value)}
                />
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={btnGhostCls} onClick={() => setAdminFixModal(null)}>Cancel</button>
              <button type="button" disabled={busy || !adminFixUserId} className={btnCls} onClick={submitAdminFix}>
                Make Org Admin
              </button>
            </div>
          </div>
        </div>
      )}

      {billingModal && (() => {
        const modalOrg = orgs.find((o) => o.id === billingModal.orgId)
        const selectedPlan = plans.find((p) => p.id === billingPlanId)
        const amount = selectedPlan ? (billingCycle === 'yearly' ? selectedPlan.priceYearly : selectedPlan.priceMonthly) : 0
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setBillingModal(null)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
              <h3 className="text-lg font-semibold text-slate-800">
                {billingModal.mode === 'activate' ? 'Activate' : 'Mark Paid'}{modalOrg ? ` — ${modalOrg.name}` : ''}
              </h3>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-500">Select Plan</label>
                  <select className={inputCls} value={billingPlanId} onChange={(e) => setBillingPlanId(e.target.value)}>
                    {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500">Billing Cycle</label>
                  <div className="mt-1.5 flex gap-4 text-sm text-slate-700">
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name="billingCycle" checked={billingCycle === 'monthly'} onChange={() => setBillingCycle('monthly')} /> Monthly
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name="billingCycle" checked={billingCycle === 'yearly'} onChange={() => setBillingCycle('yearly')} /> Yearly
                    </label>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500">Amount</label>
                  <p className="mt-0.5 text-xl font-bold text-teal-700">
                    ₹{amount.toLocaleString('en-IN')}<span className="text-xs font-normal text-slate-400">/{billingCycle === 'yearly' ? 'year' : 'month'}</span>
                  </p>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" className={btnGhostCls} onClick={() => setBillingModal(null)}>Cancel</button>
                <button type="button" disabled={busy || !billingPlanId} className={btnCls} onClick={submitBillingModal}>
                  {billingModal.mode === 'activate' ? 'Activate' : 'Confirm Payment'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Plan card: limits + feature toggles, used for both standard and
// per-clinic custom plans ───────────────────────────────────────────────
function PlanCard({ plan, onEdit, onDelete, onToggleFeature }: {
  plan: Plan
  onEdit: () => void
  onDelete: () => void
  onToggleFeature: (key: string, current: boolean) => void
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">{plan.name}</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase text-slate-400">{plan.tier}</span>
          <button
            className="rounded-md border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            onClick={onEdit}
          >Edit</button>
          <button
            className="rounded-md border border-red-200 px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
            onClick={onDelete}
          >Delete</button>
        </div>
      </div>
      <p className="mt-1 text-2xl font-bold text-teal-700">₹{plan.priceMonthly.toLocaleString('en-IN')}<span className="text-sm font-normal text-slate-400">/month</span></p>
      <p className="text-sm font-medium text-slate-500">₹{plan.priceYearly.toLocaleString('en-IN')}<span className="text-xs font-normal text-slate-400">/year</span></p>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Limits</p>
      <ul className="mt-1 space-y-1 text-sm text-slate-600">
        <li>✓ {plan.therapistLimit} therapists</li>
        <li>✓ {plan.branchLimit} branch{plan.branchLimit === 1 ? '' : 'es'}</li>
        <li>✓ {plan.userLimit} staff users</li>
        <li>✓ {Math.round(plan.storageLimitMB / 1024)} GB storage</li>
      </ul>
      <div className="mt-3 flex flex-wrap gap-1">
        {Object.entries(plan.features || {}).map(([k, v]) => (
          <button
            key={k}
            title="Click to toggle"
            onClick={() => onToggleFeature(k, v)}
            className={`rounded-full px-2 py-0.5 text-[11px] ${v ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-400 line-through'}`}
          >{k}</button>
        ))}
      </div>
    </div>
  )
}

// ── Inquiry card: status pipeline + editable follow-up entries ─────────────
function InquiryCard({ inquiry, onPatch, onDelete }: {
  inquiry: Inquiry
  onPatch: (id: string, patch: { status?: string; followUps?: FollowUp[] }) => Promise<unknown>
  onDelete: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ by: string; note: string; nextDate: string }>({ by: '', note: '', nextDate: '' })

  const startAdd = () => { setDraft({ by: '', note: '', nextDate: '' }); setAdding(true); setEditingId(null) }
  const startEdit = (f: FollowUp) => { setDraft({ by: f.by, note: f.note, nextDate: f.nextDate || '' }); setEditingId(f.id); setAdding(false) }

  const saveDraft = async () => {
    if (!draft.note.trim()) return
    let next: FollowUp[]
    if (editingId) {
      next = inquiry.followUps.map((f) => (f.id === editingId ? { ...f, by: draft.by.trim(), note: draft.note.trim(), nextDate: draft.nextDate || null } : f))
    } else {
      next = [...inquiry.followUps, {
        id: `fu-${Date.now()}`,
        date: new Date().toISOString().slice(0, 10),
        by: draft.by.trim(),
        note: draft.note.trim(),
        nextDate: draft.nextDate || null,
      }]
    }
    await onPatch(inquiry.id, { followUps: next })
    setAdding(false); setEditingId(null)
  }

  const removeFollowUp = async (fid: string) => {
    await onPatch(inquiry.id, { followUps: inquiry.followUps.filter((f) => f.id !== fid) })
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-800">{inquiry.clinicName}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${INQUIRY_STATUS_COLORS[inquiry.status] || 'bg-slate-100 text-slate-600'}`}>
              {inquiry.status.replace('_', ' ')}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {inquiry.contactName} · {inquiry.email}{inquiry.phone ? ` · ${inquiry.phone}` : ''}{inquiry.city ? ` · ${inquiry.city}` : ''}
          </p>
          {inquiry.message && <p className="mt-2 max-w-2xl text-sm text-slate-500">&ldquo;{inquiry.message}&rdquo;</p>}
          <p className="mt-1 text-xs text-slate-400">Received {new Date(inquiry.createdAt).toLocaleDateString()} {new Date(inquiry.createdAt).toLocaleTimeString()}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded border border-slate-200 px-2 py-1 text-xs"
            value={inquiry.status}
            onChange={(e) => onPatch(inquiry.id, { status: e.target.value })}
          >
            {INQUIRY_STATUSES.map((st) => <option key={st} value={st}>{st.replace('_', ' ')}</option>)}
          </select>
          <button className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50" onClick={onDelete}>Delete</button>
        </div>
      </div>

      {/* Follow-ups */}
      <div className="mt-4 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Follow-ups ({inquiry.followUps.length})</h4>
          <button className={btnGhostCls} onClick={startAdd}>+ Add follow-up</button>
        </div>

        {inquiry.followUps.length > 0 && (
          <ul className="mt-2 space-y-2">
            {inquiry.followUps.map((f) => (
              <li key={f.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-400">
                    {f.date}{f.by ? ` · by ${f.by}` : ''}{f.nextDate ? ` · next: ${f.nextDate}` : ''}
                  </span>
                  <span className="flex gap-2">
                    <button className="text-xs text-teal-700 hover:underline" onClick={() => startEdit(f)}>Edit</button>
                    <button className="text-xs text-red-500 hover:underline" onClick={() => removeFollowUp(f.id)}>Remove</button>
                  </span>
                </div>
                <p className="mt-1 text-slate-700">{f.note}</p>
              </li>
            ))}
          </ul>
        )}

        {(adding || editingId) && (
          <div className="mt-3 space-y-2 rounded-lg border border-teal-200 bg-teal-50/50 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <input className={inputCls} placeholder="Spoke with (name/role)" value={draft.by} onChange={(e) => setDraft({ ...draft, by: e.target.value })} />
              <input className={inputCls} type="date" title="Next follow-up date" value={draft.nextDate} onChange={(e) => setDraft({ ...draft, nextDate: e.target.value })} />
            </div>
            <textarea
              className={`${inputCls} min-h-[70px]`}
              placeholder="What was discussed — pricing shared, demo scheduled, objections…"
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
            <div className="flex justify-end gap-2">
              <button className={btnGhostCls} onClick={() => { setAdding(false); setEditingId(null) }}>Cancel</button>
              <button className={btnCls} onClick={saveDraft}>{editingId ? 'Save changes' : 'Add follow-up'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
