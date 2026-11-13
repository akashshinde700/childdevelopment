import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'receptionist'
  | 'therapist_speech'
  | 'therapist_ot'
  | 'therapist_behavioral'
  | 'therapist_remedial'
  | 'psychologist'
  | 'parent'

export type AppPage =
  | 'login'
  | 'dashboard'
  | 'patients'
  | 'patient-form'
  | 'patient-profile'
  | 'patient-history'
  | 'appointments'
  | 'appointment-form'
  | 'packages'
  | 'package-form'
  | 'sessions'
  | 'assessments'
  | 'assessment-form'
  | 'billing'
  | 'payments'
  | 'employees'
  | 'parent'
  | 'parent-login'
  | 'attendance'
  | 'leaves'
  | 'payroll'
  | 'therapist-earnings'
  | 'expenses'
  | 'reports'
  | 'exports'
  | 'leads'
  | 'lead-form'
  | 'whatsapp-logs'
  | 'settings'
  | 'user-management'
  | 'system-config'
  | 'print'
  | 'projection'
  | 'subscription'
  | 'parent-dashboard'
  | 'parent-appointments'
  | 'parent-sessions'
  | 'parent-assessments'
  | 'parent-payments'

// ── URL hash <-> page sync ─────────────────────────────────────────────────
// The app navigates by store state, not URL routes. Mirroring the current
// page into location.hash gives us, with ~20 lines: working browser
// back/forward buttons, refresh-safe pages, and shareable deep links
// (e.g. /#billing). pushState only fires when the hash actually differs —
// so applying a page FROM the hash (popstate/deep link) never re-pushes,
// which is what keeps the history stack clean without any flags.
export function syncHashToPage(page: AppPage, replace = false) {
  if (typeof window === 'undefined') return
  const desired = page === 'login' ? window.location.pathname : `#${page}`
  const current = page === 'login' ? window.location.pathname + window.location.hash : window.location.hash
  if (current === desired) return
  if (replace) window.history.replaceState(null, '', desired)
  else window.history.pushState(null, '', desired)
}

// Detail pages need a selected entity that is neither persisted nor in the
// URL — landing on them "cold" (deep link / refresh) shows an empty screen.
// Used by both the rehydration hook and the hash reader to land on the
// parent list instead.
export const detailPageToParent: Record<string, AppPage> = {
  'patient-profile': 'patients',
  'patient-form': 'patients',
  'appointment-form': 'appointments',
  'package-form': 'packages',
  'assessment-form': 'assessments',
  'lead-form': 'leads',
}

export interface BranchInfo {
  id: string
  name: string
  code: string
  address?: string
  phone?: string
  city?: string
  state?: string
  isActive: boolean
}

export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
  organizationId?: string | null
  branchId?: string | null
  branchName?: string | null
  branchCode?: string | null
  phone?: string | null
  avatar?: string | null
  patientId?: string | null
  employeeId?: string | null
  therapyType?: string | null
}

// Role-based access control: which pages each of the 9 built-in roles can
// see. Custom (admin-defined) roles are looked up separately via the
// customRoleAccess store field — see hasAccess()/navigate() below.
export const roleAccess: Record<string, AppPage[]> = {
  super_admin: [
    'dashboard', 'patients', 'patient-form', 'patient-profile', 'patient-history',
    'appointments', 'appointment-form', 'packages', 'package-form',
    'sessions', 'assessments', 'assessment-form',
    'billing',
    'employees', 'parent', 'parent-login', 'attendance', 'leaves',
    'payroll', 'therapist-earnings', 'expenses',
    'reports', 'exports', 'leads', 'lead-form', 'whatsapp-logs',
    'settings', 'user-management', 'system-config', 'print', 'projection', 'subscription',
  ],
  admin: [
    'dashboard', 'patients', 'patient-form', 'patient-profile', 'patient-history',
    'appointments', 'appointment-form', 'packages', 'package-form',
    'sessions', 'assessments', 'assessment-form',
    'billing',
    'expenses', 'reports', 'exports', 'leads', 'lead-form',
    'whatsapp-logs', 'settings', 'parent', 'parent-login', 'print',
  ],
  receptionist: [
    'dashboard', 'patients', 'patient-profile',
    'patient-history',
    'appointments',
    'attendance', 'leaves',
  ],
  therapist_speech: [
    'dashboard', 'patients', 'patient-profile', 'patient-history',
    'appointments', 'assessments', 'sessions',
    'attendance', 'leaves',
  ],
  therapist_ot: [
    'dashboard', 'patients', 'patient-profile', 'patient-history',
    'appointments', 'assessments', 'sessions',
    'attendance', 'leaves',
  ],
  therapist_behavioral: [
    'dashboard', 'patients', 'patient-profile', 'patient-history',
    'appointments', 'assessments', 'sessions',
    'attendance', 'leaves',
  ],
  therapist_remedial: [
    'dashboard', 'patients', 'patient-profile', 'patient-history',
    'appointments', 'assessments', 'sessions',
    'attendance', 'leaves',
  ],
  psychologist: [
    'dashboard', 'patients', 'patient-profile', 'patient-history',
    'appointments', 'assessments', 'assessment-form',
    'reports',
  ],
  parent: [
    'parent-dashboard', 'parent-appointments', 'parent-sessions',
    'parent-assessments', 'parent-payments',
  ],
}

