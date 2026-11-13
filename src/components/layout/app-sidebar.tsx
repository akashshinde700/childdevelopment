'use client'

import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useAppStore, getRoleLabel, type AppPage, type UserRole } from '@/store/app-store'
import { cn } from '@/lib/utils'
import { authFetch } from '@/lib/api-client'
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Package,
  Activity,
  ClipboardCheck,
  Receipt,
  CreditCard,
  IndianRupee,
  UserCog,
  Clock,
  FileText,
  Wallet,
  BarChart3,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
  Baby,
  Home,
  CalendarCheck,
  BookOpen,
  FileBarChart,
  CreditCardIcon,
  Stethoscope,
  Brain,
  BabyIcon,
  Printer,
  Heart,
  TrendingUp,
  KeyRound,
  FileSpreadsheet,
  HandCoins,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface NavItem {
  label: string
  icon: React.ReactNode
  page: AppPage
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const fullNavGroups: NavGroup[] = [
  {
    title: 'Main',
    items: [
      { label: 'Dashboard', icon: <LayoutDashboard className="h-[18px] w-[18px]" />, page: 'dashboard' },
    ],
  },
  {
    title: 'Clinical',
    items: [
      { label: 'Patients', icon: <Users className="h-[18px] w-[18px]" />, page: 'patients' },
      { label: 'Patient History', icon: <FileText className="h-[18px] w-[18px]" />, page: 'patient-history' },
      { label: 'Appointments', icon: <CalendarDays className="h-[18px] w-[18px]" />, page: 'appointments' },
      { label: 'Packages', icon: <Package className="h-[18px] w-[18px]" />, page: 'packages' },
      { label: 'Therapy Sessions', icon: <Activity className="h-[18px] w-[18px]" />, page: 'sessions' },
      { label: 'Assessments', icon: <ClipboardCheck className="h-[18px] w-[18px]" />, page: 'assessments' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Billing & Invoices', icon: <Receipt className="h-[18px] w-[18px]" />, page: 'billing' },
      { label: 'Expenses', icon: <IndianRupee className="h-[18px] w-[18px]" />, page: 'expenses' },
    ],
  },
  {
    title: 'Human Resources',
    items: [
      { label: 'Employees', icon: <UserCog className="h-[18px] w-[18px]" />, page: 'employees' },
      { label: 'Parent', icon: <Heart className="h-[18px] w-[18px]" />, page: 'parent' },
      { label: 'Attendance', icon: <Clock className="h-[18px] w-[18px]" />, page: 'attendance' },
      { label: 'Leaves', icon: <FileText className="h-[18px] w-[18px]" />, page: 'leaves' },
      { label: 'Payroll', icon: <Wallet className="h-[18px] w-[18px]" />, page: 'payroll' },
      { label: 'Therapist Earnings', icon: <HandCoins className="h-[18px] w-[18px]" />, page: 'therapist-earnings' },
    ],
  },
  {
    title: 'Reports & Communication',
    items: [
      { label: 'Reports', icon: <BarChart3 className="h-[18px] w-[18px]" />, page: 'reports' },
      { label: 'Exports', icon: <FileSpreadsheet className="h-[18px] w-[18px]" />, page: 'exports' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { label: 'Settings', icon: <Settings className="h-[18px] w-[18px]" />, page: 'settings' },
      { label: 'User Management', icon: <Shield className="h-[18px] w-[18px]" />, page: 'user-management' },
      { label: 'Parent Login', icon: <KeyRound className="h-[18px] w-[18px]" />, page: 'parent-login' },
      { label: 'Print', icon: <Printer className="h-[18px] w-[18px]" />, page: 'print' },
      { label: 'Projection', icon: <TrendingUp className="h-[18px] w-[18px]" />, page: 'projection' },
      { label: 'Subscription', icon: <CreditCard className="h-[18px] w-[18px]" />, page: 'subscription' },
    ],
  },
]

const adminNavGroups: NavGroup[] = [
  { title: 'Main', items: [{ label: 'Dashboard', icon: <LayoutDashboard className="h-[18px] w-[18px]" />, page: 'dashboard' }] },
  {
    title: 'Clinical',
    items: [
      { label: 'Patients', icon: <Users className="h-[18px] w-[18px]" />, page: 'patients' },
      { label: 'Patient History', icon: <FileText className="h-[18px] w-[18px]" />, page: 'patient-history' },
      { label: 'Appointments', icon: <CalendarDays className="h-[18px] w-[18px]" />, page: 'appointments' },
      { label: 'Packages', icon: <Package className="h-[18px] w-[18px]" />, page: 'packages' },
      { label: 'Therapy Sessions', icon: <Activity className="h-[18px] w-[18px]" />, page: 'sessions' },
      { label: 'Assessments', icon: <ClipboardCheck className="h-[18px] w-[18px]" />, page: 'assessments' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Billing & Invoices', icon: <Receipt className="h-[18px] w-[18px]" />, page: 'billing' },
      { label: 'Expenses', icon: <IndianRupee className="h-[18px] w-[18px]" />, page: 'expenses' },
    ],
  },
  {
    title: 'Communication',
    items: [
      { label: 'Reports', icon: <BarChart3 className="h-[18px] w-[18px]" />, page: 'reports' },
      { label: 'Exports', icon: <FileSpreadsheet className="h-[18px] w-[18px]" />, page: 'exports' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { label: 'Settings', icon: <Settings className="h-[18px] w-[18px]" />, page: 'settings' },
      { label: 'Parent', icon: <Heart className="h-[18px] w-[18px]" />, page: 'parent' },
      { label: 'Parent Login', icon: <KeyRound className="h-[18px] w-[18px]" />, page: 'parent-login' },
      { label: 'Print', icon: <Printer className="h-[18px] w-[18px]" />, page: 'print' },
    ],
  },
]

const receptionistNavGroups: NavGroup[] = [
  { title: 'Main', items: [{ label: 'My Dashboard', icon: <LayoutDashboard className="h-[18px] w-[18px]" />, page: 'dashboard' }] },
  {
    title: 'Reception',
    items: [
      { label: 'My Patients', icon: <Users className="h-[18px] w-[18px]" />, page: 'patients' },
      { label: 'Patient History', icon: <FileText className="h-[18px] w-[18px]" />, page: 'patient-history' },
      { label: 'My Appointments', icon: <CalendarDays className="h-[18px] w-[18px]" />, page: 'appointments' },
      { label: 'Mark Attendance', icon: <Clock className="h-[18px] w-[18px]" />, page: 'attendance' },
      { label: 'Apply Leave', icon: <FileText className="h-[18px] w-[18px]" />, page: 'leaves' },
    ],
  },
]

const therapistNavGroups: NavGroup[] = [
  { title: 'Main', items: [{ label: 'My Dashboard', icon: <LayoutDashboard className="h-[18px] w-[18px]" />, page: 'dashboard' }] },
  {
    title: 'My Work',
    items: [
      { label: 'My Patients', icon: <Users className="h-[18px] w-[18px]" />, page: 'patients' },
      { label: 'Patient History', icon: <FileText className="h-[18px] w-[18px]" />, page: 'patient-history' },
      { label: 'My Appointments', icon: <CalendarDays className="h-[18px] w-[18px]" />, page: 'appointments' },
      { label: 'My Assessments', icon: <ClipboardCheck className="h-[18px] w-[18px]" />, page: 'assessments' },
      { label: 'Therapy Sessions', icon: <Activity className="h-[18px] w-[18px]" />, page: 'sessions' },
      { label: 'Mark Attendance', icon: <Clock className="h-[18px] w-[18px]" />, page: 'attendance' },
      { label: 'Apply Leave', icon: <FileText className="h-[18px] w-[18px]" />, page: 'leaves' },
    ],
  },
]

const psychologistNavGroups: NavGroup[] = [
  { title: 'Main', items: [{ label: 'Dashboard', icon: <LayoutDashboard className="h-[18px] w-[18px]" />, page: 'dashboard' }] },
  {
    title: 'Assessments',
    items: [
      { label: 'Patients', icon: <Users className="h-[18px] w-[18px]" />, page: 'patients' },
      { label: 'Patient History', icon: <FileText className="h-[18px] w-[18px]" />, page: 'patient-history' },
      { label: 'Appointments', icon: <CalendarDays className="h-[18px] w-[18px]" />, page: 'appointments' },
      { label: 'Assessments', icon: <ClipboardCheck className="h-[18px] w-[18px]" />, page: 'assessments' },
      { label: 'Reports', icon: <BarChart3 className="h-[18px] w-[18px]" />, page: 'reports' },
    ],
  },
]

const parentNavGroups: NavGroup[] = [
  { title: 'My Portal', items: [{ label: 'Home', icon: <Home className="h-[18px] w-[18px]" />, page: 'parent-dashboard' }] },
  {
    title: 'My Child',
    items: [
      { label: 'Appointments', icon: <CalendarCheck className="h-[18px] w-[18px]" />, page: 'parent-appointments' },
      { label: 'Therapy Notes', icon: <BookOpen className="h-[18px] w-[18px]" />, page: 'parent-sessions' },
      { label: 'Assessment Reports', icon: <FileBarChart className="h-[18px] w-[18px]" />, page: 'parent-assessments' },
      { label: 'Payments & Invoices', icon: <CreditCardIcon className="h-[18px] w-[18px]" />, page: 'parent-payments' },
    ],
  },
]

// Plan-gated nav pages (SaaS): pages listed here only render when the
// organization's plan includes the feature. This is UI-side convenience —
// real enforcement lives in the API (requireFeature), because a hidden
// button is not a security boundary.
const PAGE_FEATURE_REQUIREMENTS: Partial<Record<AppPage, string>> = {
  projection: 'advancedReports',
  exports: 'exportData',
}

function usePlanFeatures(): Record<string, boolean> | null {
  const [features, setFeatures] = useState<Record<string, boolean> | null>(null)
  useEffect(() => {
    let cancelled = false
    authFetch('/api/subscription/features')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data?.features) setFeatures(data.features) })
      .catch(() => {}) // fail open: features stay null = show everything
    return () => { cancelled = true }
  }, [])
  return features
}

function filterNavGroupsByFeatures(groups: NavGroup[], features: Record<string, boolean> | null): NavGroup[] {
  if (!features) return groups
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        const required = PAGE_FEATURE_REQUIREMENTS[item.page]
        return !required || features[required]
      }),
    }))
    .filter((g) => g.items.length > 0)
}

