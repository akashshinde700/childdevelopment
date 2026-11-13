// Shared, server+client-safe definitions for the custom "Add New Role"
// feature. Kept independent of src/store/app-store.ts (zustand) so this can
// be imported from API routes with zero risk.

export interface RolePermission {
  module: string
  view: boolean
  create: boolean
  edit: boolean
  delete: boolean
}

export interface PermissionModuleDef {
  key: string
  label: string
  // AppPage values (from src/store/app-store.ts) unlocked when this module's
  // "view" permission is checked.
  pages: string[]
}

export const PERMISSION_MODULES: PermissionModuleDef[] = [
  { key: 'dashboard', label: 'Dashboard', pages: ['dashboard'] },
  { key: 'patients', label: 'Patients', pages: ['patients', 'patient-form', 'patient-profile', 'patient-history'] },
  { key: 'appointments', label: 'Appointments', pages: ['appointments', 'appointment-form'] },
  { key: 'session_packages', label: 'Session Packages', pages: ['packages', 'package-form'] },
  { key: 'assessments', label: 'Assessments', pages: ['assessments', 'assessment-form'] },
  { key: 'therapy_plans', label: 'Therapy Plans', pages: ['sessions'] },
  { key: 'billing', label: 'Billing', pages: ['billing', 'payments'] },
  { key: 'payroll', label: 'Payroll', pages: ['payroll', 'therapist-earnings'] },
  { key: 'reports', label: 'Reports', pages: ['reports'] },
  { key: 'user_management', label: 'User Management', pages: ['user-management'] },
  { key: 'masters', label: 'Masters', pages: ['system-config'] },
  { key: 'settings', label: 'Settings', pages: ['settings'] },
]

export function emptyPermissions(): RolePermission[] {
  return PERMISSION_MODULES.map((m) => ({ module: m.key, view: false, create: false, edit: false, delete: false }))
}

export function slugifyRoleName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'role'
}

// Given the permissions matrix a role was saved with, derive the list of
// AppPage keys it should be able to navigate to (any module with "view"
// checked unlocks its mapped pages). Dashboard is always included.
export function deriveAppPagesFromPermissions(permissions: RolePermission[] | null | undefined): string[] {
  const pages = new Set<string>(['dashboard'])
  if (Array.isArray(permissions)) {
    for (const perm of permissions) {
      if (!perm?.view) continue
      const mod = PERMISSION_MODULES.find((m) => m.key === perm.module)
      if (mod) mod.pages.forEach((p) => pages.add(p))
    }
  }
  return Array.from(pages)
}

export function hasAtLeastOnePermission(permissions: RolePermission[]): boolean {
  return permissions.some((p) => p.view || p.create || p.edit || p.delete)
}

// Custom roles are currently enforced for page navigation only — no action
// gate anywhere in the app reads create/edit/delete from a role's stored
// permissions. Until that's built, force every role (new or edited) to be
// view-only server-side, so the permission matrix never claims write access
// it doesn't actually grant.
export function normalizeToViewOnly(permissions: RolePermission[]): RolePermission[] {
  return permissions.map((p) => ({ ...p, create: false, edit: false, delete: false }))
}

// ── Assignable built-in roles ────────────────────────────────────────────
// Single source of truth for "which of the 9 built-in roles can this admin
// level hand out" — previously duplicated independently in both
// UserManagementPage.tsx and EmployeesPage.tsx with byte-identical lists.
// 'admin' is intentionally NOT assignable from any UI/API (product
// decision 2026-07-09): every staff login is receptionist/therapist-level,
// and the clinic owner (super_admin) is the only elevated account. If a
// clinic ever needs a branch-manager admin, add 'admin' back here — both
// the dropdowns and the server-side checks read from this one list.
const SUPER_ADMIN_ASSIGNABLE_ROLES = [
  'receptionist', 'therapist_speech', 'therapist_ot',
  'therapist_behavioral', 'therapist_remedial', 'psychologist', 'parent',
] as const

const ADMIN_ASSIGNABLE_ROLES = [
  'receptionist', 'therapist_speech', 'therapist_ot',
  'therapist_behavioral', 'therapist_remedial', 'psychologist', 'parent',
] as const

export function getAssignableRoles(currentUserRole: string | undefined | null): readonly string[] {
  if (currentUserRole === 'super_admin') return SUPER_ADMIN_ASSIGNABLE_ROLES
  if (currentUserRole === 'admin') return ADMIN_ASSIGNABLE_ROLES
  return []
}

// Role → default User.therapyType mapping (values match THERAPY_TYPES used
// across packages/sessions). Used when creating a therapist login so their
// sessions default to the right therapy type without manual entry.
export const ROLE_THERAPY_TYPE: Record<string, string> = {
  therapist_speech: 'Speech Therapy',
  therapist_ot: 'Occupational Therapy',
  therapist_behavioral: 'Behavioral Therapy',
  therapist_remedial: 'Remedial Therapy',
  psychologist: 'Counseling',
}

// Role → human designation used when auto-creating an Employee (HR) record
// for a staff login. Mirrors getRoleLabel() in the app store, duplicated
// here because API routes can't import client-store code.
export const ROLE_DESIGNATION: Record<string, string> = {
  receptionist: 'Receptionist',
  therapist_speech: 'Speech Therapist',
  therapist_ot: 'Occupational Therapist',
  therapist_behavioral: 'Behavioral Therapist',
  therapist_remedial: 'Remedial Therapist',
  psychologist: 'Clinical Psychologist',
  admin: 'Admin',
}

// Staff = anyone who works at the clinic and can appear on payroll.
// Parents are portal guests; super_admin is the owner account.
export function isStaffRole(role: string): boolean {
  return role !== 'parent' && role !== 'super_admin'
}