// Custom (admin-defined) roles are arbitrary strings not covered by the
// UserRole union above. These lookups are widened to Record<string, X> and
// paired with get*() helpers below so unknown role strings degrade
// gracefully instead of rendering "undefined".
export const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  receptionist: 'Receptionist',
  therapist_speech: 'Speech Therapist',
  therapist_ot: 'Occupational Therapist',
  therapist_behavioral: 'Behavioral Therapist',
  therapist_remedial: 'Remedial Therapist',
  psychologist: 'Clinical Psychologist',
  parent: 'Parent',
}

/**
 * Returns true if the given role is allowed to view patient/parent contact
 * details (mobile number). Therapists and psychologists are NOT allowed.
 */
export function canViewPatientContact(role: string | undefined | null): boolean {
  if (!role) return false
  return role === 'super_admin' || role === 'admin' || role === 'receptionist'
}

/**
 * Returns true if the given role is allowed to permanently delete a
 * cancelled appointment (and its linked records). Kept separate from
 * canViewPatientContact so the two permissions can diverge later even
 * though they currently share the same role set.
 */
export function canDeleteAppointments(role: string | undefined | null): boolean {
  if (!role) return false
  return role === 'super_admin' || role === 'admin' || role === 'receptionist'
}

export const roleColors: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-800',
  admin: 'bg-blue-100 text-blue-800',
  receptionist: 'bg-teal-100 text-teal-800',
  therapist_speech: 'bg-teal-100 text-teal-800',
  therapist_ot: 'bg-purple-100 text-purple-800',
  therapist_behavioral: 'bg-orange-100 text-orange-800',
  therapist_remedial: 'bg-yellow-100 text-yellow-800',
  psychologist: 'bg-indigo-100 text-indigo-800',
  parent: 'bg-green-100 text-green-800',
}

export const roleGradients: Record<string, string> = {
  super_admin: 'from-red-500 to-rose-600',
  admin: 'from-blue-500 to-cyan-600',
  receptionist: 'from-teal-500 to-cyan-600',
  therapist_speech: 'from-teal-500 to-emerald-600',
  therapist_ot: 'from-purple-500 to-violet-600',
  therapist_behavioral: 'from-orange-500 to-amber-600',
  therapist_remedial: 'from-yellow-500 to-lime-600',
  psychologist: 'from-indigo-500 to-blue-600',
  parent: 'from-green-500 to-teal-600',
}

