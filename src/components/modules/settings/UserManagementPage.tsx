'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Search, Users, Building2, Pencil, Trash2, Phone, Mail, MapPin,
  Loader2, Shield, ShieldCheck, UserPlus, UserCog, Eye, EyeOff,
  ChevronDown, UsersRound, Activity, X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  useAppStore, type UserRole, getRoleLabel, getRoleColor, getRoleGradient,
} from '@/store/app-store'
import { toast } from 'sonner'
import { authFetch } from '@/lib/api-client'
import { AddRoleDialog, type CreatedRole } from './AddRoleDialog'
import { getAssignableRoles } from '@/lib/role-permissions'
import { THERAPIST_ROLES } from '@/lib/therapists'
import { TherapyTypeSelect } from '@/components/shared/TherapyTypeSelect'

const ADD_NEW_ROLE_VALUE = '__add_new_role__'

interface RoleOption {
  value: string
  label: string
  isSystem: boolean
  description?: string | null
}

// ============ TYPES ============

interface Branch {
  id: string
  name: string
  code: string
  address?: string
  phone?: string
  email?: string
  city?: string
  state?: string
  pincode?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  _count?: {
    users: number
    patients: number
    employees: number
  }
}

interface UserItem {
  id: string
  email: string
  name: string
  phone?: string
  role: string
  branchId?: string | null
  branch?: { id: string; name: string; code: string } | null
  isActive: boolean
  avatar?: string
  createdAt: string
  updatedAt: string
  lastLogin?: string | null
  patientId?: string | null
  takesSessions?: boolean
  therapyType?: string | null
  secondaryRole?: string | null
}

interface BranchForm {
  name: string
  code: string
  address: string
  phone: string
  email: string
  city: string
  state: string
  pincode: string
}

interface UserForm {
  name: string
  email: string
  password: string
  phone: string
  role: string
  branchId: string
  isActive: boolean
  takesSessions: boolean
  therapyType: string
  secondaryRole: string
}

// ============ CONSTANTS ============

// Accounts that can be flagged "also takes therapy sessions": anything that
// isn't already a therapist role, and not a parent.
function canTakeSessions(role: string) {
  return !!role && role !== 'parent' && !THERAPIST_ROLES.includes(role)
}

const ALL_ROLES: UserRole[] = [
  'super_admin', 'admin', 'receptionist',
  'therapist_speech', 'therapist_ot', 'therapist_behavioral',
  'therapist_remedial', 'psychologist', 'parent',
]

// All roles for filtering
const FILTERABLE_ROLES: { value: string; label: string; icon: string }[] = [
  { value: 'all', label: 'All Roles', icon: '👥' },
  { value: 'super_admin', label: 'Super Admin', icon: '👑' },
  { value: 'admin', label: 'Admin', icon: '🛡️' },
  { value: 'receptionist', label: 'Receptionist', icon: '📋' },
  { value: 'therapist_speech', label: 'Speech Therapist', icon: '🗣️' },
  { value: 'therapist_ot', label: 'Occupational Therapist', icon: '🤲' },
  { value: 'therapist_behavioral', label: 'Behavioral Therapist', icon: '🧠' },
  { value: 'therapist_remedial', label: 'Remedial Therapist', icon: '📚' },
  { value: 'psychologist', label: 'Clinical Psychologist', icon: '🩺' },
  { value: 'parent', label: 'Parent', icon: '👨‍👧' },
]

function getRoleColorDot(role: string): string {
  switch (role) {
    case 'super_admin': return 'bg-red-500'
    case 'admin': return 'bg-blue-500'
    case 'receptionist': return 'bg-teal-500'
    case 'therapist_speech': return 'bg-teal-500'
    case 'therapist_ot': return 'bg-purple-500'
    case 'therapist_behavioral': return 'bg-orange-500'
    case 'therapist_remedial': return 'bg-yellow-500'
    case 'psychologist': return 'bg-indigo-500'
    default: return 'bg-green-500'
  }
}

const emptyBranchForm: BranchForm = {
  name: '', code: '', address: '', phone: '',
  email: '', city: '', state: '', pincode: '',
}

const emptyUserForm: UserForm = {
  name: '', email: '', password: '', phone: '', role: '', branchId: '', isActive: true,
  takesSessions: false, therapyType: '', secondaryRole: '',
}

// ============ SKELETON LOADERS ============

function BranchCardSkeleton() {
  return (
    <Card className="relative overflow-hidden">
      <Skeleton className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary/20 to-primary/40" />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
      </CardContent>
    </Card>
  )
}

function UserTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead className="hidden sm:table-cell">Role</TableHead>
          <TableHead className="hidden md:table-cell">Branch</TableHead>
          <TableHead className="hidden lg:table-cell">Email</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 6 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-8 w-40" /></TableCell>
            <TableCell className="hidden sm:table-cell"><Skeleton className="h-6 w-24" /></TableCell>
            <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
            <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-36" /></TableCell>
            <TableCell><Skeleton className="h-6 w-16" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// ============ MAIN COMPONENT ============

export default function UserManagementPage() {
  const { user: currentUser, searchQuery: globalSearchQuery, setSearchQuery: setGlobalSearchQuery } = useAppStore()
  const isSuperAdmin = currentUser?.role === 'super_admin'

  // ============ DATA STATE ============
  const [branches, setBranches] = useState<Branch[]>([])
  const [users, setUsers] = useState<UserItem[]>([])
  const [loadingBranches, setLoadingBranches] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([])
  const [addRoleDialogOpen, setAddRoleDialogOpen] = useState(false)

  // ============ BRANCH DIALOG STATE ============
  const [branchDialogOpen, setBranchDialogOpen] = useState(false)
  const [branchEditing, setBranchEditing] = useState(false)
  const [branchForm, setBranchForm] = useState<BranchForm>(emptyBranchForm)
  const [branchSubmitting, setBranchSubmitting] = useState(false)
  const [branchToEdit, setBranchToEdit] = useState<Branch | null>(null)
  const [deleteBranchDialogOpen, setDeleteBranchDialogOpen] = useState(false)
  const [branchToDelete, setBranchToDelete] = useState<Branch | null>(null)

  // ============ USER DIALOG STATE ============
  const [userDialogOpen, setUserDialogOpen] = useState(false)
  const [userEditing, setUserEditing] = useState(false)
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm)
  const [userSubmitting, setUserSubmitting] = useState(false)
  const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false)
  const [userToEdit, setUserToEdit] = useState<UserItem | null>(null)
  const [userToDelete, setUserToDelete] = useState<UserItem | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  // ============ FILTER STATE ============
  const [search, setSearch] = useState('')

  // Sync global search to local search
  useEffect(() => {
    if (globalSearchQuery) {
      setSearch(globalSearchQuery)
      setGlobalSearchQuery('')
    }
  }, [globalSearchQuery, setGlobalSearchQuery])
  const [filterBranchId, setFilterBranchId] = useState<string>('')
  const [filterRole, setFilterRole] = useState<string>('all')

  // ============ ACTIVE SECTION ============
  const [activeSection, setActiveSection] = useState<'branches' | 'users'>('users')

  // ============ COMPUTED ============

  // Available roles for creation based on current user's role — built-in
  // roles filtered per the existing tiering, plus all custom (admin-created)
  // roles fetched from /api/roles.
  const availableRoles = useMemo<RoleOption[]>(() => {
    const allowedBuiltIns = getAssignableRoles(currentUser?.role)
    const builtInOptions: RoleOption[] = allowedBuiltIns.map((value) => ({ value, label: getRoleLabel(value), isSystem: true }))
    const customOptions = roleOptions.filter((r) => !r.isSystem)
    return [...builtInOptions, ...customOptions]
  }, [isSuperAdmin, currentUser?.role, roleOptions])

  const findCustomRole = useCallback(
    (role: string) => roleOptions.find((r) => r.value === role && !r.isSystem),
    [roleOptions]
  )
  const customRoleLabel = useCallback((role: string) => findCustomRole(role)?.label, [findCustomRole])
  // This clinic's own role names are offered as therapy types too — a clinic
  // that added a "Pediatric Physiotherapist" role usually wants that as the
  // specialization as well.
  // The account being edited is the clinic's last Org Admin: its role is
  // fixed (the API refuses to change it) — losing it would lock everyone out
  // of Settings, staff and billing.
  const isLastOrgAdmin = useMemo(
    () => !!userToEdit && userToEdit.role === 'super_admin' && userToEdit.isActive &&
      users.filter((u) => u.role === 'super_admin' && u.isActive).length <= 1,
    [userToEdit, users]
  )

  // super_admin/admin are never in getAssignableRoles, so editing such an
  // account showed an EMPTY Role box — and picking anything from the list
  // silently demoted them. Keep the current role in the list so it displays
  // and survives a save that only touched other fields.
  const roleSelectOptions = useMemo<RoleOption[]>(() => {
    if (!userEditing || !userToEdit) return availableRoles
    if (availableRoles.some((r) => r.value === userToEdit.role)) return availableRoles
    return [
      { value: userToEdit.role, label: customRoleLabel(userToEdit.role) || getRoleLabel(userToEdit.role), isSystem: true },
      ...availableRoles,
    ]
  }, [userEditing, userToEdit, availableRoles, customRoleLabel])

  const customRoleLabels = useMemo(
    () => roleOptions.filter((r) => !r.isSystem).map((r) => r.label),
    [roleOptions]
  )

  // Available branches for the current user to assign
  const availableBranches = useMemo(() => {
    if (isSuperAdmin) return branches.filter(b => b.isActive)
    return branches.filter(b => b.id === currentUser?.branchId && b.isActive)
  }, [branches, isSuperAdmin, currentUser?.branchId])

  // Filtered users
  const filteredUsers = useMemo(() => {
    let result = users

    // Branch filter
    if (isSuperAdmin) {
      if (filterBranchId) {
        result = result.filter(u => u.branchId === filterBranchId)
      }
    } else {
      // Admin can only see their branch users
      result = result.filter(u => u.branchId === currentUser?.branchId)
    }

    // Role filter
    if (filterRole && filterRole !== 'all') {
      result = result.filter(u => u.role === filterRole)
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.branch?.name || '').toLowerCase().includes(q)
      )
    }

    return result
  }, [users, filterBranchId, filterRole, search, isSuperAdmin, currentUser?.branchId])

  // User stats
  const userStats = useMemo(() => {
    const total = filteredUsers.length
    const active = filteredUsers.filter(u => u.isActive).length
    const inactive = filteredUsers.filter(u => !u.isActive).length
    const roleCounts: Record<string, number> = {}
    filteredUsers.forEach(u => {
      roleCounts[u.role] = (roleCounts[u.role] || 0) + 1
    })
    return { total, active, inactive, roleCounts }
  }, [filteredUsers])

  // ============ FETCH DATA ============

  const fetchBranches = useCallback(async () => {
    setLoadingBranches(true)
    try {
      const res = await authFetch('/api/branches')
      if (!res.ok) throw new Error('Failed to fetch branches')
      const data = await res.json()
      setBranches(data)
    } catch {
      toast.error('Failed to load branches')
    } finally {
      setLoadingBranches(false)
    }
  }, [])

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true)
    try {
      const params = new URLSearchParams()
      if (filterBranchId) params.set('branchId', filterBranchId)
      if (filterRole && filterRole !== 'all') params.set('role', filterRole)
      if (search) params.set('search', search)
      const res = await authFetch(`/api/users?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch users')
      const data = await res.json()
      setUsers(data)
    } catch {
      toast.error('Failed to load users')
    } finally {
      setLoadingUsers(false)
    }
  }, [filterBranchId, filterRole])

  const fetchRoles = useCallback(async () => {
    try {
      const res = await authFetch('/api/roles')
      if (!res.ok) return
      const data = await res.json()
      setRoleOptions(data.roles || [])
    } catch {
      // Non-fatal — built-in roles still work via lib/role-permissions.ts's getAssignableRoles()
    }
  }, [])

  useEffect(() => { fetchBranches() }, [fetchBranches])
  useEffect(() => { fetchUsers() }, [fetchUsers])
  useEffect(() => { fetchRoles() }, [fetchRoles])

  // ============ BRANCH CRUD ============

  const openAddBranch = () => {
    setBranchForm(emptyBranchForm)
    setBranchEditing(false)
    setBranchDialogOpen(true)
  }

  const openEditBranch = (branch: Branch) => {
    setBranchForm({
      name: branch.name,
      code: branch.code,
      address: branch.address || '',
      phone: branch.phone || '',
      email: branch.email || '',
      city: branch.city || '',
      state: branch.state || '',
      pincode: branch.pincode || '',
    })
    setBranchToEdit(branch)
    setBranchEditing(true)
    setBranchDialogOpen(true)
  }

  const handleBranchSubmit = async () => {
    if (!branchForm.name.trim()) { toast.error('Branch name is required'); return }
    if (!branchForm.code.trim()) { toast.error('Branch code is required'); return }

    setBranchSubmitting(true)
    try {
      if (branchEditing && branchToEdit) {
        const res = await authFetch('/api/branches', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: branchToEdit.id, ...branchForm }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Failed to update branch')
        }
        toast.success('Branch updated successfully')
      } else {
        const res = await authFetch('/api/branches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(branchForm),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Failed to create branch')
        }
        toast.success('Branch created successfully')
      }

      setBranchDialogOpen(false)
      setBranchToEdit(null)
      fetchBranches()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Operation failed')
    } finally {
      setBranchSubmitting(false)
    }
  }

  const openDeleteBranch = (branch: Branch) => {
    setBranchToDelete(branch)
    setDeleteBranchDialogOpen(true)
  }

  const handleDeleteBranch = async () => {
    if (!branchToDelete) return
    try {
      const res = await authFetch(`/api/branches?id=${branchToDelete.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete branch')
      }
      toast.success('Branch deleted successfully')
      setDeleteBranchDialogOpen(false)
      setBranchToDelete(null)
      fetchBranches()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete branch')
    }
  }

  const handleToggleBranchActive = async (branch: Branch) => {
    try {
      const res = await authFetch('/api/branches', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: branch.id, isActive: !branch.isActive }),
      })
      if (!res.ok) throw new Error()
      toast.success(branch.isActive ? 'Branch deactivated' : 'Branch activated')
      fetchBranches()
    } catch {
      toast.error('Failed to update branch status')
    }
  }

  // ============ USER CRUD ============

  // Fired when AddRoleDialog successfully creates a role. Refreshes the Role
  // dropdown and auto-selects the new role — the Create/Edit User dialog
  // stays open throughout, so every other field the admin already typed is
  // preserved untouched.
  const handleRoleCreated = (newRole: CreatedRole) => {
    setRoleOptions((prev) => [...prev, { value: newRole.value, label: newRole.name, isSystem: false }])
    setUserForm((prev) => ({ ...prev, role: newRole.value }))
  }

  const openAddUser = () => {
    setUserForm(emptyUserForm)
    setUserEditing(false)
    setShowPassword(false)
    // Pre-select branch if admin
    if (!isSuperAdmin && currentUser?.branchId) {
      setUserForm(prev => ({ ...prev, branchId: currentUser.branchId || '' }))
    }
    setUserDialogOpen(true)
  }

  const openEditUser = (user: UserItem) => {
    setUserForm({
      name: user.name,
      email: user.email,
      password: '',
      phone: user.phone || '',
      role: user.role,
      branchId: user.branchId || '',
      isActive: user.isActive,
      takesSessions: user.takesSessions === true,
      therapyType: user.therapyType || '',
      secondaryRole: user.secondaryRole || '',
    })
    setUserToEdit(user)
    setUserEditing(true)
    setShowPassword(false)
    setUserDialogOpen(true)
  }

  const handleUserSubmit = async () => {
    if (!userForm.name.trim()) { toast.error('Name is required'); return }
    if (!userForm.email.trim()) { toast.error('Email is required'); return }
    if (!userForm.role) { toast.error('Role is required'); return }
    if (!userEditing && !userForm.password.trim()) { toast.error('Password is required'); return }
    if (!isSuperAdmin && !userForm.branchId) { toast.error('Branch assignment is required'); return }

    setUserSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        name: userForm.name,
        email: userForm.email,
        phone: userForm.phone || null,
        role: userForm.role,
        branchId: userForm.branchId || null,
        isActive: userForm.isActive,
      }
      // "Also takes therapy sessions" — only for roles that aren't already
      // a therapist role (the server applies the same rule).
      if (canTakeSessions(userForm.role)) {
        payload.takesSessions = userForm.takesSessions
        payload.secondaryRole = userForm.takesSessions ? (userForm.secondaryRole || null) : null
        if (userForm.takesSessions) payload.therapyType = userForm.therapyType || null
      }

      if (!userEditing) {
        payload.password = userForm.password
      } else {
        // Only update password if provided
        if (userForm.password.trim()) {
          payload.password = userForm.password
        }
      }

      if (userEditing && userToEdit) {
        const res = await authFetch('/api/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: userToEdit.id, ...payload }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Failed to update user')
        }
        toast.success('User updated successfully')
      } else {
        const res = await authFetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Failed to create user')
        }
        toast.success('User created successfully')
      }

      setUserDialogOpen(false)
      setUserToEdit(null)
      fetchUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Operation failed')
    } finally {
      setUserSubmitting(false)
    }
  }

  const openDeleteUser = (user: UserItem) => {
    setUserToDelete(user)
    setDeleteUserDialogOpen(true)
  }

  const handleDeleteUser = async () => {
    if (!userToDelete) return
    try {
      const res = await authFetch(`/api/users?id=${userToDelete.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete user')
      }
      toast.success('User deleted successfully')
      setDeleteUserDialogOpen(false)
      setUserToDelete(null)
      fetchUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete user')
    }
  }

  const handleToggleUserActive = async (user: UserItem) => {
    try {
      const res = await authFetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, isActive: !user.isActive }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update user status')
      }
      toast.success(user.isActive ? 'User deactivated' : 'User activated')
      fetchUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update user status')
    }
  }

  // ============ RENDER HELPERS ============

  const getRoleBadge = (role: string) => {
    const label = customRoleLabel(role) || getRoleLabel(role)
    const colorClass = getRoleColor(role)
    return (
      <Badge variant="outline" className={`${colorClass} border-current/20 font-medium`}>
        {label}
      </Badge>
    )
  }

  // ============ RENDER ============

  // Access guard: only Super Admin can view/manage User Management
  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-6">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <Shield className="size-8 text-red-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
        <p className="text-sm text-gray-500 max-w-md">
          The User Management module is restricted to <span className="font-semibold text-gray-700">Super Admin</span> only.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="size-6 text-primary" />
            User Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage branches and user accounts for your center
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={activeSection === 'branches' && isSuperAdmin ? 'default' : 'outline'}
            size="sm"
            className="gap-2"
            onClick={() => setActiveSection('branches')}
          >
            <Building2 className="size-4" />
            <span className="hidden sm:inline">Branches</span>
            {isSuperAdmin && branches.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{branches.length}</Badge>
            )}
          </Button>
          <Button
            variant={activeSection === 'users' ? 'default' : 'outline'}
            size="sm"
            className="gap-2"
            onClick={() => setActiveSection('users')}
          >
            <Users className="size-4" />
            <span className="hidden sm:inline">Users</span>
            {users.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{users.length}</Badge>
            )}
          </Button>
        </div>
      </div>

      {/* ============ BRANCH MANAGEMENT SECTION ============ */}
      {isSuperAdmin && activeSection === 'branches' && (
        <section className="space-y-4">
          {/* Branch Section Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0F7A87] to-[#0B5A64] text-white">
                <Building2 className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Branch Management</h2>
                <p className="text-sm text-muted-foreground">
                  {branches.length} {branches.length === 1 ? 'branch' : 'branches'} configured
                </p>
              </div>
            </div>
            <Button onClick={openAddBranch} className="gap-2" size="sm">
              <Plus className="size-4" /> Add Branch
            </Button>
          </div>

          {/* Branch Cards Grid */}
          {loadingBranches ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => <BranchCardSkeleton key={i} />)}
            </div>
          ) : branches.length === 0 ? (
            <Card className="py-12">
              <CardContent className="flex flex-col items-center justify-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
                  <Building2 className="size-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-1">No Branches Yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Create your first branch to start managing your center locations</p>
                <Button onClick={openAddBranch} className="gap-2">
                  <Plus className="size-4" /> Add Branch
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {branches.map(branch => (
                <Card
                  key={branch.id}
                  className={`relative overflow-hidden transition-all hover:shadow-md ${!branch.isActive ? 'opacity-60' : ''}`}
                >
                  {/* Top accent bar */}
                  <div className={`absolute top-0 left-0 right-0 h-1.5 ${
                    branch.isActive
                      ? 'bg-gradient-to-r from-[#0F7A87] to-[#F2673D]'
                      : 'bg-gradient-to-r from-gray-300 to-gray-400'
                  }`} />

                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-base flex items-center gap-2">
                          {branch.name}
                          {!branch.isActive && (
                            <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">Inactive</Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-1.5 text-xs">
                          <Badge variant="secondary" className="text-xs font-mono">{branch.code}</Badge>
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost" size="icon" className="size-8"
                          onClick={() => openEditBranch(branch)} title="Edit branch" aria-label="Edit branch"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="size-8 text-destructive"
                          onClick={() => openDeleteBranch(branch)} title="Delete branch" aria-label="Delete branch"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {branch.address && (
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <span className="text-muted-foreground line-clamp-2">{branch.address}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {branch.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="size-3.5 shrink-0" />
                          <span>{branch.phone}</span>
                        </div>
                      )}
                      {branch.email && (
                        <div className="flex items-center gap-1.5">
                          <Mail className="size-3.5 shrink-0" />
                          <span className="truncate">{branch.email}</span>
                        </div>
                      )}
                    </div>
                    {(branch.city || branch.state) && (
                      <div className="text-xs text-muted-foreground">
                        {[branch.city, branch.state, branch.pincode].filter(Boolean).join(', ')}
                      </div>
                    )}
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Users className="size-3.5 text-primary" />
                          <span className="text-muted-foreground">
                            <span className="font-semibold text-foreground">{branch._count?.users || 0}</span> users
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <UsersRound className="size-3.5 text-[#F2673D]" />
                          <span className="text-muted-foreground">
                            <span className="font-semibold text-foreground">{branch._count?.patients || 0}</span> patients
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {branch.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <Switch
                          checked={branch.isActive}
                          onCheckedChange={() => handleToggleBranchActive(branch)}
                          size="sm"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ============ USER MANAGEMENT SECTION ============ */}
      {activeSection === 'users' && (
        <section className="space-y-4">
          {/* User Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-l-4 border-l-[#0F7A87]">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F7A87]/10 shrink-0">
                    <Users className="size-5 text-[#0F7A87]" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Users</p>
                    <p className="text-xl font-bold">{userStats.total}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 shrink-0">
                    <Activity className="size-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Active</p>
                    <p className="text-xl font-bold">{userStats.active}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-orange-400">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-400/10 shrink-0">
                    <UserCog className="size-5 text-orange-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Inactive</p>
                    <p className="text-xl font-bold">{userStats.inactive}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-[#F2673D]">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F2673D]/10 shrink-0">
                    <ShieldCheck className="size-5 text-[#F2673D]" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Unique Roles</p>
                    <p className="text-xl font-bold">{Object.keys(userStats.roleCounts).length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search & Filters */}
          <Card>
            <CardContent className="p-4 space-y-4">
              {/* Role Filter Tabs */}
              <ScrollArea className="w-full">
                <Tabs value={filterRole} onValueChange={setFilterRole}>
                  <TabsList className="w-full justify-start h-auto flex-wrap gap-1 bg-transparent p-0">
                    {FILTERABLE_ROLES.map(r => {
                      const isActive = filterRole === r.value
                      const hasUsers = r.value === 'all' || (userStats.roleCounts[r.value] || 0) > 0
                      return (
                        <TabsTrigger
                          key={r.value}
                          value={r.value}
                          className={`
                            px-3 py-1.5 text-xs rounded-full transition-all
                            ${isActive
                              ? 'bg-[#0F7A87] text-white data-[state=active]:bg-[#0F7A87] data-[state=active]:text-white shadow-sm'
                              : 'data-[state=active]:bg-muted bg-muted/50 text-muted-foreground hover:text-foreground'
                            }
                          `}
                        >
                          <span className="mr-1">{r.icon}</span>
                          {r.label}
                          {r.value !== 'all' && userStats.roleCounts[r.value] ? (
                            <span className={`ml-1 text-[10px] ${isActive ? 'text-white/70' : 'text-muted-foreground'}`}>
                              {userStats.roleCounts[r.value]}
                            </span>
                          ) : null}
                        </TabsTrigger>
                      )
                    })}
                  </TabsList>
                </Tabs>
              </ScrollArea>

              <Separator />

              {/* Search & Branch Filter */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, or branch..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                  {search && (
                    <Button
                      variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 size-7"
                      onClick={() => setSearch('')}
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
                {isSuperAdmin && (
                  <Select value={filterBranchId || 'all'} onValueChange={(v) => setFilterBranchId(v === 'all' ? '' : v)}>
                    <SelectTrigger className="w-full sm:w-52">
                      <Building2 className="size-4 mr-2" />
                      <SelectValue placeholder="All Branches" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Branches</SelectItem>
                      <SelectGroup>
                        {branches.filter(b => b.isActive).map(b => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name} ({b.code})
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
                <Button onClick={openAddUser} className="gap-2 sm:ml-auto" disabled={availableRoles.length === 0}>
                  <UserPlus className="size-4" /> Add User
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Users Table */}
          <Card>
            <CardContent className="p-0">
              {loadingUsers ? (
                <div className="p-4">
                  <UserTableSkeleton />
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-16 flex flex-col items-center text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
                    <Users className="size-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium mb-1">
                    {search || filterRole !== 'all' || filterBranchId ? 'No Users Found' : 'No Users Yet'}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4 max-w-md">
                    {search || filterRole !== 'all' || filterBranchId
                      ? 'Try adjusting your search or filters to find users.'
                      : 'Create user accounts to start managing access for your center staff and parents.'
                    }
                  </p>
                  {!search && filterRole === 'all' && !filterBranchId && availableRoles.length > 0 && (
                    <Button onClick={openAddUser} className="gap-2">
                      <UserPlus className="size-4" /> Create First User
                    </Button>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">User</TableHead>
                      <TableHead className="hidden sm:table-cell">Role</TableHead>
                      <TableHead className="hidden md:table-cell">Branch</TableHead>
                      <TableHead className="hidden lg:table-cell">Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map(u => (
                      <TableRow key={u.id} className={!u.isActive ? 'opacity-60' : ''}>
                        {/* User Name */}
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={`flex h-9 w-9 items-center justify-center rounded-full text-white text-xs font-bold shrink-0 bg-gradient-to-br ${getRoleGradient(u.role)}`}>
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{u.name}</p>
                              {u.phone && (
                                <p className="text-xs text-muted-foreground sm:hidden">{u.phone}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        {/* Role */}
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex flex-wrap items-center gap-1">
                            {getRoleBadge(u.role)}
                            {u.secondaryRole && getRoleBadge(u.secondaryRole)}
                          </div>
                        </TableCell>
                        {/* Branch */}
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-1.5 text-sm">
                            <Building2 className="size-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate max-w-[140px]">{u.branch?.name || '—'}</span>
                          </div>
                        </TableCell>
                        {/* Email */}
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Mail className="size-3.5 shrink-0" />
                            <span className="truncate max-w-[180px]">{u.email}</span>
                          </div>
                        </TableCell>
                        {/* Status */}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={u.isActive
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : 'bg-gray-100 text-gray-600 border-gray-200'
                              }
                            >
                              {u.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        </TableCell>
                        {/* Actions */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost" size="icon" className="size-8"
                              onClick={() => openEditUser(u)} title="Edit user" aria-label="Edit user"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="size-8"
                              onClick={() => handleToggleUserActive(u)}
                              title={u.isActive ? 'Deactivate user' : 'Activate user'}
                              aria-label={u.isActive ? 'Deactivate user' : 'Activate user'}
                            >
                              {u.isActive ? (
                                <EyeOff className="size-3.5 text-orange-500" />
                              ) : (
                                <Eye className="size-3.5 text-emerald-500" />
                              )}
                            </Button>
                            {u.role !== 'super_admin' && (
                              <Button
                                variant="ghost" size="icon" className="size-8 text-destructive"
                                onClick={() => openDeleteUser(u)} title="Delete user" aria-label="Delete user"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Filter result summary */}
          {!loadingUsers && filteredUsers.length > 0 && (search || filterRole !== 'all' || filterBranchId) && (
            <div className="text-sm text-muted-foreground text-center">
              Showing {filteredUsers.length} of {users.length} users
            </div>
          )}
        </section>
      )}

      {/* ============ ADD/EDIT BRANCH DIALOG ============ */}
      <Dialog open={branchDialogOpen} onOpenChange={(open) => {
        setBranchDialogOpen(open)
        if (!open) { setBranchEditing(false); setBranchToDelete(null) }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-5 text-primary" />
              {branchEditing ? 'Edit Branch' : 'Add New Branch'}
            </DialogTitle>
            <DialogDescription>
              {branchEditing
                ? `Update details for ${branchToEdit?.name}`
                : 'Create a new branch location for your center'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Branch Name *</Label>
                <Input
                  placeholder="e.g., Main Branch - Anna Nagar"
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Branch Code *</Label>
                <Input
                  placeholder="e.g., BR1"
                  value={branchForm.code}
                  onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value.toUpperCase() })}
                  disabled={branchEditing}
                  className={branchEditing ? 'bg-muted' : ''}
                />
                {branchEditing && (
                  <p className="text-xs text-muted-foreground">Branch code cannot be changed</p>
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Contact Details</h3>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input
                  placeholder="Full street address"
                  value={branchForm.address}
                  onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    placeholder="Phone number"
                    value={branchForm.phone}
                    onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="Branch email"
                    value={branchForm.email}
                    onChange={(e) => setBranchForm({ ...branchForm, email: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Location</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input
                    placeholder="City"
                    value={branchForm.city}
                    onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input
                    placeholder="State"
                    value={branchForm.state}
                    onChange={(e) => setBranchForm({ ...branchForm, state: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pincode</Label>
                  <Input
                    placeholder="Pincode"
                    value={branchForm.pincode}
                    onChange={(e) => setBranchForm({ ...branchForm, pincode: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBranchDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleBranchSubmit} disabled={branchSubmitting} className="gap-2">
              {branchSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Building2 className="size-4" />}
              {branchSubmitting ? 'Saving...' : branchEditing ? 'Update Branch' : 'Create Branch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ DELETE BRANCH CONFIRMATION ============ */}
      <AlertDialog open={deleteBranchDialogOpen} onOpenChange={setDeleteBranchDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Branch</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{branchToDelete?.name}</strong> ({branchToDelete?.code})?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBranch}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete Branch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============ ADD/EDIT USER DIALOG ============ */}
      <Dialog open={userDialogOpen} onOpenChange={(open) => {
        setUserDialogOpen(open)
        if (!open) { setUserEditing(false); setUserToEdit(null); setUserToDelete(null) }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-5 text-primary" />
              {userEditing ? 'Edit User' : 'Create New User'}
            </DialogTitle>
            <DialogDescription>
              {userEditing
                ? `Update account details for ${userToEdit?.name}`
                : `Create a new account — available roles: staff and parents`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input
                  placeholder="e.g., Dr. Priya Sharma"
                  value={userForm.name}
                  onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  placeholder="user@email.com"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label>{userEditing ? 'New Password (leave blank to keep current)' : 'Password *'}</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={userEditing ? 'Enter new password...' : 'Set initial password'}
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 size-7"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </Button>
              </div>
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label>Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  type="tel"
                  placeholder="Phone number"
                  value={userForm.phone}
                  onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Role & Branch */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Role *</Label>
                <Select
                  value={userForm.role}
                  disabled={isLastOrgAdmin}
                  onValueChange={(v) => {
                    if (v === ADD_NEW_ROLE_VALUE) {
                      setAddRoleDialogOpen(true)
                      return
                    }
                    setUserForm({ ...userForm, role: v })
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {roleSelectOptions.map(({ value, label, isSystem }) => (
                        <SelectItem key={value} value={value}>
                          <div className="flex items-center gap-2">
                            <span className={`inline-block w-2 h-2 rounded-full ${isSystem ? getRoleColorDot(value) : 'bg-violet-500'}`} />
                            {label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <Separator className="my-1" />
                    <SelectItem value={ADD_NEW_ROLE_VALUE} className="text-primary font-medium">
                      <div className="flex items-center gap-2">
                        <Plus className="size-3.5" />
                        Add New Role
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {isLastOrgAdmin && (
                  <p className="text-xs text-muted-foreground">
                    This clinic&apos;s only Org Admin — the role is fixed. Use &quot;Also takes therapy sessions&quot; below to show what they treat.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Branch *</Label>
                <Select
                  value={userForm.branchId || '_none'}
                  onValueChange={(v) => setUserForm({ ...userForm, branchId: v === '_none' ? '' : v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBranches.length > 0 ? (
                      availableBranches.map(b => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} ({b.code})
                        </SelectItem>
                      ))
                    ) : (
                      <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                        No active branches available
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Owner/admin or custom role who also treats patients */}
            {canTakeSessions(userForm.role) && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-1">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Also takes therapy sessions</Label>
                      <p className="text-xs text-muted-foreground">
                        Keeps this role&apos;s access, and also lists them as a therapist for appointments, sessions and assessments
                      </p>
                    </div>
                    <Switch
                      checked={userForm.takesSessions}
                      onCheckedChange={(checked) => setUserForm({ ...userForm, takesSessions: checked })}
                    />
                  </div>
                  {userForm.takesSessions && (
                    <div className="space-y-2">
                      <Label>Second role (optional)</Label>
                      <Select
                        value={userForm.secondaryRole || '_none'}
                        onValueChange={(v) => {
                          const next = v === '_none' ? '' : v
                          setUserForm((prev) => ({
                            ...prev,
                            secondaryRole: next,
                            // Default the specialization to the role's own name
                            // the first time one is picked.
                            therapyType: prev.therapyType ||
                              (next ? (customRoleLabel(next) || getRoleLabel(next)) : ''),
                          }))
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="No second role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">No second role</SelectItem>
                          {availableRoles
                            .filter((r) => r.value !== userForm.role && r.value !== 'parent')
                            .map(({ value, label }) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        The job they also do. Access always stays with the Role above — a second role never grants extra permissions.
                      </p>
                    </div>
                  )}
                  {userForm.takesSessions && (
                    <div className="space-y-2">
                      <Label>Specialization</Label>
                      <TherapyTypeSelect
                        value={userForm.therapyType}
                        onChange={(v) => setUserForm({ ...userForm, therapyType: v })}
                        options={customRoleLabels}
                        allowNone
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Active Status (Edit only) */}
            {userEditing && (
              <>
                <Separator />
                <div className="flex items-center justify-between py-1">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Account Status</Label>
                    <p className="text-xs text-muted-foreground">
                      Inactive users cannot sign in to the system
                    </p>
                  </div>
                  <Switch
                    checked={userForm.isActive}
                    disabled={isLastOrgAdmin}
                    onCheckedChange={(checked) => setUserForm({ ...userForm, isActive: checked })}
                  />
                </div>
              </>
            )}

            {/* Role info card */}
            {userForm.role && (
              <div className={`rounded-lg p-3 border ${getRoleColor(userForm.role)} border-current/20`}>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Shield className="size-4" />
                  {customRoleLabel(userForm.role) || getRoleLabel(userForm.role)}
                </div>
                <p className="text-xs mt-1 opacity-80">
                  {userForm.role === 'super_admin' && 'Full system access across all branches.'}
                  {userForm.role === 'admin' && 'Branch administrator with management capabilities.'}
                  {userForm.role === 'receptionist' && 'Handles front desk, scheduling, and patient registration.'}
                  {userForm.role === 'therapist_speech' && 'Provides speech and language therapy sessions.'}
                  {userForm.role === 'therapist_ot' && 'Provides occupational therapy sessions.'}
                  {userForm.role === 'therapist_behavioral' && 'Provides behavioral analysis and therapy.'}
                  {userForm.role === 'therapist_remedial' && 'Provides remedial education and support.'}
                  {userForm.role === 'psychologist' && 'Conducts assessments and psychological evaluations.'}
                  {userForm.role === 'parent' && 'Portal access to view their child\'s progress.'}
                  {findCustomRole(userForm.role) && (findCustomRole(userForm.role)?.description || 'Custom role with admin-defined permissions.')}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUserSubmit} disabled={userSubmitting} className="gap-2">
              {userSubmitting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              {userSubmitting ? 'Saving...' : userEditing ? 'Update User' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddRoleDialog open={addRoleDialogOpen} onOpenChange={setAddRoleDialogOpen} onCreated={handleRoleCreated} />

      {/* ============ DELETE USER CONFIRMATION ============ */}
      <AlertDialog open={deleteUserDialogOpen} onOpenChange={setDeleteUserDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{userToDelete?.name}</strong> ({userToDelete?.email})?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
