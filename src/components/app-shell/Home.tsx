'use client'

import React, { Suspense, useEffect, useRef, useState } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { ParentPortal } from '@/components/modules/parent-portal/ParentPortal'
import LandingPage from '@/components/landing/LandingPage'
import { useAppStore, roleAccess, detailPageToParent, syncHashToPage, type UserRole, type AppPage } from '@/store/app-store'
import { deriveAppPagesFromPermissions, type RolePermission } from '@/lib/role-permissions'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import DashboardPage from '@/components/modules/dashboard/DashboardPage'
import { toast } from 'sonner'
import { ArrowUp } from 'lucide-react'

// Lazy-loaded module components
const PatientsPage = React.lazy(() => import('@/components/modules/patients/PatientsPage').then(m => ({ default: m.default })))
const PatientFormPage = React.lazy(() => import('@/components/modules/patients/PatientFormPage').then(m => ({ default: m.default })))
const PatientProfilePage = React.lazy(() => import('@/components/modules/patients/PatientProfilePage').then(m => ({ default: m.default })))
const PatientHistoryPage = React.lazy(() => import('@/components/modules/patient-history/PatientHistoryPage').then(m => ({ default: m.default })))
const AppointmentsPage = React.lazy(() => import('@/components/modules/appointments/AppointmentsPage').then(m => ({ default: m.default })))
const AppointmentFormPage = React.lazy(() => import('@/components/modules/appointments/AppointmentFormPage').then(m => ({ default: m.default })))
const PackagesPage = React.lazy(() => import('@/components/modules/packages/PackagesPage').then(m => ({ default: m.default })))
const PackageFormPage = React.lazy(() => import('@/components/modules/packages/PackageFormPage').then(m => ({ default: m.default })))
const SessionsPage = React.lazy(() => import('@/components/modules/sessions/SessionsPage').then(m => ({ default: m.default })))
const AssessmentsPage = React.lazy(() => import('@/components/modules/assessments/AssessmentsPage').then(m => ({ default: m.default })))
const AssessmentFormPage = React.lazy(() => import('@/components/modules/assessments/AssessmentFormPage').then(m => ({ default: m.default })))
const BillingPage = React.lazy(() => import('@/components/modules/billing/BillingPage').then(m => ({ default: m.default })))
const PaymentsPage = React.lazy(() => import('@/components/modules/payments/PaymentsPage').then(m => ({ default: m.default })))
const EmployeesPage = React.lazy(() => import('@/components/modules/employees/EmployeesPage').then(m => ({ default: m.default })))
const AttendancePage = React.lazy(() => import('@/components/modules/hr/AttendancePage').then(m => ({ default: m.default })))
const LeavesPage = React.lazy(() => import('@/components/modules/hr/LeavesPage').then(m => ({ default: m.default })))
const PayrollPage = React.lazy(() => import('@/components/modules/hr/PayrollPage').then(m => ({ default: m.default })))
const TherapistEarningsPage = React.lazy(() => import('@/components/modules/payroll/TherapistEarningsPage').then(m => ({ default: m.default })))
const ExpensesPage = React.lazy(() => import('@/components/modules/expenses/ExpensesPage').then(m => ({ default: m.default })))
const ReportsPage = React.lazy(() => import('@/components/modules/reports/ReportsPage').then(m => ({ default: m.default })))
const ExportsPage = React.lazy(() => import('@/components/modules/reports/ExportsPage').then(m => ({ default: m.default })))
const LeadsPage = React.lazy(() => import('@/components/modules/leads/LeadsPage').then(m => ({ default: m.default })))
const LeadFormPage = React.lazy(() => import('@/components/modules/leads/LeadFormPage').then(m => ({ default: m.default })))
const WhatsAppLogsPage = React.lazy(() => import('@/components/modules/communication/WhatsAppLogsPage').then(m => ({ default: m.default })))
const SettingsPage = React.lazy(() => import('@/components/modules/settings/SettingsPage').then(m => ({ default: m.default })))
const UserManagementPage = React.lazy(() => import('@/components/modules/settings/UserManagementPage').then(m => ({ default: m.default })))
const ParentLoginPage = React.lazy(
  () => import('@/components/modules/parent-login/ParentLoginPage')
)
const ParentPage = React.lazy(() => import('@/components/modules/parent/ParentPage').then(m => ({ default: m.default })))
const PrintPage = React.lazy(() => import('@/components/modules/print/PrintPage').then(m => ({ default: m.default })))
const ProjectionPage = React.lazy(() => import('@/components/modules/projection/ProjectionPage').then(m => ({ default: m.default })))
const SubscriptionPage = React.lazy(() => import('@/components/modules/subscription/SubscriptionPage').then(m => ({ default: m.default })))
const SystemConfigPage = React.lazy(() => import('@/components/modules/settings/SystemConfigPage').then(m => ({ default: m.default })))