// Graceful lookups for custom (admin-defined) roles that aren't in the
// static Records above — falls back to a title-cased version of the raw
// role string / a neutral color instead of rendering "undefined".
export function getRoleLabel(role: string | undefined | null): string {
  if (!role) return ''
  return roleLabels[role] || role.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// Employee.designation is free text set from a dropdown that includes a
// plain "Therapist" option — many therapist employees end up with that
// generic value instead of their actual specialization, even though their
// linked User account's role (therapist_speech/therapist_ot/etc.) is
// specific. Wherever a therapist's designation/role is displayed (schedule
// grid headers, calendar columns, appointment tables), prefer a real
// designation when one was set, but treat the generic "Therapist" value as
// if it were blank and fall back to the specific role label instead — so it
// always matches what's shown for that person in User Management.
export function resolveDisplayDesignation(
  designation: string | null | undefined,
  role: string | undefined | null,
  // The job role an account also holds (e.g. an owner whose `role` is
  // super_admin but who works as a physiotherapist). Preferred over `role`,
  // which would otherwise read "Super Admin" on their therapy work.
  secondaryRole?: string | null
): string {
  const trimmed = (designation || '').trim()
  const isGeneric = !trimmed || trimmed.toLowerCase() === 'therapist'
  if (!isGeneric) return trimmed
  return getRoleLabel(secondaryRole || role) || trimmed || 'Therapist'
}

// Appointment/session "type" values that are too generic to be useful on
// their own (e.g. every walk-in appointment defaults to "therapy" regardless
// of the assigned therapist's actual specialization). Wherever an
// appointment's type is displayed (Appointments tables, Sessions plan,
// Patient Profile's Recent Appointments, exports), fall back to the
// assigned therapist's real role — the same label shown in User Management
// — instead of showing the generic word. Shared single implementation so
// every one of those screens resolves it exactly the same way.
export function resolveAppointmentTypeLabel(
  type: string | null | undefined,
  therapistName: string | null | undefined,
  therapists: Array<{ name: string; role?: string | null; secondaryRole?: string | null; therapyType?: string | null }>
): string {
  const raw = (type || '').trim()
  const isGeneric = !raw || raw.toLowerCase() === 'therapy' || raw.toLowerCase() === 'consultation'
  if (!isGeneric) return raw
  const therapist = therapists.find((t) => t.name === therapistName)
  if (!therapist) return raw
  // An owner who also treats patients has role 'super_admin' — their
  // specialization/second role describes the session, their access role doesn't.
  return therapist.therapyType?.trim() ||
    getRoleLabel(therapist.secondaryRole || therapist.role) ||
    raw
}

export function getRoleColor(role: string | undefined | null): string {
  if (!role) return 'bg-gray-100 text-gray-800'
  return roleColors[role] || 'bg-gray-100 text-gray-800'
}

export function getRoleGradient(role: string | undefined | null): string {
  if (!role) return 'from-gray-400 to-gray-600'
  return roleGradients[role] || 'from-gray-400 to-gray-600'
}

interface AppState {
  // Auth
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean

  // Navigation
  currentPage: AppPage
  currentPatientId: string | null
  currentAppointmentId: string | null
  currentPackageId: string | null
  currentSessionId: string | null
  currentEmployeeId: string | null
  currentInvoiceId: string | null
  currentLeadId: string | null
  sidebarOpen: boolean
  searchQuery: string
  selectedDate: Date

  // Custom (admin-defined) role page access, keyed by role slug — populated
  // lazily for users whose role isn't one of the 9 built-ins.
  customRoleAccess: Record<string, AppPage[]>
  setCustomRoleAccess: (role: string, pages: AppPage[]) => void
  // Tracks whether the async /api/roles lookup has finished (successfully
  // or not) for a given custom role. Until it has, navigate()/hasAccess()
  // treat that role as "not yet known to be disallowed" instead of
  // silently redirecting every click back to the current page — see the
  // comment on navigate() below for why this existed as a real bug.
  customRoleAccessLoaded: Record<string, boolean>
  markCustomRoleAccessLoaded: (role: string) => void

  // Auth actions
  login: (user: AuthUser, token: string) => void
  logout: () => void
  updateUser: (updates: Partial<AuthUser>) => void
  hasAccess: (page: AppPage) => boolean

  // Branch actions
  currentBranch: BranchInfo | null
  setCurrentBranch: (branch: BranchInfo | null) => void

  // Navigation actions
  navigate: (page: AppPage) => void
  setSelectedPatient: (id: string | null) => void
  setSelectedAppointment: (id: string | null) => void
  setSelectedPackage: (id: string | null) => void
  setSelectedSession: (id: string | null) => void
  setSelectedEmployee: (id: string | null) => void
  setSelectedInvoice: (id: string | null) => void
  setSelectedLead: (id: string | null) => void
  setSidebarOpen: (open: boolean) => void
  setSearchQuery: (query: string) => void
  setSelectedDate: (date: Date) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Auth
      user: null,
      token: null,
      isAuthenticated: false,

      // Navigation
      currentPage: 'login',
      currentPatientId: null,
      currentAppointmentId: null,
      currentPackageId: null,
      currentSessionId: null,
      currentEmployeeId: null,
      currentInvoiceId: null,
      currentLeadId: null,
      currentBranch: null,
      sidebarOpen: true,
      searchQuery: '',
      customRoleAccess: {},
      setCustomRoleAccess: (role, pages) => set((state) => ({ customRoleAccess: { ...state.customRoleAccess, [role]: pages } })),
      customRoleAccessLoaded: {},
      markCustomRoleAccessLoaded: (role) => set((state) => ({ customRoleAccessLoaded: { ...state.customRoleAccessLoaded, [role]: true } })),
      selectedDate: new Date(),

      // Auth actions
      login: (user, token) => {
        const isParent = user.role === 'parent'
        set({
          user,
          token,
          isAuthenticated: true,
          currentPage: isParent ? 'parent-dashboard' : 'dashboard',
          currentBranch: user.branchId ? {
            id: user.branchId,
            name: user.branchName || '',
            code: user.branchCode || '',
            isActive: true,
          } : null,
        })
        syncHashToPage(isParent ? 'parent-dashboard' : 'dashboard', true)
      },

      updateUser: (updates) => {
        const currentUser = get().user
        if (currentUser) {
          set({ user: { ...currentUser, ...updates } })
        }
      },

      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          currentPage: 'login',
          currentPatientId: null,
          currentAppointmentId: null,
          currentPackageId: null,
          currentSessionId: null,
          currentEmployeeId: null,
          currentInvoiceId: null,
          currentLeadId: null,
        })
        syncHashToPage('login', true)
      },

      hasAccess: (page: AppPage) => {
        const { user, customRoleAccess, customRoleAccessLoaded } = get()
        if (!user) return false
        const builtIn = roleAccess[user.role]
        if (builtIn) return builtIn.includes(page)
        // Custom (admin-defined) role — its allowed-pages list comes from an
        // async /api/roles fetch (see page.tsx) that hasn't necessarily
        // resolved yet on a fresh login. Treat "not loaded yet" as "don't
        // know, so don't block" rather than falling back to the ['dashboard']
        // default — see navigate() below for why this matters.
        if (!customRoleAccessLoaded[user.role]) return true
        const allowed = customRoleAccess[user.role] || ['dashboard']
        return allowed.includes(page)
      },

      // Navigation actions
      //
      // ROOT CAUSE of "first sidebar click after login does nothing, works
      // after a refresh": for a user on a custom (admin-defined) role, the
      // list of pages they're allowed to see is fetched asynchronously from
      // /api/roles (see the useEffect in src/app/page.tsx) — it is NOT
      // available synchronously the instant the dashboard renders. The old
      // code below did:
      //   const allowed = roleAccess[user.role] || customRoleAccess[user.role]
      //   if (allowed && allowed.includes(page)) { ...navigate... }
      //   else { ...redirect to the 'dashboard' fallback... }
      // For a custom role, `roleAccess[user.role]` is always undefined (it's
      // not a built-in role), and `customRoleAccess[user.role]` is ALSO still
      // undefined for the first render or two, until that fetch resolves.
      // So `allowed` was undefined, the condition failed, and every click —
      // no matter which sidebar item — silently redirected to 'dashboard'.
      // Since the user typically lands on the dashboard right after login,
      // this redirect was a no-op *visually* (same page they're already on),
      // which is exactly "clicking does nothing." A manual refresh just gave
      // the fetch time to complete before the user's next click, which made
      // it look "fixed" — it wasn't a rendering/event-binding issue at all,
      // it was this permission check racing an async fetch on every attempt
      // until that fetch happened to win.
      //
      // Fix: mirror hasAccess()'s "unknown yet, don't block" rule — while a
      // custom role's permissions haven't loaded, optimistically allow the
      // navigation. The separate access-check effect in page.tsx (which
      // calls hasAccess() on every currentPage change) still redirects the
      // user away afterward if the now-loaded permissions really don't
      // include that page — so nothing insecure slips through, it's just no
      // longer blocked *before* we actually know the answer.
      navigate: (page) => {
        const { user, customRoleAccess, customRoleAccessLoaded } = get()
        if (!user) {
          set({ currentPage: 'login' })
          syncHashToPage('login', true)
          return
        }
        const builtIn = roleAccess[user.role]
        if (builtIn) {
          set({ currentPage: builtIn.includes(page) ? page : (user.role === 'parent' ? 'parent-dashboard' : 'dashboard') as AppPage })
          syncHashToPage(get().currentPage)
          return
        }
        if (!customRoleAccessLoaded[user.role]) {
          set({ currentPage: page })
          syncHashToPage(get().currentPage)
          return
        }
        const allowed = customRoleAccess[user.role]
        set({ currentPage: allowed && allowed.includes(page) ? page : 'dashboard' as AppPage })
        syncHashToPage(get().currentPage)
      },
      setSelectedPatient: (id) => set({ currentPatientId: id }),
      setSelectedAppointment: (id) => set({ currentAppointmentId: id }),
      setSelectedPackage: (id) => set({ currentPackageId: id }),
      setSelectedSession: (id) => set({ currentSessionId: id }),
      setSelectedEmployee: (id) => set({ currentEmployeeId: id }),
      setSelectedInvoice: (id) => set({ currentInvoiceId: id }),
      setSelectedLead: (id) => set({ currentLeadId: id }),
      setCurrentBranch: (branch) => set({ currentBranch: branch }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setSelectedDate: (date) => set({ selectedDate: date }),
    }),
    {
      name: 'app-store-v2',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        currentPage: state.currentPage,
        currentBranch: state.currentBranch,
        sidebarOpen: state.sidebarOpen,
      }),
      version: 2,
      // ── On rehydration, redirect detail pages back to their parent list ──
      // Detail pages (e.g. patient-profile) require a
      // selected entity (currentPatientId, etc.) which is NOT persisted. If the
      // app rehydrates directly onto a detail page, the user sees an empty
      // "Select a patient…" screen. Fix: always land on the parent list page.
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const parent = detailPageToParent[state.currentPage]
        if (parent) {
          state.currentPage = parent
        }
      },
    }
  )
)
