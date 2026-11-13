'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Phone,
  Plus,
  Filter,
  Eye,
  Edit,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Users,
  Trash2,
  Upload,
} from 'lucide-react'
import { ImportDialog } from '@/components/ui/import-dialog'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchInput } from '@/components/ui/search-input'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'
import { toast } from 'sonner'
import { useAppStore } from '@/store/app-store'
import { authFetch } from '@/lib/api-client'

// Types
interface LeadRecord {
  id: string
  name: string
  mobile: string
  email: string | null
  childName: string | null
  childAge: string | null
  concern: string | null
  source: string | null
  status: string
  notes: string | null
  assignedTo: string | null
  createdAt: string
  updatedAt: string
}

// Source options
const sources = [
  { value: 'doctor', label: 'Doctor Referral' },
  { value: 'school', label: 'School Referral' },
  { value: 'parent_reference', label: 'Parent Reference' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'advertisement', label: 'Advertisement' },
  { value: 'website', label: 'Website' },
  { value: 'walk_in', label: 'Walk In' },
]

// Source badge colors
function getSourceBadge(source: string) {
  switch (source) {
    case 'doctor':
      return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">Doctor</Badge>
    case 'school':
      return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">School</Badge>
    case 'parent_reference':
      return <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400">Parent Ref</Badge>
    case 'social_media':
      return <Badge className="bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400">Social Media</Badge>
    case 'advertisement':
      return <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400">Ad</Badge>
    case 'website':
      return <Badge className="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400">Website</Badge>
    case 'walk_in':
      return <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-400">Walk In</Badge>
    default:
      return <Badge variant="outline">{source || '-'}</Badge>
  }
}

