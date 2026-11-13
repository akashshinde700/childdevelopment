'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import {
  Plus, UserCog, Eye, Pencil, Trash2, Phone, Mail, MapPin,
  Building2, ChevronLeft, ChevronRight, Loader2, Briefcase, IndianRupee,
  Calendar, FileText, Shield, Lock, EyeOff, Eye as EyeIcon, KeyRound, Download,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SearchInput } from '@/components/ui/search-input'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { useAppStore, getRoleLabel } from '@/store/app-store'
import { authFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import { AddRoleDialog, type CreatedRole } from '@/components/modules/settings/AddRoleDialog'
import { getAssignableRoles } from '@/lib/role-permissions'
import { PAYROLL_SERVICE_TYPES } from '@/lib/therapy-types'
import { TherapyTypeSelect } from '@/components/shared/TherapyTypeSelect'

const ADD_NEW_ROLE_VALUE = '__add_new_role__'

interface RoleOption {
  value: string
  label: string
  isSystem: boolean
}

interface EmployeeDocument {
  id: string
  label: string
  value: string
  updatedAt: string
}

interface EmployeeLeave {
  id: string
  leaveType: string
  startDate: string
  endDate: string
  totalDays: number
  reason: string
  status: string
}

const LEAVE_TYPES = [
  { value: 'casual', label: 'Casual Leave (CL)' },
  { value: 'sick', label: 'Sick Leave (SL)' },
  { value: 'earned', label: 'Earned Leave' },
]
const GOVERNMENT_LEAVE_TYPE = { value: 'government', label: 'Government/Public Holiday' }

interface LeavePolicySummary {
  leaveType: string
  annualLimit: number | null
}

const PREDEFINED_DOCUMENT_TYPES = [
  'Aadhaar Card',
  'PAN Card',
  'Degree Certificate',
  'Experience Certificate',
  'Offer Letter',
  'Joining Documents',
]

interface Employee {
  id: string
  employeeId: string
  userId?: string | null // linked login account, if one exists
  name: string
  designation?: string
  department?: string
  mobile: string
  email?: string
  joinDate?: string
  basicSalary: number
  hra: number
  allowances: number
  paymentType?: string | null // null = inherit organization default
  status: string
  photo?: string
  aadhaar?: string
  pan?: string
  address?: string
  bankName?: string
  bankAccount?: string
  bankIfsc?: string
  createdAt: string
  updatedAt: string
}

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  inactive: 'bg-slate-100 text-slate-800 border-slate-200',
  resigned: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  terminated: 'bg-red-100 text-red-800 border-red-200',
  notice_period: 'bg-blue-100 text-blue-800 border-blue-200',
}

const departmentLabels: Record<string, string> = {
  Therapist: 'Therapist',
  Admin: 'Admin',
  HR: 'HR',
  Accounts: 'Accounts',
  Clinical: 'Clinical',
  Finance: 'Finance',
  Marketing: 'Marketing',
  Operations: 'Operations',
}

const predefinedDesignations = ['Therapist', 'Receptionist', 'Manager', 'Admin']

// Designation → departments that make sense for it. Picking a designation
// auto-selects the first one and the Department dropdown only shows the
// related options ('other'/custom designations see the full list).
const DESIGNATION_DEPARTMENTS: Record<string, string[]> = {
  Therapist: ['Therapist', 'Clinical'],
  Receptionist: ['Admin', 'Operations'],
  Manager: ['Operations', 'HR', 'Accounts', 'Finance', 'Marketing', 'Admin'],
  Admin: ['Admin', 'Operations'],
}
const ALL_DEPARTMENTS = ['Therapist', 'Admin', 'HR', 'Accounts', 'Clinical', 'Finance', 'Marketing', 'Operations']

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount)

const emptyForm = {
  name: '', designation: '', designationType: '', otherDesignation: '', department: 'Therapist', mobile: '', email: '',
  joinDate: '', basicSalary: '', hra: '', allowances: '',
  paymentType: '' as string, // '' = inherit organization default
  address: '', bankName: '', bankAccount: '', bankIfsc: '', pan: '', aadhaar: '', status: 'active',
  loginRole: '' as string,
  loginPassword: '',
  loginTherapyType: '' as string,
  createLogin: false,
}

// Payment Type options for the Payroll Engine — '' means "inherit the
// organization's default salary mode" (Settings → Payroll).
const PAYMENT_TYPE_OPTIONS = [
  { value: '', label: 'Organization Default' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'PER_SESSION', label: 'Per Session' },
  { value: 'HYBRID', label: 'Hybrid (Monthly + Per Session)' },
]

// Matches THERAPY_TYPES used in Packages/Sessions so a therapist's default
// therapy type lines up with the rest of the app.
const BUILT_IN_THERAPY_TYPE_OPTIONS = PAYROLL_SERVICE_TYPES.filter((t) => t !== 'Assessment')

const ROLE_DEFAULT_THERAPY: Record<string, string> = {
  therapist_speech: 'Speech Therapy',
  therapist_ot: 'Occupational Therapy',
  therapist_behavioral: 'Behavioral Therapy',
  therapist_remedial: 'Remedial Therapy',
  psychologist: 'Counseling',
}

const MAX_EMPLOYEES = 10