function PageLoader() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
              </div>
              <Skeleton className="h-10 w-10 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  )
}

function PageContent({ page }: { page: string }) {
  switch (page) {
    case 'dashboard':
      return <DashboardPage />
    case 'parent-dashboard':
    case 'parent-appointments':
    case 'parent-sessions':
    case 'parent-assessments':
    case 'parent-payments':
      return <ParentPortal />
    case 'patients':
      return <Suspense fallback={<PageLoader />}><PatientsPage /></Suspense>
    case 'patient-form':
      return <Suspense fallback={<PageLoader />}><PatientFormPage /></Suspense>
    case 'patient-profile':
      return <Suspense fallback={<PageLoader />}><PatientProfilePage /></Suspense>
    case 'patient-history':
      return <Suspense fallback={<PageLoader />}><PatientHistoryPage /></Suspense>
    case 'appointments':
      return <Suspense fallback={<PageLoader />}><AppointmentsPage /></Suspense>
    case 'appointment-form':
      return <Suspense fallback={<PageLoader />}><AppointmentFormPage /></Suspense>
    case 'packages':
      return <Suspense fallback={<PageLoader />}><PackagesPage /></Suspense>
    case 'package-form':
      return <Suspense fallback={<PageLoader />}><PackageFormPage /></Suspense>
    case 'sessions':
      return <Suspense fallback={<PageLoader />}><SessionsPage /></Suspense>
    case 'assessments':
      return <Suspense fallback={<PageLoader />}><AssessmentsPage /></Suspense>
    case 'assessment-form':
      return <Suspense fallback={<PageLoader />}><AssessmentFormPage /></Suspense>
    case 'billing':
      return <Suspense fallback={<PageLoader />}><BillingPage /></Suspense>
    case 'payments':
      return <Suspense fallback={<PageLoader />}><PaymentsPage /></Suspense>
    case 'employees':
      return <Suspense fallback={<PageLoader />}><EmployeesPage /></Suspense>
    case 'parent':
      return <Suspense fallback={<PageLoader />}><ParentPage /></Suspense>
    case 'parent-login':
      return (
        <Suspense fallback={<PageLoader />}>
          <ParentLoginPage />
        </Suspense>
      )
    case 'attendance':
      return <Suspense fallback={<PageLoader />}><AttendancePage /></Suspense>
    case 'leaves':
      return <Suspense fallback={<PageLoader />}><LeavesPage /></Suspense>
    case 'payroll':
      return <Suspense fallback={<PageLoader />}><PayrollPage /></Suspense>
    case 'therapist-earnings':
      return <Suspense fallback={<PageLoader />}><TherapistEarningsPage /></Suspense>
    case 'expenses':
      return <Suspense fallback={<PageLoader />}><ExpensesPage /></Suspense>
    case 'reports':
      return <Suspense fallback={<PageLoader />}><ReportsPage /></Suspense>
    case 'exports':
      return <Suspense fallback={<PageLoader />}><ExportsPage /></Suspense>
    case 'leads':
      return <Suspense fallback={<PageLoader />}><LeadsPage /></Suspense>
    case 'lead-form':
      return <Suspense fallback={<PageLoader />}><LeadFormPage /></Suspense>
    case 'whatsapp-logs':
      return <Suspense fallback={<PageLoader />}><WhatsAppLogsPage /></Suspense>
    case 'settings':
      return <Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>
    case 'user-management':
      return <Suspense fallback={<PageLoader />}><UserManagementPage /></Suspense>
    case 'print':
      return <Suspense fallback={<PageLoader />}><PrintPage /></Suspense>
    case 'projection':
      return <Suspense fallback={<PageLoader />}><ProjectionPage /></Suspense>
    case 'subscription':
      return <Suspense fallback={<PageLoader />}><SubscriptionPage /></Suspense>
    case 'system-config':
      return <Suspense fallback={<PageLoader />}><SystemConfigPage /></Suspense>
    default:
      return <Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>
  }
}

