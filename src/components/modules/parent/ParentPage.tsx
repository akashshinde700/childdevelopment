'use client'

import { useState, useEffect } from 'react'
import { useAppStore } from '@/store/app-store'
import { authFetch } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Plus, Heart, Edit, Trash2, Eye, EyeOff, Link2, User, Phone, Mail, Baby, Shield, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { SearchInput } from '@/components/ui/search-input'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'

// ============ TYPES ============

interface Patient {
  id: string
  patientId: string
  childName: string
  mobile?: string
  fatherName?: string
  motherName?: string
  status?: string
}

interface ParentUser {
  id: string
  name: string
  email: string
  phone?: string
  role: string
  patientId?: string
  isActive?: boolean
  createdAt: string
  updatedAt: string
  branch?: {
    id: string
    name: string
    code: string
  }
  // Populated client-side
  patientInfo?: Patient | null
}

interface ParentFormData {
  name: string
  email: string
  password: string
  phone: string
  patientId: string
}

const emptyForm: ParentFormData = {
  name: '',
  email: '',
  password: '',
  phone: '',
  patientId: '',
}

const ITEMS_PER_PAGE = 10

// ============ COMPONENT ============

export default function ParentPage() {
  const { navigate, searchQuery, setSearchQuery } = useAppStore()

  // State
  const [parents, setParents] = useState<ParentUser[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const { query: search, debouncedQuery: debouncedSearch, setQuery: setSearch, isDebouncing, clear: clearSearch } = useDebouncedSearch(searchQuery)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  // Dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Form
  const [form, setForm] = useState<ParentFormData>(emptyForm)
  const [editingParent, setEditingParent] = useState<ParentUser | null>(null)
  const [viewingParent, setViewingParent] = useState<ParentUser | null>(null)
  const [deletingParent, setDeletingParent] = useState<ParentUser | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Clear the global search query once consumed as this page's initial search
  useEffect(() => {
    if (searchQuery) setSearchQuery('')
  }, [])

  // ============ FETCH DATA ============

  const fetchParents = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ role: 'parent' })
      if (debouncedSearch) params.set('search', debouncedSearch)
      const res = await authFetch(`/api/users?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setParents(Array.isArray(data) ? data : [])
      setTotal(Array.isArray(data) ? data.length : 0)
    } catch {
      toast.error('Failed to fetch parents')
    } finally {
      setLoading(false)
    }
  }

  const fetchPatients = async () => {
    try {
      const res = await authFetch('/api/patients?limit=1000')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setPatients(data.patients || [])
    } catch {
      // silently fail - patients are for dropdown only
    }
  }

  useEffect(() => {
    fetchParents()
  }, [debouncedSearch])

  useEffect(() => {
    fetchPatients()
  }, [])

  // ============ HELPERS ============

  // Build a patient lookup map
  const patientMap = new Map(patients.map(p => [p.id, p]))

  // Enrich parent data with patient info
  const enrichedParents = parents.map(parent => ({
    ...parent,
    patientInfo: parent.patientId ? patientMap.get(parent.patientId) || null : null,
  }))

  // Summary stats
  const totalParents = enrichedParents.length
  const activeParents = enrichedParents.filter(p => p.isActive !== false).length
  const linkedParents = enrichedParents.filter(p => p.patientId && p.patientInfo).length
  const withoutChild = enrichedParents.filter(p => !p.patientId || !p.patientInfo).length

  // Pagination
  const totalPages = Math.ceil(enrichedParents.length / ITEMS_PER_PAGE)
  const paginatedParents = enrichedParents.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  )

  const getPatientDisplay = (parent: ParentUser) => {
    if (!parent.patientId) return '-'
    const patient = parent.patientInfo || patientMap.get(parent.patientId)
    if (!patient) return `ID: ${parent.patientId.slice(0, 8)}...`
    return patient.childName
  }

  const getPatientIdDisplay = (parent: ParentUser) => {
    if (!parent.patientId) return '-'
    const patient = parent.patientInfo || patientMap.get(parent.patientId)
    if (!patient) return '-'
    return patient.patientId
  }

  // ============ FORM HANDLERS ============

  const handleAddParent = async () => {
    if (!form.name.trim()) { toast.error('Parent name is required'); return }
    if (!form.email.trim()) { toast.error('Email is required'); return }
    if (!form.password.trim()) { toast.error('Password is required'); return }
    if (form.password.trim().length < 4) { toast.error('Password must be at least 4 characters'); return }
    if (!form.patientId) { toast.error('Please select a child patient'); return }

    setSubmitting(true)
    try {
      const res = await authFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password.trim(),
          phone: form.phone.trim() || undefined,
          role: 'parent',
          patientId: form.patientId,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create parent')
      }

      toast.success('Parent created successfully')
      setAddDialogOpen(false)
      setForm(emptyForm)
      fetchParents()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create parent')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditParent = async () => {
    if (!editingParent) return
    if (!form.name.trim()) { toast.error('Parent name is required'); return }
    if (!form.email.trim()) { toast.error('Email is required'); return }

    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        id: editingParent.id,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        patientId: form.patientId || null,
      }
      if (form.password.trim()) {
        if (form.password.trim().length < 4) {
          toast.error('Password must be at least 4 characters')
          setSubmitting(false)
          return
        }
        payload.password = form.password.trim()
      }

      const res = await authFetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update parent')
      }

      toast.success('Parent updated successfully')
      setEditDialogOpen(false)
      setEditingParent(null)
      setForm(emptyForm)
      fetchParents()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update parent')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteParent = async () => {
    if (!deletingParent) return
    setSubmitting(true)
    try {
      const res = await authFetch(`/api/users?id=${deletingParent.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete parent')
      }
      toast.success('Parent deleted successfully')
      setDeleteDialogOpen(false)
      setDeletingParent(null)
      fetchParents()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete parent')
    } finally {
      setSubmitting(false)
    }
  }

  const openEditDialog = (parent: ParentUser) => {
    setEditingParent(parent)
    setForm({
      name: parent.name || '',
      email: parent.email || '',
      password: '',
      phone: parent.phone || '',
      patientId: parent.patientId || '',
    })
    setEditDialogOpen(true)
  }

  const openViewDialog = (parent: ParentUser) => {
    setViewingParent({
      ...parent,
      patientInfo: parent.patientId ? patientMap.get(parent.patientId) || null : null,
    })
    setViewDialogOpen(true)
  }

  const openDeleteDialog = (parent: ParentUser) => {
    setDeletingParent(parent)
    setDeleteDialogOpen(true)
  }

  // ============ SUMMARY CARDS DATA ============

  const summaryCards = [
    {
      title: 'Total Parents',
      value: totalParents,
      icon: <User className="h-5 w-5" />,
      color: 'from-teal-500 to-cyan-500',
      bgColor: 'bg-teal-50',
      textColor: 'text-teal-700',
    },
    {
      title: 'Active',
      value: activeParents,
      icon: <Heart className="h-5 w-5" />,
      color: 'from-emerald-500 to-green-500',
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-700',
    },
    {
      title: 'Linked to Child',
      value: linkedParents,
      icon: <Baby className="h-5 w-5" />,
      color: 'from-cyan-500 to-teal-500',
      bgColor: 'bg-cyan-50',
      textColor: 'text-cyan-700',
    },
    {
      title: 'Without Child',
      value: withoutChild,
      icon: <Link2 className="h-5 w-5" />,
      color: 'from-amber-500 to-orange-500',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-700',
    },
  ]

  // ============ RENDER ============

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Heart className="h-6 w-6" style={{ color: '#0F7A87' }} />
            Parent Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage parent accounts linked to child patients
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('user-management')}
            className="gap-2 border-teal-200 text-teal-700 hover:bg-teal-50 hover:text-teal-800"
          >
            <Shield className="h-4 w-4" />
            User Management
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setForm(emptyForm)
              setAddDialogOpen(true)
            }}
            className="gap-2 text-white"
            style={{ backgroundColor: '#0F7A87' }}
          >
            <Plus className="h-4 w-4" />
            Add Parent
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Parents — blue gradient */}
        <div className="stat-card-premium stat-grad-blue">
          <div className="flex items-start justify-between relative z-10">
            <div className="space-y-1">
              <p className="text-sm text-white/80">{summaryCards[0].title}</p>
              <p className="text-2xl font-bold text-white">{summaryCards[0].value}</p>
            </div>
            <div className="stat-icon-premium" style={{ width: 44, height: 44 }}>
              {summaryCards[0].icon}
            </div>
          </div>
        </div>
        {/* Active — green gradient */}
        <div className="stat-card-premium stat-grad-green">
          <div className="flex items-start justify-between relative z-10">
            <div className="space-y-1">
              <p className="text-sm text-white/80">{summaryCards[1].title}</p>
              <p className="text-2xl font-bold text-white">{summaryCards[1].value}</p>
            </div>
            <div className="stat-icon-premium" style={{ width: 44, height: 44 }}>
              {summaryCards[1].icon}
            </div>
          </div>
        </div>
        {/* Linked to Child — cyan gradient */}
        <div className="stat-card-premium stat-grad-cyan">
          <div className="flex items-start justify-between relative z-10">
            <div className="space-y-1">
              <p className="text-sm text-white/80">{summaryCards[2].title}</p>
              <p className="text-2xl font-bold text-white">{summaryCards[2].value}</p>
            </div>
            <div className="stat-icon-premium" style={{ width: 44, height: 44 }}>
              {summaryCards[2].icon}
            </div>
          </div>
        </div>
        {/* Without Child — orange gradient */}
        <div className="stat-card-premium stat-grad-orange">
          <div className="flex items-start justify-between relative z-10">
            <div className="space-y-1">
              <p className="text-sm text-white/80">{summaryCards[3].title}</p>
              <p className="text-2xl font-bold text-white">{summaryCards[3].value}</p>
            </div>
            <div className="stat-icon-premium" style={{ width: 44, height: 44 }}>
              {summaryCards[3].icon}
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <SearchInput
              value={search}
              onChange={(v) => { setSearch(v); setPage(1) }}
              onClear={clearSearch}
              loading={isDebouncing}
              placeholder="Search by name, email, or phone..."
              className="flex-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Parents Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" style={{ color: '#0F7A87' }} />
            Parent Accounts
            <Badge variant="secondary" className="ml-2 bg-teal-50 text-teal-700">
              {totalParents}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
                Loading parents...
              </div>
            </div>
          ) : paginatedParents.length === 0 ? (
            <div className="p-8 text-center">
              <div className="flex flex-col items-center gap-3">
                <Heart className="h-12 w-12 text-muted-foreground/30" />
                <div>
                  <p className="text-muted-foreground font-medium">No parents found</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">
                    {search ? 'Try adjusting your search terms' : 'Click "Add Parent" to create the first parent account'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-teal-50/50 hover:bg-teal-50/50">
                      <TableHead className="font-semibold text-teal-800">S.No</TableHead>
                      <TableHead className="font-semibold text-teal-800">Parent Name</TableHead>
                      <TableHead className="font-semibold text-teal-800">Email</TableHead>
                      <TableHead className="font-semibold text-teal-800">Phone</TableHead>
                      <TableHead className="font-semibold text-teal-800">Child Name</TableHead>
                      <TableHead className="font-semibold text-teal-800">Child ID</TableHead>
                      <TableHead className="font-semibold text-teal-800">Status</TableHead>
                      <TableHead className="font-semibold text-teal-800 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedParents.map((parent, idx) => (
                      <TableRow key={parent.id} className="hover:bg-teal-50/30 transition-colors">
                        <TableCell className="font-medium text-muted-foreground">
                          {(page - 1) * ITEMS_PER_PAGE + idx + 1}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                              style={{ backgroundColor: '#0F7A87' }}
                            >
                              {parent.name?.charAt(0)?.toUpperCase() || 'P'}
                            </div>
                            <span className="font-medium">{parent.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Mail className="h-3.5 w-3.5" />
                            {parent.email}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            {parent.phone || '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          {parent.patientInfo ? (
                            <div className="flex items-center gap-1.5">
                              <Baby className="h-3.5 w-3.5 text-teal-500" />
                              <span className="font-medium text-teal-700">{parent.patientInfo.childName}</span>
                            </div>
                          ) : parent.patientId ? (
                            <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                              Unlinked
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-500 border-slate-200 bg-slate-50">
                              No Child
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {parent.patientInfo ? (
                            <Badge variant="secondary" className="bg-teal-50 text-teal-700 font-mono text-xs">
                              {parent.patientInfo.patientId}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {parent.isActive !== false ? (
                            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-500 border-slate-200 bg-slate-50">
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openViewDialog(parent)}
                              className="h-8 w-8 p-0 text-teal-600 hover:text-teal-800 hover:bg-teal-50"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(parent)}
                              className="h-8 w-8 p-0 text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteDialog(parent)}
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * ITEMS_PER_PAGE + 1} to{' '}
                    {Math.min(page * ITEMS_PER_PAGE, totalParents)} of {totalParents} parents
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                      .map((p, i, arr) => {
                        const prev = arr[i - 1]
                        const showEllipsis = prev && p - prev > 1
                        return (
                          <span key={p} className="flex items-center">
                            {showEllipsis && <span className="px-1 text-muted-foreground">...</span>}
                            <Button
                              variant={page === p ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setPage(p)}
                              className={`h-8 w-8 p-0 ${page === p ? 'text-white' : ''}`}
                              style={page === p ? { backgroundColor: '#0F7A87' } : {}}
                            >
                              {p}
                            </Button>
                          </span>
                        )
                      })}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === totalPages}
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Go to User Management Link */}
      <Card
        className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all group"
        onClick={() => navigate('user-management')}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600 group-hover:bg-teal-100 transition-colors">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-foreground group-hover:text-teal-700 transition-colors">
                  Go to User Management
                </p>
                <p className="text-sm text-muted-foreground">
                  Manage all user accounts, roles, and permissions
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-teal-600 group-hover:translate-x-1 transition-all" />
          </div>
        </CardContent>
      </Card>

      {/* ============ ADD PARENT DIALOG ============ */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-teal-800">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: '#0F7A87' }}>
                <Plus className="h-4 w-4" />
              </div>
              Add New Parent
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Parent Name <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter parent's full name"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Email <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="parent@example.com"
                  value={form.email}
                  onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Password <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min 4 characters"
                  value={form.password}
                  onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter phone number"
                  value={form.phone}
                  onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Select Child */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Link to Child (Patient) <span className="text-red-500">*</span>
              </Label>
              <Select
                value={form.patientId}
                onValueChange={(val) => setForm(f => ({ ...f, patientId: val }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a child patient..." />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {patients.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                      No patients found. Add patients first.
                    </div>
                  ) : (
                    patients.map(patient => (
                      <SelectItem key={patient.id} value={patient.id}>
                        <div className="flex items-center gap-2">
                          <Baby className="h-3.5 w-3.5 text-teal-500" />
                          <span>{patient.childName}</span>
                          <span className="text-muted-foreground text-xs">({patient.patientId})</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {form.patientId && (
                <div className="text-xs text-teal-600 flex items-center gap-1">
                  <Link2 className="h-3 w-3" />
                  Linked to: {patientMap.get(form.patientId)?.childName || 'Unknown'} ({patientMap.get(form.patientId)?.patientId || ''})
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setAddDialogOpen(false); setForm(emptyForm) }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddParent}
              disabled={submitting}
              className="text-white"
              style={{ backgroundColor: '#0F7A87' }}
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1" />
                  Create Parent
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ EDIT PARENT DIALOG ============ */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-800">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-amber-100 text-amber-600">
                <Edit className="h-4 w-4" />
              </div>
              Edit Parent
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Parent Name <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter parent's full name"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Email <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="parent@example.com"
                  value={form.email}
                  onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Password <span className="text-muted-foreground text-xs font-normal">(leave blank to keep current)</span>
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter new password to change"
                  value={form.password}
                  onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter phone number"
                  value={form.phone}
                  onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Select Child */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Link to Child (Patient)</Label>
              <Select
                value={form.patientId || '__none__'}
                onValueChange={(val) => setForm(f => ({ ...f, patientId: val === '__none__' ? '' : val }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a child patient..." />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground">No child linked</span>
                  </SelectItem>
                  {patients.map(patient => (
                    <SelectItem key={patient.id} value={patient.id}>
                      <div className="flex items-center gap-2">
                        <Baby className="h-3.5 w-3.5 text-teal-500" />
                        <span>{patient.childName}</span>
                        <span className="text-muted-foreground text-xs">({patient.patientId})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setEditDialogOpen(false); setEditingParent(null); setForm(emptyForm) }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditParent}
              disabled={submitting}
              className="text-white"
              style={{ backgroundColor: '#0F7A87' }}
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                  Updating...
                </>
              ) : (
                <>
                  <Edit className="h-4 w-4 mr-1" />
                  Update Parent
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ VIEW PARENT DIALOG ============ */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-teal-800">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: '#0F7A87' }}>
                <Eye className="h-4 w-4" />
              </div>
              Parent Details
            </DialogTitle>
          </DialogHeader>

          {viewingParent && (
            <div className="space-y-4 py-2">
              {/* Avatar & Name */}
              <div className="flex items-center gap-4 p-4 bg-teal-50/50 rounded-lg">
                <div
                  className="h-14 w-14 rounded-full flex items-center justify-center text-white text-xl font-semibold shrink-0"
                  style={{ backgroundColor: '#0F7A87' }}
                >
                  {viewingParent.name?.charAt(0)?.toUpperCase() || 'P'}
                </div>
                <div>
                  <p className="text-lg font-semibold">{viewingParent.name}</p>
                  <Badge className={viewingParent.isActive !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'}>
                    {viewingParent.isActive !== false ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>

              {/* Contact Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                  <Mail className="h-4 w-4 text-teal-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium">{viewingParent.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                  <Phone className="h-4 w-4 text-teal-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="text-sm font-medium">{viewingParent.phone || 'Not provided'}</p>
                  </div>
                </div>
              </div>

              {/* Linked Child */}
              <div className="p-4 border border-teal-100 rounded-lg bg-teal-50/30">
                <p className="text-sm font-semibold text-teal-800 mb-2 flex items-center gap-1.5">
                  <Baby className="h-4 w-4" />
                  Linked Child
                </p>
                {viewingParent.patientInfo ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Child Name</span>
                      <span className="text-sm font-medium text-teal-700">{viewingParent.patientInfo.childName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Patient ID</span>
                      <Badge variant="secondary" className="bg-teal-100 text-teal-700 font-mono text-xs">
                        {viewingParent.patientInfo.patientId}
                      </Badge>
                    </div>
                    {viewingParent.patientInfo.fatherName && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Father</span>
                        <span className="text-sm">{viewingParent.patientInfo.fatherName}</span>
                      </div>
                    )}
                    {viewingParent.patientInfo.motherName && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Mother</span>
                        <span className="text-sm">{viewingParent.patientInfo.motherName}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No child patient linked to this parent account
                  </p>
                )}
              </div>

              {/* Account Info */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-3.5 w-3.5" />
                Role: Parent &middot; Created: {new Date(viewingParent.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
            {viewingParent && (
              <Button
                onClick={() => {
                  setViewDialogOpen(false)
                  openEditDialog(viewingParent)
                }}
                className="text-white"
                style={{ backgroundColor: '#0F7A87' }}
              >
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ DELETE CONFIRMATION DIALOG ============ */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-800">
              <Trash2 className="h-5 w-5 text-red-500" />
              Delete Parent Account
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingParent?.name}</strong>&apos;s parent account?
              This action cannot be undone. The user will permanently lose access to their parent portal.
              {deletingParent?.patientId && (
                <span className="block mt-2 text-amber-600">
                  This parent is currently linked to a child patient. Deleting will unlink them.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteParent}
              disabled={submitting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete Parent'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