export default function EmployeesPage() {
  const { user, setSelectedEmployee, searchQuery, setSearchQuery, navigate } = useAppStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([])
  const [addRoleDialogOpen, setAddRoleDialogOpen] = useState(false)

  // Dynamic login role options based on current user's role — built-in
  // roles filtered per the existing tiering, plus all custom (admin-created)
  // roles fetched from /api/roles.
  const availableLoginRoles = useMemo<RoleOption[]>(() => {
    // 'admin' is deliberately excluded HERE (not in getAssignableRoles):
    // the employee form hands out staff-level logins; creating an admin is
    // a bigger decision that belongs in User Management, done consciously.
    const allowedBuiltIns = getAssignableRoles(user?.role).filter((r) => r !== 'admin')
    const builtInOptions: RoleOption[] = allowedBuiltIns.map((value) => ({ value, label: getRoleLabel(value), isSystem: true }))
    const customOptions = roleOptions.filter((r) => !r.isSystem)
    return [...builtInOptions, ...customOptions]
  }, [user, roleOptions])

  // Session Rates / Therapy Type dropdowns must offer every custom role too
  // (e.g. "Consultant Play Therapist") — not just the fixed built-in list —
  // so a newly created role gets a configurable rate with no code change.
  const customRoleLabels = useMemo(
    () => roleOptions.filter((r) => !r.isSystem).map((r) => r.label),
    [roleOptions]
  )
  const THERAPY_TYPE_OPTIONS = useMemo(
    () => Array.from(new Set([...BUILT_IN_THERAPY_TYPE_OPTIONS, ...customRoleLabels])),
    [customRoleLabels]
  )
  const ALL_SERVICE_TYPES = useMemo(
    () => Array.from(new Set([...PAYROLL_SERVICE_TYPES, ...customRoleLabels])),
    [customRoleLabels]
  )

  useEffect(() => {
    authFetch('/api/roles')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data?.roles) setRoleOptions(data.roles) })
      .catch(() => { /* non-fatal — built-in roles still work */ })
  }, [])

  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const { query: search, debouncedQuery: debouncedSearch, setQuery: setSearch, isDebouncing, clear: clearSearch } = useDebouncedSearch(searchQuery)
  const [filterDepartment, setFilterDepartment] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => {
    if (searchQuery) setSearchQuery('')
  }, [])

  // Pagination
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 20

  // Dialogs
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false)
  const [pendingStatus, setPendingStatus] = useState('')

  // Employee documents (Aadhaar/PAN/Degree/Experience/Offer Letter/etc) —
  // only meaningful once the employee record exists (has an id), so this is
  // only fetched/shown in edit mode, not while creating a new employee.
  const [employeeDocuments, setEmployeeDocuments] = useState<EmployeeDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [savingLabel, setSavingLabel] = useState<string | null>(null)
  // Local edit buffer for the predefined document text fields, keyed by
  // label — separate from `employeeDocuments` (the last-saved server state)
  // so typing doesn't need a round-trip before the input reflects it.
  const [docValues, setDocValues] = useState<Record<string, string>>({})
  const [customDocLabel, setCustomDocLabel] = useState('')
  const [customDocValue, setCustomDocValue] = useState('')

  // Payroll Engine — per-service session rates for the currently edited
  // employee (only meaningful once the employee has an id, i.e. editing an
  // existing one). `rates` is serviceType -> rate string (form input);
  // `rateTypes` is serviceType -> 'FIXED' | 'PERCENTAGE'; `orgDefaultRates`
  // is serviceType -> rate number, shown as a placeholder hint when the
  // therapist has no custom rate of their own.
  const [rates, setRates] = useState<Record<string, string>>({})
  const [rateTypes, setRateTypes] = useState<Record<string, string>>({})
  const [orgDefaultRates, setOrgDefaultRates] = useState<Record<string, number>>({})
  const [ratesLoading, setRatesLoading] = useState(false)
  const [savingRates, setSavingRates] = useState(false)

  // Leave management from within the employee profile
  const [employeeLeaves, setEmployeeLeaves] = useState<EmployeeLeave[]>([])
  const [leavesLoading, setLeavesLoading] = useState(false)
  // Super Admin-configured annual limits per leave type (see LeavesPage's
  // "Leave Policy Settings") — used here only to compute remaining balance;
  // editing happens in the Leave Management module, not here.
  const [leavePolicies, setLeavePolicies] = useState<LeavePolicySummary[]>([])
  const [applyLeaveOpen, setApplyLeaveOpen] = useState(false)
  const [leaveForm, setLeaveForm] = useState({ leaveType: 'casual', startDate: '', endDate: '', reason: '' })
  const [submittingLeave, setSubmittingLeave] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleRoleCreated = (newRole: CreatedRole) => {
    setRoleOptions((prev) => [...prev, { value: newRole.value, label: newRole.name, isSystem: false }])
    setForm((prev) => ({ ...prev, loginRole: newRole.value }))
  }

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (filterDepartment) params.set('department', filterDepartment)
      if (filterStatus) params.set('status', filterStatus)
      const res = await authFetch(`/api/employees?${params}`)
      if (!res.ok) {
        toast.error('Failed to fetch employees')
        return
      }
      const data = await res.json()
      setEmployees(data.employees || [])
      setTotal(data.total || 0)
    } catch {
      toast.error('Failed to fetch employees')
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, filterDepartment, filterStatus])

  useEffect(() => { fetchEmployees() }, [fetchEmployees])

  useEffect(() => {
    authFetch('/api/leave-policies')
      .then((res) => (res.ok ? res.json() : []))
      .then((json: LeavePolicySummary[]) => setLeavePolicies(json))
      .catch(() => {})
  }, [])

  const handleSubmit = async () => {
    // Enforce maximum employees limit
    if (!editing && employees.length >= MAX_EMPLOYEES) {
      toast.error(`Cannot add more than ${MAX_EMPLOYEES} employees`)
      return
    }
    if (!form.name.trim()) { toast.error('Employee name is required'); return }
    if (!form.mobile.trim()) { toast.error('Mobile number is required'); return }
    if (form.createLogin && !form.email.trim()) { toast.error('Email is required to create a login account'); return }
    if (form.createLogin && !form.loginRole) { toast.error('Please select a login role'); return }
    if (form.createLogin && !form.loginPassword.trim()) { toast.error('Password is required to create a login account'); return }
    if (form.createLogin && form.loginPassword.trim().length < 6) { toast.error('Password must be at least 6 characters'); return }

    setSubmitting(true)
    try {
      const designationValue = form.designationType === 'other' ? form.otherDesignation : form.designation
      const payload = {
        name: form.name,
        designation: designationValue,
        department: form.department,
        mobile: form.mobile,
        email: form.email,
        joinDate: form.joinDate || undefined,
        basicSalary: Number(form.basicSalary) || 0,
        hra: Number(form.hra) || 0,
        allowances: Number(form.allowances) || 0,
        paymentType: form.paymentType || null,
        address: form.address,
        bankName: form.bankName,
        bankAccount: form.bankAccount,
        bankIfsc: form.bankIfsc,
        pan: form.pan,
        aadhaar: form.aadhaar,
        status: form.status,
      }

      // Login (if requested) is sent INSIDE the employee request — the server
      // creates Employee + User in one transaction, so there is no
      // half-created state anymore (the old flow created the employee first
      // and then failed on the login with "Forbidden").
      const login = form.createLogin
        ? { role: form.loginRole, password: form.loginPassword, therapyType: form.loginTherapyType || undefined }
        : undefined

      if (editing && selectedEmp) {
        const res = await authFetch('/api/employees', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedEmp.id, ...payload, ...(login ? { login } : {}) }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          toast.error(err.error || 'Failed to update employee')
          return
        }
        toast.success(login ? 'Employee updated & login account created' : 'Employee updated successfully')
      } else {
        const res = await authFetch('/api/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, ...(login ? { login } : {}) }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          toast.error(err.error || 'Failed to add employee')
          return
        }
        toast.success(login ? 'Employee added & login account created' : 'Employee added successfully')
      }

      setFormDialogOpen(false)
      setEditing(false)
      setForm(emptyForm)
      fetchEmployees()
    } catch {
      toast.error(editing ? 'Failed to update employee' : 'Failed to add employee')
    } finally {
      setSubmitting(false)
    }
  }

  const fetchRates = async (employeeId: string) => {
    setRatesLoading(true)
    try {
      const res = await authFetch(`/api/payroll/rates?employeeId=${employeeId}`)
      if (res.ok) {
        const json = await res.json()
        const rateMap: Record<string, string> = {}
        const typeMap: Record<string, string> = {}
        // This simple editor only shows/edits the PLAIN rate (no package/
        // branch scoping) — scoped overrides exist but aren't surfaced here.
        for (const r of json.therapistRates || []) {
          if (r.packageId || r.branchId) continue
          rateMap[r.serviceType] = String(r.rate)
          typeMap[r.serviceType] = r.rateType || 'FIXED'
        }
        setRates(rateMap)
        setRateTypes(typeMap)
        const orgMap: Record<string, number> = {}
        for (const r of json.organizationDefaultRates || []) {
          if (r.packageId || r.branchId) continue
          orgMap[r.serviceType] = r.rate
        }
        setOrgDefaultRates(orgMap)
      }
    } catch { /* silent */ } finally {
      setRatesLoading(false)
    }
  }

  const handleSaveRates = async () => {
    if (!selectedEmp) return
    setSavingRates(true)
    try {
      const entries = Object.entries(rates).filter(([, v]) => v.trim() !== '')
      for (const [serviceType, rateStr] of entries) {
        const res = await authFetch('/api/payroll/rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: selectedEmp.id,
            serviceType,
            rate: Number(rateStr),
            rateType: rateTypes[serviceType] || 'FIXED',
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          toast.error(err.error || `Failed to save rate for ${serviceType}`)
          return
        }
      }
      toast.success('Session rates saved')
    } catch {
      toast.error('Failed to save session rates')
    } finally {
      setSavingRates(false)
    }
  }

  const fetchEmployeeDocuments = async (employeeId: string) => {
    setDocsLoading(true)
    try {
      const res = await authFetch(`/api/employees/${employeeId}/documents`)
      if (res.ok) {
        const json = await res.json()
        const documents: EmployeeDocument[] = json.documents || []
        setEmployeeDocuments(documents)
        const values: Record<string, string> = {}
        for (const d of documents) {
          if (PREDEFINED_DOCUMENT_TYPES.includes(d.label)) values[d.label] = d.value
        }
        setDocValues(values)
      }
    } catch { /* silent */ } finally {
      setDocsLoading(false)
    }
  }

  const handleDocumentSave = async (label: string, value: string, docId?: string) => {
    if (!selectedEmp) return
    if (!value.trim()) { toast.error('Enter a value first'); return }
    setSavingLabel(label)
    try {
      const res = await authFetch(`/api/employees/${selectedEmp.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, value: value.trim(), docId }),
      })
      if (res.ok) {
        toast.success(`${label} saved`)
        fetchEmployeeDocuments(selectedEmp.id)
        if (!docId) setCustomDocLabel('')
        setCustomDocValue('')
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || `Failed to save ${label}`)
      }
    } catch {
      toast.error(`Failed to save ${label}`)
    } finally {
      setSavingLabel(null)
    }
  }

  const handleDocumentDelete = async (docId: string, label?: string) => {
    if (!selectedEmp) return
    try {
      const res = await authFetch(`/api/employees/${selectedEmp.id}/documents?docId=${docId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Cleared')
        setEmployeeDocuments((prev) => prev.filter((d) => d.id !== docId))
        if (label) setDocValues((prev) => ({ ...prev, [label]: '' }))
      } else {
        toast.error('Failed to clear')
      }
    } catch {
      toast.error('Failed to clear')
    }
  }

  const openAdd = () => {
    if (employees.length >= MAX_EMPLOYEES) {
      toast.error(`Maximum of ${MAX_EMPLOYEES} employees allowed`)
      return
    }
    setForm(emptyForm)
    setEditing(false)
    setEmployeeDocuments([])
    setDocValues({})
    setCustomDocLabel('')
    setCustomDocValue('')
    setRates({})
    setRateTypes({})
    setOrgDefaultRates({})
    setFormDialogOpen(true)
  }

  const openEdit = (emp: Employee) => {
    const isKnown = emp.designation ? predefinedDesignations.includes(emp.designation) : false
    setForm({
      name: emp.name,
      designation: isKnown ? (emp.designation || '') : '',
      designationType: isKnown ? (emp.designation || '') : 'other',
      otherDesignation: isKnown ? '' : (emp.designation || ''),
      department: emp.department || 'therapy',
      mobile: emp.mobile,
      email: emp.email || '',
      joinDate: emp.joinDate ? format(new Date(emp.joinDate), 'yyyy-MM-dd') : '',
      basicSalary: String(emp.basicSalary),
      hra: String(emp.hra),
      allowances: String(emp.allowances),
      paymentType: emp.paymentType || '',
      address: emp.address || '',
      bankName: emp.bankName || '',
      bankAccount: emp.bankAccount || '',
      bankIfsc: emp.bankIfsc || '',
      pan: emp.pan || '',
      aadhaar: emp.aadhaar || '',
      status: emp.status,
      createLogin: false,
      loginRole: '',
      loginPassword: '',
      loginTherapyType: '',
    })
    setEditing(true)
    setSelectedEmp(emp)
    setFormDialogOpen(true)
    fetchEmployeeDocuments(emp.id)
    fetchRates(emp.id)
  }

  const openDetail = (emp: Employee) => {
    setSelectedEmp(emp)
    setSelectedEmployee(emp.id)
    setDetailDialogOpen(true)
    fetchEmployeeLeaves(emp.id)
  }

  const fetchEmployeeLeaves = async (employeeId: string) => {
    setLeavesLoading(true)
    try {
      const res = await authFetch(`/api/leaves?employeeId=${employeeId}&limit=100`)
      if (res.ok) {
        const json = await res.json()
        setEmployeeLeaves(json.leaves || [])
      }
    } catch { /* silent */ } finally {
      setLeavesLoading(false)
    }
  }

  const openApplyLeave = () => {
    setLeaveForm({ leaveType: 'casual', startDate: '', endDate: '', reason: '' })
    setApplyLeaveOpen(true)
  }

  const [updatingLeaveId, setUpdatingLeaveId] = useState<string | null>(null)
  const handleLeaveStatusUpdate = async (leaveId: string, status: 'approved' | 'rejected' | 'cancelled') => {
    if (updatingLeaveId) return
    setUpdatingLeaveId(leaveId)
    try {
      const res = await authFetch('/api/leaves', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: leaveId, status }),
      })
      if (res.ok) {
        toast.success(`Leave ${status}`)
        if (selectedEmp) fetchEmployeeLeaves(selectedEmp.id)
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to update leave')
      }
    } catch {
      toast.error('Failed to update leave')
    } finally {
      setUpdatingLeaveId(null)
    }
  }

  const handleApplyLeave = async () => {
    if (!selectedEmp) return
    if (!leaveForm.startDate || !leaveForm.endDate || !leaveForm.reason.trim()) {
      toast.error('Please fill all required fields')
      return
    }
    setSubmittingLeave(true)
    try {
      const res = await authFetch('/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmp.id,
          leaveType: leaveForm.leaveType,
          startDate: leaveForm.startDate,
          endDate: leaveForm.endDate,
          reason: leaveForm.reason.trim(),
        }),
      })
      if (res.ok) {
        toast.success('Leave request submitted')
        setApplyLeaveOpen(false)
        fetchEmployeeLeaves(selectedEmp.id)
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to submit leave request')
      }
    } catch {
      toast.error('Failed to submit leave request')
    } finally {
      setSubmittingLeave(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this employee?')) return
    if (deletingId) return
    setDeletingId(id)
    try {
      const res = await authFetch(`/api/employees?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to delete employee')
        return
      }
      toast.success('Employee deleted')
      fetchEmployees()
    } catch {
      toast.error('Failed to delete employee')
    } finally {
      setDeletingId(null)
    }
  }

  const totalPages = Math.ceil(total / limit)

  const totalSalary = (emp: Employee) => emp.basicSalary + emp.hra + emp.allowances

  // ── Export to Excel — re-fetches with the currently active filters
  // (search/department/status) but a large limit so ALL matching employees
  // are exported, not just the current page. ──
  const [exportingEmployees, setExportingEmployees] = useState(false)
  const handleExportEmployees = async () => {
    if (exportingEmployees) return
    setExportingEmployees(true)
    try {
      const params = new URLSearchParams({ page: '1', limit: '100000' })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (filterDepartment) params.set('department', filterDepartment)
      if (filterStatus) params.set('status', filterStatus)
      const res = await authFetch(`/api/employees?${params}`)
      if (!res.ok) {
        toast.error('Failed to export employees')
        return
      }
      const data = await res.json()
      const all: Employee[] = data.employees || []

      const headers = [
        'Employee ID', 'Name', 'Designation', 'Department', 'Mobile', 'Email', 'Join Date',
        'Basic Salary', 'HRA', 'Allowances', 'Total Salary', 'Status', 'Bank Name',
        'Bank Account', 'IFSC Code', 'PAN', 'Aadhaar', 'Address',
      ]
      const rows = all.map((emp) => [
        emp.employeeId,
        emp.name,
        emp.designation || '',
        departmentLabels[emp.department || ''] || emp.department || '',
        emp.mobile,
        emp.email || '',
        emp.joinDate ? format(new Date(emp.joinDate), 'dd MMM yyyy') : '',
        emp.basicSalary,
        emp.hra,
        emp.allowances,
        totalSalary(emp),
        emp.status.replace('_', ' '),
        emp.bankName || '',
        emp.bankAccount || '',
        emp.bankIfsc || '',
        emp.pan || '',
        emp.aadhaar || '',
        emp.address || '',
      ])

      const XLSX = await import('xlsx')
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 12) }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Employees')
      XLSX.writeFile(wb, 'Employees.xlsx')
    } catch (err) {
      console.error('Failed to export employees:', err)
      toast.error('Something went wrong while exporting')
    } finally {
      setExportingEmployees(false)
    }
  }

  const handleFormStatusChange = (newStatus: string) => {
    if (!editing || !selectedEmp) {
      setForm({ ...form, status: newStatus })
      return
    }

    if ((form.status === 'active' && newStatus === 'inactive') || (form.status === 'inactive' && newStatus === 'active')) {
      setPendingStatus(newStatus)
      setStatusConfirmOpen(true)
      return
    }

    setForm({ ...form, status: newStatus })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
          <p className="text-muted-foreground text-sm">Manage employee records, salary details, and documents</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportEmployees} disabled={exportingEmployees} className="gap-2">
            <Download className="size-4" /> Export to Excel
          </Button>
          <Button onClick={openAdd} className="gap-2">
            <Plus className="size-4" /> Add Employee
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <SearchInput
              value={search}
              onChange={(v) => { setSearch(v); setPage(1) }}
              onClear={clearSearch}
              loading={isDebouncing}
              placeholder="Search by name, ID, or mobile..."
              className="flex-1"
            />
            <Select value={filterDepartment} onValueChange={(v) => { setFilterDepartment(v === 'all' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-36 [&_svg]:hidden">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Therapist">Therapist</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
                <SelectItem value="HR">HR</SelectItem>
                <SelectItem value="Accounts">Accounts</SelectItem>
                <SelectItem value="Clinical">Clinical</SelectItem>
                <SelectItem value="Finance">Finance</SelectItem>
                <SelectItem value="Marketing">Marketing</SelectItem>
                <SelectItem value="Operations">Operations</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v === 'all' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-36 [&_svg]:hidden">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="resigned">Resigned</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
                <SelectItem value="notice_period">Notice Period</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Employee Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Designation</TableHead>
                  <TableHead className="hidden md:table-cell">Department</TableHead>
                  <TableHead className="hidden lg:table-cell">Mobile</TableHead>
                  <TableHead className="hidden xl:table-cell">Email</TableHead>
                  <TableHead className="hidden lg:table-cell">Join Date</TableHead>
                  <TableHead className="hidden sm:table-cell">Salary</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={10}><Skeleton className="h-10 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : employees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                      <UserCog className="size-10 mx-auto mb-2 opacity-40" />
                      <p>No employees found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  employees.map((emp) => (
                    <TableRow key={emp.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(emp)}>
                      <TableCell className="font-medium">{emp.employeeId}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                            {emp.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium">{emp.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{emp.designation || '-'}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="secondary">{departmentLabels[emp.department || ''] || emp.department || '-'}</Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{emp.mobile}</TableCell>
                      <TableCell className="hidden xl:table-cell text-muted-foreground text-sm truncate max-w-[180px]">{emp.email || '-'}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {emp.joinDate ? format(new Date(emp.joinDate), 'dd MMM yyyy') : '-'}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell font-medium">{formatCurrency(totalSalary(emp))}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[emp.status] || ''}>
                          {emp.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openDetail(emp)} title="View">
                            <Eye className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(emp)} title="Edit" aria-label="Edit employee">
                            <Pencil className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => handleDelete(emp.id)} disabled={deletingId === emp.id} title="Delete" aria-label="Delete employee">
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add/Edit Employee Dialog */}
      <Dialog open={formDialogOpen} onOpenChange={(open) => { setFormDialogOpen(open); if (!open) setEditing(false) }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
            <DialogDescription>{editing ? 'Update employee information' : 'Enter new employee details'}</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Personal Info */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Personal Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name *</Label>
                  <Input placeholder="Employee name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Designation</Label>
                  <Select value={form.designationType} onValueChange={(v) => {
                    if (v === 'other') {
                      setForm({ ...form, designationType: 'other', designation: '', otherDesignation: '' })
                    } else {
                      // Auto-select the department that matches the designation
                      const dept = DESIGNATION_DEPARTMENTS[v]?.[0] || form.department
                      setForm({ ...form, designationType: v, designation: v, otherDesignation: '', department: dept })
                    }
                  }}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select designation" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Therapist">Therapist</SelectItem>
                      <SelectItem value="Receptionist">Receptionist</SelectItem>
                      <SelectItem value="Manager">Manager</SelectItem>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.designationType === 'other' && (
                    <Input
                      placeholder="Enter custom designation"
                      value={form.otherDesignation}
                      onChange={(e) => setForm({ ...form, otherDesignation: e.target.value, designation: e.target.value })}
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Select value={form.department} onValueChange={v => setForm({ ...form, department: v })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(() => {
                        const opts = [...(DESIGNATION_DEPARTMENTS[form.designationType] || ALL_DEPARTMENTS)]
                        // An older record may have a department outside the
                        // designation's related list — keep it selectable so
                        // editing never silently changes saved data.
                        if (form.department && !opts.includes(form.department)) opts.unshift(form.department)
                        return opts.map((d) => (
                          <SelectItem key={d} value={d}>{departmentLabels[d] || d}</SelectItem>
                        ))
                      })()}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Mobile *</Label>
                  <Input placeholder="Mobile number" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" placeholder="Email address" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Join Date</Label>
                  <Input type="date" value={form.joinDate} onChange={(e) => setForm({ ...form, joinDate: e.target.value })} />
                </div>
                {editing && (
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={handleFormStatusChange}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="resigned">Resigned</SelectItem>
                        <SelectItem value="terminated">Terminated</SelectItem>
                        <SelectItem value="notice_period">Notice Period</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Textarea placeholder="Full address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} />
              </div>
            </div>

            <Separator />

            {/* Salary Structure */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Salary Structure</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Basic Salary (₹)</Label>
                  <Input type="number" min={0} placeholder="0" value={form.basicSalary} onChange={(e) => setForm({ ...form, basicSalary: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>HRA (₹)</Label>
                  <Input type="number" min={0} placeholder="0" value={form.hra} onChange={(e) => setForm({ ...form, hra: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Allowances (₹)</Label>
                  <Input type="number" min={0} placeholder="0" value={form.allowances} onChange={(e) => setForm({ ...form, allowances: e.target.value })} />
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 flex justify-between text-sm">
                <span className="text-muted-foreground">Total Monthly Salary</span>
                <span className="font-bold text-lg">
                  {formatCurrency((Number(form.basicSalary) || 0) + (Number(form.hra) || 0) + (Number(form.allowances) || 0))}
                </span>
              </div>
            </div>

            <Separator />

            {/* Payment Information (Payroll Engine) */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Payment Information</h3>
              <div className="space-y-2">
                <Label>Payment Type</Label>
                <Select value={form.paymentType} onValueChange={(v) => setForm({ ...form, paymentType: v === '__org_default__' ? '' : v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value || '__org_default__'} value={opt.value || '__org_default__'}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Organization Default follows Settings → Payroll&apos;s salary mode for this clinic.
                </p>
              </div>

              {(form.paymentType === 'PER_SESSION' || form.paymentType === 'HYBRID') && (
                editing ? (
                  <div className="space-y-2">
                    <Label>Session Rates</Label>
                    <div className="rounded-lg border divide-y">
                      {ratesLoading ? (
                        <div className="p-3"><Skeleton className="h-5 w-full" /></div>
                      ) : (
                        ALL_SERVICE_TYPES.map((serviceType) => {
                          const rateType = rateTypes[serviceType] || 'FIXED'
                          return (
                            <div key={serviceType} className="flex items-center justify-between gap-2 p-2.5">
                              <span className="text-sm">{serviceType}</span>
                              <div className="flex items-center gap-2">
                                <Select value={rateType} onValueChange={(v) => setRateTypes({ ...rateTypes, [serviceType]: v })}>
                                  <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="FIXED">Fixed ₹</SelectItem>
                                    <SelectItem value="PERCENTAGE">%</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Input
                                  type="number"
                                  min={0}
                                  max={rateType === 'PERCENTAGE' ? 100 : undefined}
                                  className="w-28"
                                  placeholder={
                                    orgDefaultRates[serviceType] != null
                                      ? `${orgDefaultRates[serviceType]}${rateType === 'PERCENTAGE' ? '%' : ' (org)'}`
                                      : '0'
                                  }
                                  value={rates[serviceType] || ''}
                                  onChange={(e) => setRates({ ...rates, [serviceType]: e.target.value })}
                                />
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={handleSaveRates} disabled={savingRates}>
                      {savingRates && <Loader2 className="mr-2 size-3.5 animate-spin" />}
                      Save Session Rates
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Leave a rate blank to use the organization default for that service.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground rounded-lg border border-dashed p-3">
                    Save this employee first, then set per-service session rates from the Edit dialog.
                  </p>
                )
              )}
            </div>

            <Separator />

            {/* Login Credentials */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="size-4 text-[#0F7A87]" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Login Credentials</h3>
                </div>
                {editing && selectedEmp?.userId ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
                    <Shield className="size-3" /> Login account linked
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Create login account</span>
                    <Switch
                      checked={form.createLogin}
                      onCheckedChange={(checked) => setForm({ ...form, createLogin: checked, loginRole: checked ? (form.loginRole || 'receptionist') : '', loginPassword: checked ? form.loginPassword : '' })}
                    />
                  </div>
                )}
              </div>

              {form.createLogin && !(editing && selectedEmp?.userId) && (
                <div className="rounded-xl border border-[#0F7A87]/20 bg-[#0F7A87]/[0.03] p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Login Role *</Label>
                      <Select
                        value={form.loginRole}
                        onValueChange={(v) => {
                          if (v === ADD_NEW_ROLE_VALUE) {
                            setAddRoleDialogOpen(true)
                            return
                          }
                          // Therapist roles auto-fill their therapy type
                          // (editable below) so sessions pre-fill correctly.
                          // Custom roles default to their own name — there's
                          // no fixed mapping for those, but the role name IS
                          // the service type an admin would set a rate for.
                          const customRole = roleOptions.find((r) => r.value === v && !r.isSystem)
                          setForm({ ...form, loginRole: v, loginTherapyType: ROLE_DEFAULT_THERAPY[v] || customRole?.label || '' })
                        }}
                      >
                        <SelectTrigger className="w-full h-10">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableLoginRoles.map(({ value, label }) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                          <Separator className="my-1" />
                          <SelectItem value={ADD_NEW_ROLE_VALUE} className="text-primary font-medium">
                            <div className="flex items-center gap-2">
                              <Plus className="size-3.5" />
                              Add New Role
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Password *</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Set login password"
                          value={form.loginPassword}
                          onChange={(e) => setForm({ ...form, loginPassword: e.target.value })}
                          className="h-10 pl-9 pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 size-7"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                  {(form.loginRole.startsWith('therapist') || form.loginRole === 'psychologist' || roleOptions.some((r) => r.value === form.loginRole && !r.isSystem)) && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Therapy Type *</Label>
                      <TherapyTypeSelect
                        value={form.loginTherapyType}
                        onChange={(v) => setForm({ ...form, loginTherapyType: v })}
                        options={THERAPY_TYPE_OPTIONS}
                      />
                      <p className="text-xs text-muted-foreground">Their sessions & appointments will default to this therapy type.</p>
                    </div>
                  )}
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-3">
                    <Shield className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                      A login account will be created with email <span className="font-semibold">{form.email || '(enter email above)'}</span> so this employee can sign in. Share the password securely.
                    </p>
                  </div>
                </div>
              )}

              {!form.createLogin && (
                <div className="flex items-start gap-2 rounded-lg bg-muted/50 border border-dashed p-3">
                  <KeyRound className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Enable the toggle above to create a login account for this employee. You can also create one later from <span className="font-semibold">User Management</span>.
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Bank & Documents */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Bank & Documents</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Bank Name</Label>
                  <Input placeholder="Bank name" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Account Number</Label>
                  <Input placeholder="Bank account number" value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>IFSC Code</Label>
                  <Input placeholder="IFSC code" value={form.bankIfsc} onChange={(e) => setForm({ ...form, bankIfsc: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>PAN Number</Label>
                  <Input placeholder="PAN number" value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Aadhaar Number</Label>
                  <Input placeholder="Aadhaar number" value={form.aadhaar} onChange={(e) => setForm({ ...form, aadhaar: e.target.value })} />
                </div>
              </div>
            </div>

            <Separator />

            {/* Documents (typed-in text, no file upload) */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Documents</h3>
              {!editing || !selectedEmp ? (
                <div className="flex items-start gap-2 rounded-lg bg-muted/50 border border-dashed p-3">
                  <FileText className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Save this employee first, then reopen Edit to fill in documents.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {PREDEFINED_DOCUMENT_TYPES.map((label) => {
                    const saved = employeeDocuments.find((d) => d.label === label)
                    const currentValue = docValues[label] ?? ''
                    const dirty = currentValue.trim() !== (saved?.value || '')
                    return (
                      <div key={label} className="rounded-lg border p-2.5 space-y-1.5">
                        <p className="text-sm font-medium">{label}</p>
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder={`Enter ${label.toLowerCase()} details`}
                            value={currentValue}
                            onChange={(e) => setDocValues({ ...docValues, [label]: e.target.value })}
                            className="h-8 text-xs"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 shrink-0"
                            disabled={!dirty || savingLabel === label}
                            onClick={() => handleDocumentSave(label, currentValue, saved?.id)}
                          >
                            {savingLabel === label ? <Loader2 className="size-3.5 animate-spin" /> : 'Save'}
                          </Button>
                          {saved && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 shrink-0 text-destructive hover:text-destructive"
                              onClick={() => handleDocumentDelete(saved.id, label)}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {/* Any Other Documents — custom label, multiple allowed */}
                  <div className="rounded-lg border p-2.5 space-y-2">
                    <p className="text-sm font-medium">Any Other Documents</p>
                    {employeeDocuments.filter((d) => !PREDEFINED_DOCUMENT_TYPES.includes(d.label)).map((d) => (
                      <div key={d.id} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground shrink-0">{d.label}:</span>
                        <span className="text-xs truncate flex-1">{d.value}</span>
                        <button type="button" className="text-xs text-destructive hover:underline shrink-0" onClick={() => handleDocumentDelete(d.id)}>
                          Remove
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Document name (e.g. Medical Certificate)"
                        value={customDocLabel}
                        onChange={(e) => setCustomDocLabel(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <Input
                        placeholder="Details"
                        value={customDocValue}
                        onChange={(e) => setCustomDocValue(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0"
                        disabled={!customDocLabel.trim() || !customDocValue.trim() || savingLabel === customDocLabel}
                        onClick={() => handleDocumentSave(customDocLabel.trim(), customDocValue)}
                      >
                        {savingLabel === customDocLabel ? <Loader2 className="size-3.5 animate-spin" /> : 'Add'}
                      </Button>
                    </div>
                  </div>
                  {docsLoading && <p className="text-xs text-muted-foreground">Loading documents…</p>}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <UserCog className="size-4" />}
              {submitting ? 'Saving...' : editing ? 'Update Employee' : 'Add Employee'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddRoleDialog open={addRoleDialogOpen} onOpenChange={setAddRoleDialogOpen} onCreated={handleRoleCreated} />

      <Dialog open={statusConfirmOpen} onOpenChange={(open) => { if (!open) { setStatusConfirmOpen(false); setPendingStatus('') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Status Change</DialogTitle>
            <DialogDescription>
              {pendingStatus === 'inactive'
                ? 'Do you want to inactive this employee?'
                : 'Do you want to activate this employee?'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusConfirmOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              setForm({ ...form, status: pendingStatus })
              setStatusConfirmOpen(false)
              setPendingStatus('')
            }}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Employee Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Employee Details</DialogTitle>
            <DialogDescription>{selectedEmp?.employeeId} — {selectedEmp?.name}</DialogDescription>
          </DialogHeader>

          {selectedEmp && (
            <Tabs defaultValue="personal" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="personal">Personal</TabsTrigger>
                <TabsTrigger value="salary">Salary</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
                <TabsTrigger value="summary">Leaves</TabsTrigger>
              </TabsList>

              <TabsContent value="personal" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary text-lg font-bold">
                      {selectedEmp.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-lg">{selectedEmp.name}</p>
                      <Badge variant="outline" className={statusColors[selectedEmp.status]}>{selectedEmp.status.replace('_', ' ')}</Badge>
                    </div>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Briefcase className="size-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Designation:</span>
                      <span className="font-medium">{selectedEmp.designation || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="size-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Department:</span>
                      <span className="font-medium">{departmentLabels[selectedEmp.department || ''] || selectedEmp.department || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="size-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Mobile:</span>
                      <span className="font-medium">{selectedEmp.mobile}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="size-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Email:</span>
                      <span className="font-medium">{selectedEmp.email || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="size-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Join Date:</span>
                      <span className="font-medium">{selectedEmp.joinDate ? format(new Date(selectedEmp.joinDate), 'dd MMM yyyy') : '-'}</span>
                    </div>
                    {selectedEmp.address && (
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="size-4 text-muted-foreground mt-0.5" />
                        <span className="text-muted-foreground">Address:</span>
                        <span className="font-medium">{selectedEmp.address}</span>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="salary" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Monthly Salary Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Basic Salary</span>
                      <span className="font-medium">{formatCurrency(selectedEmp.basicSalary)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">HRA</span>
                      <span className="font-medium">{formatCurrency(selectedEmp.hra)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Allowances</span>
                      <span className="font-medium">{formatCurrency(selectedEmp.allowances)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-bold">
                      <span>Total Monthly Salary</span>
                      <span className="text-lg">{formatCurrency(totalSalary(selectedEmp))}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Annual Salary</span>
                      <span className="font-medium">{formatCurrency(totalSalary(selectedEmp) * 12)}</span>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="documents" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Bank Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Bank Name</span>
                      <span className="font-medium">{selectedEmp.bankName || 'Not provided'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Account Number</span>
                      <span className="font-medium">{selectedEmp.bankAccount ? `XXXX${selectedEmp.bankAccount.slice(-4)}` : 'Not provided'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">IFSC Code</span>
                      <span className="font-medium">{selectedEmp.bankIfsc || 'Not provided'}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Identity Documents</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">PAN Number</span>
                      <span className="font-medium">{selectedEmp.pan || 'Not provided'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Aadhaar Number</span>
                      <span className="font-medium">{selectedEmp.aadhaar ? `XXXX${selectedEmp.aadhaar.slice(-4)}` : 'Not provided'}</span>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="summary" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">Leave Balance Summary</CardTitle>
                    <Button size="sm" onClick={openApplyLeave} className="gap-1.5">
                      <Plus className="size-3.5" /> Apply Leave
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {LEAVE_TYPES.filter((lt) => lt.value === 'casual' || lt.value === 'sick').map((lt) => {
                        const used = employeeLeaves
                          .filter((l) => l.leaveType === lt.value && l.status === 'approved')
                          .reduce((sum, l) => sum + l.totalDays, 0)
                        const annualLimit = leavePolicies.find((p) => p.leaveType === lt.value)?.annualLimit ?? null
                        const remaining = annualLimit === null ? null : Math.max(0, annualLimit - used)
                        const colorMap: Record<string, string> = { casual: 'text-emerald-600', sick: 'text-orange-600' }
                        return (
                          <div key={lt.value} className="text-center p-3 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground">{lt.label}</p>
                            <p className={`text-xl font-bold ${colorMap[lt.value]}`}>{remaining === null ? used : remaining}</p>
                            <p className="text-[11px] text-muted-foreground">{annualLimit === null ? `${used} used` : `${used} used of ${annualLimit} total`}</p>
                          </div>
                        )
                      })}
                      {(() => {
                        const govUsed = employeeLeaves.filter((l) => l.leaveType === 'government' && l.status === 'approved').length
                        return (
                          <div className="text-center p-3 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground">{GOVERNMENT_LEAVE_TYPE.label}</p>
                            <p className="text-xl font-bold text-teal-600">{govUsed}</p>
                            <p className="text-[11px] text-muted-foreground">taken this year</p>
                          </div>
                        )
                      })()}
                    </div>

                    <Separator className="my-4" />

                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Leave Requests</p>
                    {leavesLoading ? (
                      <p className="text-xs text-muted-foreground">Loading…</p>
                    ) : employeeLeaves.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No leave requests yet</p>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {employeeLeaves.map((l) => {
                          const statusColor = l.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : l.status === 'rejected' ? 'bg-red-100 text-red-700' : l.status === 'cancelled' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'
                          const isPending = l.status === 'pending'
                          const isApproved = l.status === 'approved'
                          const busy = updatingLeaveId === l.id
                          return (
                            <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                              <div className="min-w-0">
                                <p className="text-sm font-medium capitalize">{l.leaveType.replace('government', 'Government/Public Holiday')} Leave · {l.totalDays} day{l.totalDays === 1 ? '' : 's'}</p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(l.startDate), 'dd MMM yyyy')} – {format(new Date(l.endDate), 'dd MMM yyyy')}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">{l.reason}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isAdmin && isPending && (
                                  <>
                                    <Button size="sm" variant="outline" className="h-7 px-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50" disabled={busy} onClick={() => handleLeaveStatusUpdate(l.id, 'approved')}>
                                      Approve
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 px-2 text-red-700 border-red-200 hover:bg-red-50" disabled={busy} onClick={() => handleLeaveStatusUpdate(l.id, 'rejected')}>
                                      Reject
                                    </Button>
                                  </>
                                )}
                                {isAdmin && isApproved && (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-gray-600" disabled={busy} onClick={() => handleLeaveStatusUpdate(l.id, 'cancelled')}>
                                    Cancel
                                  </Button>
                                )}
                                <Badge className={statusColor}>{l.status}</Badge>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => openEdit(selectedEmp!)} className="gap-2">
              <Pencil className="size-4" /> Edit
            </Button>
            <Button onClick={() => setDetailDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Leave Dialog */}
      <Dialog open={applyLeaveOpen} onOpenChange={setApplyLeaveOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Apply Leave</DialogTitle>
            <DialogDescription>{selectedEmp?.name} — submit a new leave request</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Leave Type *</Label>
              <Select value={leaveForm.leaveType} onValueChange={(v) => setLeaveForm((prev) => ({ ...prev, leaveType: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map((lt) => <SelectItem key={lt.value} value={lt.value}>{lt.label}</SelectItem>)}
                  <SelectItem value={GOVERNMENT_LEAVE_TYPE.value}>{GOVERNMENT_LEAVE_TYPE.label}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>From Date *</Label>
                <Input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm((prev) => ({ ...prev, startDate: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>To Date *</Label>
                <Input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm((prev) => ({ ...prev, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason *</Label>
              <Textarea placeholder="Reason for leave" value={leaveForm.reason} onChange={(e) => setLeaveForm((prev) => ({ ...prev, reason: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyLeaveOpen(false)} disabled={submittingLeave}>Cancel</Button>
            <Button onClick={handleApplyLeave} disabled={submittingLeave} className="gap-2">
              {submittingLeave ? <Loader2 className="size-4 animate-spin" /> : null}
              {submittingLeave ? 'Submitting…' : 'Submit Leave Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Management Connection */}
      <Card className="mt-6 border-dashed border-teal-300 bg-teal-50/50 hover:bg-teal-50 transition-colors cursor-pointer" onClick={() => navigate('user-management')}>
        <CardContent className="py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal-100">
              <Shield className="h-5 w-5 text-teal-700" />
            </div>
            <div>
              <p className="font-semibold text-teal-900">Go to User Management →</p>
              <p className="text-sm text-teal-700">Manage login credentials, roles & access for employees and parents</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-teal-500" />
        </CardContent>
      </Card>
    </div>
  )
}