function getNavGroups(role: UserRole): NavGroup[] {
  if (role === 'super_admin') return fullNavGroups
  if (role === 'admin') return adminNavGroups
  if (role === 'receptionist') return receptionistNavGroups
  if (role === 'psychologist') return psychologistNavGroups
  if (role === 'parent') return parentNavGroups
  return therapistNavGroups
}

function getRoleIcon(role: UserRole) {
  switch (role) {
    case 'super_admin': return <Shield className="h-3.5 w-3.5" />
    case 'admin': return <UserCog className="h-3.5 w-3.5" />
    case 'parent': return <BabyIcon className="h-3.5 w-3.5" />
    case 'psychologist': return <Brain className="h-3.5 w-3.5" />
    default: return <Stethoscope className="h-3.5 w-3.5" />
  }
}

const pageSubsets: Record<string, string[]> = {
  patients: ['patient-form', 'patient-profile'],
  appointments: ['appointment-form'],
  packages: ['package-form'],
  assessments: ['assessment-form'],
  leads: ['lead-form'],
}

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { currentPage, sidebarOpen, setSidebarOpen, navigate, user, currentBranch } = useAppStore()
  const planFeatures = usePlanFeatures()

  if (!user) return null

  const activePage = pathname?.startsWith('/patient-history') ? 'patient-history' : currentPage
  const navGroups = filterNavGroupsByFeatures(getNavGroups(user.role), planFeatures)
  const showBranchBadge = user.role !== 'super_admin' && currentBranch

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden',
          sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setSidebarOpen(false)}
      />
      <aside
        style={{ position: 'fixed', left: 0, top: 0, background: 'linear-gradient(180deg, #12909F 0%, #0F7A87 42%, #073E45 100%)' }}
        className={cn(
          'z-50 fixed inset-y-0 left-0 flex flex-col transition-all duration-300 ease-out border-r border-black/10 shadow-[2px_0_18px_rgba(0,0,0,0.12)] bg-transparent backdrop-blur-xl lg:static lg:h-screen lg:shadow-none',
          sidebarOpen ? 'translate-x-0 w-full max-w-xs lg:w-[240px]' : '-translate-x-full w-0 lg:translate-x-0 lg:w-[60px]'
        )}
      >
      {/* ── Brand Header — logo sits directly on the sidebar's own teal
           gradient (no separate band) so it reads as one continuous surface ── */}
      <div
        className={cn(
          'flex shrink-0 items-center border-b border-white/10',
          sidebarOpen ? 'h-20 w-full px-0' : 'h-16 justify-center'
        )}
      >
        {sidebarOpen ? (
          <div className="h-20 w-full overflow-hidden">
            <div className="h-full w-full flex items-center justify-center">
              <Image
                src="/logo1.png"
                alt="Clinic logo"
                width={420}
                height={80}
                loading="eager"
                className="object-contain"
                style={{ width: 'auto', height: 'auto' }}
              />
            </div>
          </div>
        ) : (
          <div className="w-10 h-10 flex items-center justify-center overflow-hidden rounded-xl">
            <Image
              src="/logo1.png"
              alt="Clinic logo"
              width={40}
              height={40}
              loading="eager"
              className="object-contain"
              style={{ width: 'auto', height: 'auto' }}
            />
          </div>
        )}
      </div>

      {/* ── Role / Branch ──────────────────────────────── */}
      {sidebarOpen ? (
        <div className="shrink-0 px-3 py-2.5 border-b border-white/10 space-y-1.5">
          {/* Role row */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-2xl bg-white/10 ring-1 ring-white/15 shadow-sm">
            <span className="text-white shrink-0">{getRoleIcon(user.role)}</span>
            <span className="text-[11px] font-bold text-white tracking-wide truncate">
              {getRoleLabel(user.role)}
            </span>
          </div>
          {/* Branch row */}
          {showBranchBadge && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-2xl bg-white/10 ring-1 ring-white/10">
              <span className="text-[10px] shrink-0">📍</span>
              <span className="text-[10px] font-semibold text-white/85 truncate">
                {currentBranch.name}
                <span className="opacity-70 ml-1 text-white/70">({currentBranch.code})</span>
              </span>
            </div>
          )}
          {!showBranchBadge && user.role === 'super_admin' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-2xl bg-white/10 ring-1 ring-white/10">
              <span className="text-[10px] shrink-0">🌐</span>
              <span className="text-[10px] font-semibold text-white/85">All Branches</span>
            </div>
          )}
        </div>
      ) : (
        <div className="shrink-0 flex justify-center py-2 border-b border-black/8">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-black/10 text-[#0B4A52]/70 cursor-default">
                {getRoleIcon(user.role)}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs font-medium">
              {getRoleLabel(user.role)}
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* ── Navigation ─────────────────────────────────── */}
      <ScrollArea className="flex-1 overflow-y-auto">
        <nav className="px-2 py-2 space-y-0.5">
          {navGroups.map((group, groupIdx) => (
            <React.Fragment key={group.title}>
              {groupIdx > 0 && (
                <div className="my-2.5 mx-1 h-px bg-black/10" />
              )}
              {sidebarOpen && (
                <p
                  style={{ letterSpacing: '0.12em' }}
                  className="px-2.5 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#082E33] select-none"
                >
                  {group.title}
                </p>
              )}
              {!sidebarOpen && groupIdx > 0 && <div className="my-1" />}

              {group.items.map((item) => {
                const subsets = pageSubsets[item.page] || []
                const isActive = activePage === item.page || subsets.includes(activePage)

                const button = (
                  <button
                    key={item.page}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => {
                      navigate(item.page)
                      // On mobile the sidebar is a full-width overlay drawer —
                      // close it after navigating so the page underneath is
                      // reachable. Desktop uses lg:static with a fixed width,
                      // so sidebarOpen there only toggles expanded/collapsed
                      // and must not be forced closed.
                      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                        setSidebarOpen(false)
                      }
                    }}
                    className={cn(
                      'group/item relative flex w-full items-center rounded-2xl transition-all duration-300 ease-out outline-none interactive-smooth',
                      sidebarOpen ? 'gap-3 px-3 py-2' : 'justify-center py-2.5',
                      isActive
                        ? 'bg-white/30 text-white shadow-[0_16px_40px_rgba(255,255,255,0.18)] ring-1 ring-white/25 backdrop-blur-sm'
                        : 'text-white/80 hover:bg-white/15 hover:text-white hover:shadow-sm'
                    )}
                  >
                    {/* Active left bar */}
                    {isActive && sidebarOpen && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[60%] rounded-r-full bg-white/90" />
                    )}
                    <span
                      className={cn(
                        'shrink-0 transition-all duration-200',
                        isActive ? 'opacity-100 scale-110' : 'opacity-60 group-hover/item:opacity-95 group-hover/item:scale-105'
                      )}
                    >
                      {item.icon}
                    </span>
                    {sidebarOpen && (
                      <span
                        className={cn(
                          'truncate text-[13px] leading-none tracking-tight',
                          isActive ? 'font-bold' : 'font-semibold'
                        )}
                      >
                        {item.label}
                      </span>
                    )}
                  </button>
                )

                if (!sidebarOpen) {
                  return (
                    <Tooltip key={item.page} delayDuration={0}>
                      <TooltipTrigger asChild>{button}</TooltipTrigger>
                      <TooltipContent side="right" className="text-xs font-semibold">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  )
                }

                return button
              })}
            </React.Fragment>
          ))}
        </nav>
      </ScrollArea>

      {/* ── Collapse toggle ─────────────────────────────── */}
      <div className="shrink-0 border-t border-black/10 p-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className="w-full h-8 justify-center text-[#0B4A52]/45 hover:text-[#0B4A52]/75 hover:bg-black/10 transition-colors duration-150"
        >
          {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>
    </aside>
    </>
  )
}