export default function Home() {
  const { currentPage, sidebarOpen, isAuthenticated, user, navigate, logout, token, setCustomRoleAccess, markCustomRoleAccessLoaded, setSidebarOpen } = useAppStore()
  const hasAccess = useAppStore((state) => state.hasAccess)
  const [authChecked, setAuthChecked] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)

  // Reset scroll position when switching pages — otherwise the new page's
  // content can render mid-scroll if the previous page was scrolled down.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
    setShowScrollTop(false)
  }, [currentPage])

  // ── Browser history integration ────────────────────────────────────────
  // navigate() mirrors every page change into location.hash (see
  // syncHashToPage in app-store.ts). This effect is the other direction:
  //  - on mount: adopt a deep-linked hash (/#billing) or, when there is
  //    none, write the persisted page into the URL so the history stack
  //    starts consistent;
  //  - on popstate: apply the hash the browser navigated to, giving the
  //    back/forward buttons real in-app meaning instead of exiting the app.
  // Detail pages (patient-profile etc.) map to their parent list — they
  // need a selected entity that a cold URL can't carry.
  useEffect(() => {
    const applyHash = () => {
      const store = useAppStore.getState()
      if (!store.isAuthenticated) return
      const raw = window.location.hash.replace(/^#/, '')
      if (!raw) {
        syncHashToPage(store.currentPage, true)
        return
      }
      const page = (detailPageToParent[raw] ?? raw) as AppPage
      if (page !== store.currentPage) store.navigate(page)
    }
    applyHash()
    window.addEventListener('popstate', applyHash)
    return () => window.removeEventListener('popstate', applyHash)

  }, [isAuthenticated])

  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const onScroll = () => setShowScrollTop(el.scrollTop > 400)
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // ── The sidebar's open/closed flag is persisted across sessions. On a
  // narrow (mobile) screen it renders as a full-width overlay, so a stale
  // "open" value carried over from a previous desktop session would cover
  // the entire page. A mount-only check isn't enough: this is a client-side
  // hash-routed SPA (see the hash-sync effect below) — navigating between
  // pages never remounts Home, so a browser window narrowed AFTER first
  // load (or a tablet rotated, or an external monitor unplugged) never got
  // re-checked, leaving the overlay stuck open and blocking every page
  // underneath it. Listen for the wide→narrow crossing instead of only
  // checking once. useAppStore.getState() (not the `sidebarOpen` closure)
  // so the resize handler always reads the current value, not a stale one
  // from whenever this effect happened to be set up.
  useEffect(() => {
    let wasNarrow = window.innerWidth < 1024
    if (wasNarrow && useAppStore.getState().sidebarOpen) {
      setSidebarOpen(false)
    }
    const handleResize = () => {
      const isNarrow = window.innerWidth < 1024
      if (isNarrow && !wasNarrow && useAppStore.getState().sidebarOpen) {
        setSidebarOpen(false)
      }
      wasNarrow = isNarrow
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // ── Custom (admin-defined) roles aren't in the static roleAccess table —
  // fetch this user's stored permissions once and derive their page access.
  // Whether this succeeds or fails, markCustomRoleAccessLoaded() must always
  // fire — it's what closes the "optimistically allow navigation" window in
  // navigate()/hasAccess() (see app-store.ts). Forgetting the failure path
  // would reopen the exact race this fetch exists to close.
  useEffect(() => {
    if (!isAuthenticated || !token || !user?.role) return
    if (roleAccess[user.role]) return // built-in role, no lookup needed
    let cancelled = false
    fetch('/api/roles', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.roles) return
        const match = data.roles.find((r: { value: string; permissions?: RolePermission[] }) => r.value === user.role)
        const pages = deriveAppPagesFromPermissions(match?.permissions) as AppPage[]
        setCustomRoleAccess(user.role, pages)
      })
      .catch(() => { /* non-fatal — falls back to dashboard-only access */ })
      .finally(() => {
        if (!cancelled) markCustomRoleAccessLoaded(user.role)
      })
    return () => { cancelled = true }
  }, [isAuthenticated, token, user?.role, setCustomRoleAccess, markCustomRoleAccessLoaded])

  // ── Validate token on mount: if the persisted token is stale (server
  // restarted, session file deleted), clear auth and force re-login.
  // This prevents the "stale session shows dashboard briefly" issue.
  useEffect(() => {
    let cancelled = false
    if (isAuthenticated && token) {
      // Verify the token is still valid by calling a protected endpoint
      fetch('/api/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (res.status === 401 && !cancelled) {
            // Token is invalid — log out and show login
            logout()
          }
        })
        .catch(() => {
          // Network error — don't auto-logout (server might be starting)
        })
        .finally(() => {
          if (!cancelled) setAuthChecked(true)
        })
    } else {
      // No token — no need to validate, already showing login
      // Use a microtask to avoid synchronous setState in effect
      Promise.resolve().then(() => { if (!cancelled) setAuthChecked(true) })
    }
    return () => { cancelled = true }
  }, []) // Run once on mount only

  const accessToastShown = useRef(false)

  React.useEffect(() => {
    if (user && !hasAccess(currentPage)) {
      if (!accessToastShown.current) {
        toast.error("You don't have permission to access this page")
        accessToastShown.current = true
      }
      navigate(user.role === 'parent' ? 'parent-dashboard' : 'dashboard')
    } else {
      accessToastShown.current = false
    }
  }, [user, currentPage, hasAccess, navigate])

  // Not authenticated → the public marketing landing page IS the site's
  // front door, rendered inline (same "/" URL, no client-side redirect) so
  // both browsers and non-JS crawlers get the real content on first
  // response. It has a Login button that leads to /login; staff sign in
  // there and the session keeps them straight in the app afterwards.
  if (!isAuthenticated || !user) {
    return <LandingPage />
  }

  // While validating the token, show a loading state (not the dashboard)
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-sm text-gray-500">Verifying session…</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <AppSidebar />
      <div
        className={cn(
          'flex flex-col min-h-screen overflow-x-hidden transition-all duration-300',
          sidebarOpen ? 'lg:pl-[240px]' : 'lg:pl-[64px]'
        )}
      >
        <AppHeader />
        <main ref={mainRef} className="flex-1 overflow-y-auto relative">
          <div className="mx-auto w-full max-w-[1600px] p-4 md:p-6 lg:p-8 xl:p-10">
            <PageContent page={currentPage} />
          </div>
          {showScrollTop && (
            <button
              type="button"
              onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
              aria-label="Scroll to top"
              className="fixed bottom-6 right-6 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-gray-900/85 text-white shadow-lg backdrop-blur hover:bg-gray-900 transition-colors dark:bg-gray-100/90 dark:text-gray-900 dark:hover:bg-gray-100"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </main>
      </div>
    </>
  )
}
