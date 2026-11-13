'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { format, differenceInYears, differenceInMonths, differenceInDays } from 'date-fns'
import {
  Plus,
  Eye,
  Pencil,
  Trash2,
  Users,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchInput } from '@/components/ui/search-input'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAppStore, canViewPatientContact } from '@/store/app-store'
import { authFetch } from '@/lib/api-client'
import { useToast } from '@/hooks/use-toast'
import { ImportDialog } from '@/components/ui/import-dialog'

// Types
interface Patient {
  id: string
  patientId: string
  childName: string
  gender: string
  dateOfBirth: string
  fatherName: string | null
  motherName: string | null
  parentName: string | null
  mobile: string
  alternateNumber: string | null
  email: string | null
  city: string | null
  schoolName: string | null
  class: string | null
  referredBy: string | null
  diagnosis: string | null
  diagnosisReport: string | null
  medicalHistory: string | null
  birthHistory: string | null
  photo: string | null
  isActive: boolean
  status: string
  createdAt: string
  invoiceSummary?: {
    count: number
    totalAmount: number
    amountPaid: number
    balanceDue: number
  }
}

function formatCurrencyShort(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}

function calculateAge(dateOfBirth: string): string {
  const dob = new Date(dateOfBirth)
  const now = new Date()
  const years = differenceInYears(now, dob)
  const months = differenceInMonths(now, dob)
  const days = differenceInDays(now, dob)

  if (years > 0) return `${years}y ${months % 12}m`
  if (months > 0) return `${months}m ${days % 30}d`
  return `${days}d`
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return (
        <Badge variant="default" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
          Active
        </Badge>
      )
    case 'inactive':
      return <Badge variant="secondary">Inactive</Badge>
    case 'discharged':
      return <Badge variant="outline">Discharged</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export default function PatientList() {
  const { navigate, setSelectedPatient, searchQuery: globalSearchQuery, setSearchQuery: setGlobalSearchQuery, user } = useAppStore()
  const canManagePatients = user?.role === 'super_admin' || user?.role === 'admin'
  const canSeeMobile = canViewPatientContact(user?.role)
  const { toast } = useToast()

  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  // Reusable debounced search — initial value seeded from the global search bar
  // so cross-module navigation can pre-populate the field on mount.
  const { query, debouncedQuery, setQuery, isDebouncing, clear } = useDebouncedSearch(globalSearchQuery)
  const [statusFilter, setStatusFilter] = useState('all')

  // If the global search query is set after mount (e.g. user navigates back),
  // push it into the local debounced search field and clear the global store.
  useEffect(() => {
    if (globalSearchQuery) {
      setQuery(globalSearchQuery)
      setGlobalSearchQuery('')
    }
  }, [globalSearchQuery, setGlobalSearchQuery, setQuery])

  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  // Active/Inactive KPI counts — deliberately fetched separately from the
  // full (status-filtered, search-filtered) dataset rather than derived from
  // `patients`, since `patients` only ever holds the current page (10 rows).
  // Counting off that page made these two cards show numbers that summed to
  // the page size (e.g. 2 + 8 = 10) instead of the real totals across all
  // patients.
  const [activeCount, setActiveCount] = useState(0)
  const [inactiveCount, setInactiveCount] = useState(0)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null)
  const [deletionReason, setDeletionReason] = useState('')
  const [deleting, setDeleting] = useState(false)
  const limit = 10

  // Import dialog state — the heavy lifting (parsing, mapping, validation,
  // batch import) lives inside the reusable <ImportDialog /> component.
  const isSuperAdmin = user?.role === 'super_admin'
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const fetchPatients = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        search: debouncedQuery,
        status: statusFilter === 'all' ? '' : statusFilter,
        page: page.toString(),
        limit: limit.toString(),
      })
      const res = await authFetch(`/api/patients?${params}`)
      if (res.ok) {
        const json = await res.json()
        setPatients(json.patients || [])
        setTotal(json.total || 0)
      }
    } catch (err) {
      // Network errors ("Failed to fetch") are already retried once inside
      // authFetch. If we still reach here the dev server was down for >800ms
      // — a normal, transient dev-mode occurrence. Log as a warning (not an
      // error) to keep the console clean. Real errors are still surfaced.
      const isNetwork = err instanceof TypeError && err.message.toLowerCase().includes('failed to fetch')
      if (isNetwork) {
        console.warn('Patient list: network unavailable (dev server may be restarting).')
      } else {
        console.error('Failed to fetch patients:', err)
      }
    } finally {
      setLoading(false)
    }
  }, [debouncedQuery, statusFilter, page])

  useEffect(() => {
    fetchPatients()
  }, [fetchPatients])

  // Fetch the Active/Inactive KPI counts across the FULL (search-filtered)
  // dataset — independent of the current page and independent of the table's
  // own status filter, since both cards need to show simultaneously
  // regardless of which one (if any) is currently selected. `limit=1` keeps
  // each request cheap; only `total` from the response is used.
  const fetchStatusCounts = useCallback(async () => {
    try {
      const [activeRes, inactiveRes] = await Promise.all([
        authFetch(`/api/patients?${new URLSearchParams({ search: debouncedQuery, status: 'active', limit: '1' })}`),
        authFetch(`/api/patients?${new URLSearchParams({ search: debouncedQuery, status: 'inactive', limit: '1' })}`),
      ])
      const [activeJson, inactiveJson] = await Promise.all([
        activeRes.ok ? activeRes.json() : { total: 0 },
        inactiveRes.ok ? inactiveRes.json() : { total: 0 },
      ])
      setActiveCount(activeJson.total || 0)
      setInactiveCount(inactiveJson.total || 0)
    } catch {
      // Silent — these are supplementary KPI cards, not critical data.
    }
  }, [debouncedQuery])

  useEffect(() => {
    fetchStatusCounts()
  }, [fetchStatusCounts])

  const totalPages = Math.ceil(total / limit)

  // Reset page when the debounced search or filter actually changes
  useEffect(() => {
    setPage(1)
  }, [debouncedQuery, statusFilter])

  const handleViewProfile = (patient: Patient) => {
    setSelectedPatient(patient.id)
    navigate('patient-profile')
  }

  const handleEdit = (patient: Patient) => {
    setSelectedPatient(patient.id)
    navigate('patient-form')
  }

  const handleDeleteClick = (patient: Patient) => {
    setDeleteTarget(patient)
    setDeletionReason('')
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    if (!deletionReason.trim()) return
    setDeleting(true)
    try {
      const res = await authFetch(`/api/patients?id=${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: deletionReason.trim() }),
      })
      if (res.ok) {
        toast({
          title: 'Patient deleted',
          description: `${deleteTarget.childName} and all related appointments, sessions, packages and assessments have been removed.`,
        })
        setPatients((prev) => prev.filter((p) => p.id !== deleteTarget.id))
        setTotal((prev) => Math.max(0, prev - 1))
        fetchStatusCounts()
      } else {
        const data = await res.json().catch(() => null)
        toast({
          title: 'Error',
          description: data?.error || 'Failed to delete patient. Please try again.',
          variant: 'destructive',
        })
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
      setDeleteTarget(null)
      setDeletionReason('')
    }
  }

  const handleExportExcel = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const params = new URLSearchParams({
        search: debouncedQuery,
        status: statusFilter === 'all' ? '' : statusFilter,
        page: '1',
        limit: '100000',
      })
      const res = await authFetch(`/api/patients?${params}`)
      if (!res.ok) {
        toast({ title: 'Error', description: 'Failed to export patients. Please try again.', variant: 'destructive' })
        return
      }
      const json = await res.json()
      const all: Patient[] = json.patients || []

      const headers = [
        'Patient ID', 'Child Name', 'Gender', 'Age', 'Date of Birth', 'Parent',
        ...(canSeeMobile ? ['Mobile'] : []),
        'Invoice Count', 'Total Amount', 'Amount Paid', 'Balance Due', 'Status',
      ]
      const rows = all.map((patient) => [
        patient.patientId,
        patient.childName,
        patient.gender,
        calculateAge(patient.dateOfBirth),
        format(new Date(patient.dateOfBirth), 'dd MMM yyyy'),
        patient.parentName || patient.fatherName || patient.motherName || '-',
        ...(canSeeMobile ? [patient.mobile || 'N/A'] : []),
        patient.invoiceSummary?.count ?? 0,
        patient.invoiceSummary?.totalAmount ?? 0,
        patient.invoiceSummary?.amountPaid ?? 0,
        patient.invoiceSummary?.balanceDue ?? 0,
        patient.status.charAt(0).toUpperCase() + patient.status.slice(1),
      ])

      const XLSX = await import('xlsx')
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 12) }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Patients')
      XLSX.writeFile(wb, 'Patients.xlsx')
    } catch (err) {
      console.error('Failed to export patients:', err)
      toast({ title: 'Error', description: 'Something went wrong while exporting. Please try again.', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-sm">
            <Users className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Patient Management</h1>
            <p className="text-sm text-muted-foreground">
              {total} patient{total !== 1 ? 's' : ''} registered
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPatients}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={exporting}
          >
            <Download className={`h-4 w-4 mr-1.5 ${exporting ? 'animate-spin' : ''}`} />
            Export to Excel
          </Button>
          {canManagePatients && (
            <Button
              onClick={() => {
                setSelectedPatient(null)
                navigate('patient-form')
              }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add New Patient
            </Button>
          )}
          {isSuperAdmin && (
            <Button
              variant="outline"
              onClick={() => setImportDialogOpen(true)}
            >
              <Upload className="h-4 w-4 mr-1.5" />
              Import Patients
            </Button>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-2 border-gray-200 hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Patients</p>
                <p className="text-2xl font-bold text-blue-600 mt-1">{total}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-2 border-gray-200 hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">👤 Active</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">{activeCount}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-2 border-gray-200 hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">📊 Inactive</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">{inactiveCount}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100">
                <AlertTriangle className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-2 border-gray-200">
        <CardContent className="p-4">
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2 block">🔍 Search</label>
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  onClear={clear}
                  loading={isDebouncing || loading}
                  placeholder="Search by name, ID, mobile..."
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2 block">📊 Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="border-2 border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">✓ All Status</SelectItem>
                    <SelectItem value="active">✓ Active</SelectItem>
                    <SelectItem value="inactive">⚠️ Inactive</SelectItem>
                    <SelectItem value="discharged">✗ Discharged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Patient Table */}
      <Card>
        <CardContent className="p-0">
          <div className="max-h-[calc(100vh-340px)] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-gradient-to-r from-gray-50 to-gray-100 z-10 border-b-2 border-gray-200">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[100px] font-bold uppercase tracking-wide text-gray-700">🔑 ID</TableHead>
                  <TableHead className="min-w-[150px] font-bold uppercase tracking-wide text-gray-700">👤 Child</TableHead>
                  <TableHead className="hidden sm:table-cell w-[80px] font-bold uppercase tracking-wide text-gray-700">👫 Gender</TableHead>
                  <TableHead className="hidden md:table-cell w-[80px] font-bold uppercase tracking-wide text-gray-700">📅 Age</TableHead>
                  <TableHead className="hidden lg:table-cell min-w-[140px] font-bold uppercase tracking-wide text-gray-700">👨 Parent</TableHead>
                  {canSeeMobile && <TableHead className="hidden md:table-cell w-[120px] font-bold uppercase tracking-wide text-gray-700">📱 Mobile</TableHead>}
                  <TableHead className="hidden xl:table-cell min-w-[140px] font-bold uppercase tracking-wide text-gray-700">🧾 Invoice</TableHead>
                  <TableHead className="w-[90px] font-bold uppercase tracking-wide text-gray-700">📊 Status</TableHead>
                  <TableHead className="text-right w-[140px] font-bold uppercase tracking-wide text-gray-700">⚙️ Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell className="hidden xl:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : patients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <div className="flex flex-col items-center justify-center py-12 gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                          <Users className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="text-center">
                          <p className="font-medium">No patients found</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {query || statusFilter !== 'all'
                              ? 'Try adjusting your search or filter.'
                              : 'Get started by adding your first patient.'}
                          </p>
                        </div>
                        {!query && statusFilter === 'all' && canManagePatients && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedPatient(null)
                              navigate('patient-form')
                            }}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Patient
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  patients.map((patient) => (
                    <TableRow key={patient.id} className="hover:bg-blue-50 hover:shadow-sm transition-all border-l-4 border-transparent hover:border-blue-500">
                      <TableCell className="font-mono text-xs font-medium">
                        {patient.patientId}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
                            {patient.childName?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <span className="font-medium">{patient.childName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell capitalize">
                        {patient.gender}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {calculateAge(patient.dateOfBirth)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                        {patient.parentName || patient.fatherName || patient.motherName || '-'}
                      </TableCell>
                      {canSeeMobile && (
                        <TableCell className="hidden md:table-cell text-sm font-mono">
                          {patient.mobile}
                        </TableCell>
                      )}
                      <TableCell className="hidden xl:table-cell">
                        {patient.invoiceSummary && patient.invoiceSummary.count > 0 ? (
                          <div className="text-sm">
                            <span className={patient.invoiceSummary.balanceDue > 0 ? 'text-orange-600 font-medium' : 'text-green-600 font-medium'}>
                              {patient.invoiceSummary.balanceDue > 0
                                ? `Due ${formatCurrencyShort(patient.invoiceSummary.balanceDue)}`
                                : 'Paid'}
                            </span>
                            <p className="text-[11px] text-muted-foreground">{patient.invoiceSummary.count} invoice{patient.invoiceSummary.count === 1 ? '' : 's'}</p>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">No invoices</span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(patient.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleViewProfile(patient)}
                            title="View Profile"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canManagePatients && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEdit(patient)}
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canManagePatients && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteClick(patient)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {!loading && patients.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => {
                    // Show first, last, current, and neighbors
                    return (
                      p === 1 ||
                      p === totalPages ||
                      Math.abs(p - page) <= 1
                    )
                  })
                  .map((p, idx, arr) => {
                    const prev = arr[idx - 1]
                    const showEllipsis = prev && p - prev > 1
                    return (
                      <React.Fragment key={p}>
                        {showEllipsis && (
                          <span className="px-1 text-muted-foreground text-xs">...</span>
                        )}
                        <Button
                          variant={page === p ? 'default' : 'outline'}
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setPage(p)}
                        >
                          {p}
                        </Button>
                      </React.Fragment>
                    )
                  })}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Patient</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Are you sure you want to permanently delete{' '}
                  <span className="font-semibold text-foreground">{deleteTarget?.childName}</span>?
                </p>
                <p>This action will remove:</p>
                <ul className="list-disc pl-5 text-sm">
                  <li>Patient profile</li>
                  <li>Session packages</li>
                  <li>Scheduled sessions &amp; appointments</li>
                  <li>Assessments</li>
                  <li>Uploaded reports/documents</li>
                </ul>
                <p>
                  Invoices and payments are archived (not deleted) for audit/accounting compliance.
                </p>
                <p className="font-semibold text-destructive">This action cannot be undone.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <label className="text-sm font-medium text-foreground">
              Deletion Reason <span className="text-destructive">*</span>
            </label>
            <textarea
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Enter the reason for deleting this patient (required)..."
              value={deletionReason}
              onChange={(e) => setDeletionReason(e.target.value)}
              disabled={deleting}
              autoFocus
            />
            {deletionReason.trim().length === 0 && (
              <p className="text-xs text-destructive">A deletion reason is required to proceed.</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false)
                setDeleteTarget(null)
                setDeletionReason('')
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting || deletionReason.trim().length === 0}
            >
              {deleting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete Patient
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Patients Dialog — Super Admin only (enterprise import engine) */}
      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        module="patients"
        title="Import Patients"
        description="Upload an Excel (.xlsx) or CSV file to bulk-import patient records. Super Admin only."
        existingRecords={patients.map((p) => ({ mobile: p.mobile, patientId: p.patientId }))}
        onImportComplete={fetchPatients}
      />
    </div>
  )
}