// Lead status badge
function getLeadStatusBadge(status: string) {
  switch (status) {
    case 'new':
      return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">New</Badge>
    case 'contacted':
      return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400">Contacted</Badge>
    case 'interested':
      return <Badge className="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400">Interested</Badge>
    case 'registered':
      return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">Registered</Badge>
    case 'lost':
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">Dropped</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export default function LeadsPage() {
  const navigate = useAppStore((s) => s.navigate)
  const setSelectedPatient = useAppStore((s) => s.setSelectedPatient)
  const globalSearchQuery = useAppStore((s) => s.searchQuery)
  const setGlobalSearchQuery = useAppStore((s) => s.setSearchQuery)
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const limit = 20

  // Filters
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSource, setFilterSource] = useState('')
  // Reusable debounced search — seeded with the global search bar value.
  const { query, debouncedQuery, setQuery, isDebouncing, clear } = useDebouncedSearch(globalSearchQuery)

  useEffect(() => {
    if (globalSearchQuery) {
      setQuery(globalSearchQuery)
      setGlobalSearchQuery('')
    }
  }, [globalSearchQuery, setGlobalSearchQuery, setQuery])

  // Reset page when the debounced search actually fires
  useEffect(() => {
    setPage(1)
  }, [debouncedQuery])

  // Summary stats
  const [stats, setStats] = useState({ new: 0, contacted: 0, interested: 0, registered: 0, dropped: 0 })
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])
  const [employeeSearch, setEmployeeSearch] = useState('')

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingLead, setEditingLead] = useState<LeadRecord | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)

  // Form
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    email: '',
    childName: '',
    childAge: '',
    concern: '',
    source: '',
    status: 'new',
    assignedTo: '',
    notes: '',
  })

  // Fetch leads
  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', page.toString())
      params.set('limit', limit.toString())
      if (debouncedQuery) params.set('search', debouncedQuery)
      if (filterStatus) params.set('status', filterStatus)
      if (filterSource) params.set('source', filterSource)

      const res = await authFetch(`/api/leads?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setLeads(json.leads || [])
        setTotal(json.total)
      }
    } catch (err) {
      console.error('Failed to fetch leads:', err)
    } finally {
      setLoading(false)
    }
  }, [page, debouncedQuery, filterStatus, filterSource])

  // Fetch all leads for stats (without pagination)
  const fetchStats = useCallback(async () => {
    try {
      const res = await authFetch('/api/leads?limit=1000')
      if (res.ok) {
        const json = await res.json()
        const allLeads = json.leads || []
        setStats({
          new: allLeads.filter((l: LeadRecord) => l.status === 'new').length,
          contacted: allLeads.filter((l: LeadRecord) => l.status === 'contacted').length,
          interested: allLeads.filter((l: LeadRecord) => l.status === 'interested').length,
          registered: allLeads.filter((l: LeadRecord) => l.status === 'registered').length,
          dropped: allLeads.filter((l: LeadRecord) => l.status === 'lost' || l.status === 'dropped').length,
        })
      }
    } catch (err) {
      console.error('Failed to fetch lead stats:', err)
    }
  }, [])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const res = await authFetch('/api/employees?limit=100&status=active')
        if (res.ok) {
          const json = await res.json()
          setEmployees(json.employees || [])
        }
      } catch (err) {
        console.error('Failed to fetch employees:', err)
      }
    }

    fetchEmployees()
  }, [])

  const filteredEmployees = employees.filter((emp) =>
    emp.name.toLowerCase().includes(employeeSearch.toLowerCase())
  )

  // Open dialog for new lead
  const handleNewLead = () => {
    setEditingLead(null)
    setFormData({
      name: '',
      mobile: '',
      email: '',
      childName: '',
      childAge: '',
      concern: '',
      source: '',
      status: 'new',
      assignedTo: '',
      notes: '',
    })
    setDialogOpen(true)
  }

  // Open dialog for editing
  const handleEditLead = (lead: LeadRecord) => {
    setEditingLead(lead)
    setFormData({
      name: lead.name,
      mobile: lead.mobile,
      email: lead.email || '',
      childName: lead.childName || '',
      childAge: lead.childAge || '',
      concern: lead.concern || '',
      source: lead.source || '',
      status: lead.status,
      assignedTo: lead.assignedTo || '',
      notes: lead.notes || '',
    })
    setDialogOpen(true)
  }

  // Convert lead to patient
  const handleConvertToPatient = (lead: LeadRecord) => {
    // Don't set selectedPatient with lead ID - it's not a patient ID
    // The patient form should create a new patient record
    setSelectedPatient(null)
    navigate('patient-form')
    toast.info('Create a new patient record using the lead information')
  }

  // Submit form
  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Please enter a name')
      return
    }
    if (!formData.mobile.trim()) {
      toast.error('Please enter a mobile number')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        ...(editingLead ? { id: editingLead.id } : {}),
        name: formData.name,
        mobile: formData.mobile,
        email: formData.email,
        childName: formData.childName,
        childAge: formData.childAge,
        concern: formData.concern,
        source: formData.source,
        status: formData.status,
        assignedTo: formData.assignedTo,
        notes: formData.notes,
      }

      const res = await authFetch('/api/leads', {
        method: editingLead ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        toast.success(editingLead ? 'Lead updated successfully' : 'Lead added successfully')
        setDialogOpen(false)
        fetchLeads()
        fetchStats()
      } else {
        toast.error('Failed to save lead')
      }
    } catch {
      toast.error('Failed to save lead')
    } finally {
      setSubmitting(false)
    }
  }

  // Delete lead
  const handleDelete = async (leadId: string) => {
    if (!confirm('Are you sure you want to delete this lead?')) return
    if (deletingLeadId) return
    setDeletingLeadId(leadId)
    try {
      const res = await authFetch(`/api/leads?id=${leadId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Lead deleted successfully')
        fetchLeads()
        fetchStats()
      } else {
        toast.error('Failed to delete lead')
      }
    } catch {
      toast.error('Failed to delete lead')
    } finally {
      setDeletingLeadId(null)
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads & Inquiries</h1>
          <p className="text-muted-foreground text-sm">Track and manage potential patient leads</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button onClick={handleNewLead}>
            <Plus className="h-4 w-4 mr-2" />
            New Lead
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-5">
        <Card className="p-4 gap-0">
          <p className="text-xs text-muted-foreground font-medium">New</p>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{stats.new}</p>
        </Card>
        <Card className="p-4 gap-0">
          <p className="text-xs text-muted-foreground font-medium">Contacted</p>
          <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{stats.contacted}</p>
        </Card>
        <Card className="p-4 gap-0">
          <p className="text-xs text-muted-foreground font-medium">Interested</p>
          <p className="text-xl font-bold text-teal-600 dark:text-teal-400">{stats.interested}</p>
        </Card>
        <Card className="p-4 gap-0">
          <p className="text-xs text-muted-foreground font-medium">Registered</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{stats.registered}</p>
        </Card>
        <Card className="p-4 gap-0">
          <p className="text-xs text-muted-foreground font-medium">Dropped</p>
          <p className="text-xl font-bold text-red-600 dark:text-red-400">{stats.dropped}</p>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            onClear={clear}
            loading={isDebouncing || loading}
            placeholder="Search by name, mobile, or child name..."
            className="flex-1"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v === 'all' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="interested">Interested</SelectItem>
                <SelectItem value="registered">Registered</SelectItem>
                <SelectItem value="lost">Dropped</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSource} onValueChange={(v) => { setFilterSource(v === 'all' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {sources.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Leads Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lead Records</CardTitle>
          <CardDescription>{total} total leads</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Users className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-muted-foreground text-sm">No leads found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Mobile</TableHead>
                      <TableHead className="hidden md:table-cell">Child Name</TableHead>
                      <TableHead className="hidden lg:table-cell">Age</TableHead>
                      <TableHead className="hidden xl:table-cell">Concern</TableHead>
                      <TableHead className="hidden md:table-cell">Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden lg:table-cell">Date</TableHead>
                      <TableHead className="hidden lg:table-cell">Assigned To</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell className="font-medium text-sm">{lead.name}</TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {lead.mobile}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{lead.childName || '-'}</TableCell>
                        <TableCell className="hidden lg:table-cell text-sm">{lead.childAge || '-'}</TableCell>
                        <TableCell className="hidden xl:table-cell max-w-[140px] truncate text-sm text-muted-foreground">{lead.concern || '-'}</TableCell>
                        <TableCell className="hidden md:table-cell">{getSourceBadge(lead.source || '')}</TableCell>
                        <TableCell>{getLeadStatusBadge(lead.status)}</TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{format(parseISO(lead.createdAt), 'dd MMM yyyy')}</TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{lead.assignedTo || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditLead(lead)} title="Edit">
                              <Edit className="h-4 w-4" />
                            </Button>
                            {lead.status !== 'registered' && lead.status !== 'lost' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                onClick={() => handleConvertToPatient(lead)}
                                title="Convert to Patient"
                              >
                                <UserPlus className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                              onClick={() => handleDelete(lead.id)}
                              disabled={deletingLeadId === lead.id}
                              title="Delete"
                              aria-label="Delete lead"
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
                    Page {page} of {totalPages} ({total} records)
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Lead Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLead ? 'Edit Lead' : 'New Lead'}</DialogTitle>
            <DialogDescription>
              {editingLead ? 'Update lead information below' : 'Fill in the lead/inquiry details'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Contact person name"
                />
              </div>
              <div className="space-y-2">
                <Label>Mobile *</Label>
                <Input
                  value={formData.mobile}
                  onChange={(e) => setFormData((prev) => ({ ...prev, mobile: e.target.value }))}
                  placeholder="Mobile number"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Email address"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Child Name</Label>
                <Input
                  value={formData.childName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, childName: e.target.value }))}
                  placeholder="Child's name"
                />
              </div>
              <div className="space-y-2">
                <Label>Child Age</Label>
                <Input
                  value={formData.childAge}
                  onChange={(e) => setFormData((prev) => ({ ...prev, childAge: e.target.value }))}
                  placeholder="e.g., 5 years"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Concern</Label>
              <Input
                value={formData.concern}
                onChange={(e) => setFormData((prev) => ({ ...prev, concern: e.target.value }))}
                placeholder="Primary concern / issue"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Source</Label>
                <Select
                  value={formData.source}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, source: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {sources.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, status: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="interested">Interested</SelectItem>
                    <SelectItem value="registered">Registered</SelectItem>
                    <SelectItem value="lost">Dropped</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assigned To</Label>
              <Select
                value={formData.assignedTo}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, assignedTo: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <div className="p-2">
                    <Input
                      placeholder="Search staff..."
                      value={employeeSearch}
                      onChange={(e) => setEmployeeSearch(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  {filteredEmployees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.name}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Saving...' : editingLead ? 'Update Lead' : 'Add Lead'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        module="leads"
        title="Import Leads"
        onImportComplete={() => fetchLeads()}
      />
    </div>
  )
}
