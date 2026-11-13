'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Loader2, Download } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { authFetch } from '@/lib/api-client'

interface Patient {
  id: string
  patientId: string
  childName: string
  parentName?: string | null
  mobile: string
  email?: string | null
}

interface User {
  id: string
  email: string
  name: string
  role: string
  patientId?: string | null
}

export default function ParentLoginPage() {
  const { toast } = useToast()
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientsLoading, setPatientsLoading] = useState(true)
  const [users, setUsers] = useState<User[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '' })
  const [submitting, setSubmitting] = useState(false)

  const fetchPatients = useCallback(async () => {
    setPatientsLoading(true)
    try {
      const res = await authFetch('/api/patients?limit=200')
      if (res.ok) {
        const json = await res.json()
        setPatients(json.patients || [])
      }
    } catch (error) {
      console.error(error)
      toast({ title: 'Error', description: 'Unable to load patients', variant: 'destructive' })
    } finally {
      setPatientsLoading(false)
    }
  }, [toast])

  const fetchParentUsers = useCallback(async () => {
    try {
      const params = new URLSearchParams({ role: 'parent' })
      const res = await authFetch(`/api/users?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setUsers(Array.isArray(json) ? json : [])
      }
    } catch (error) {
      console.error(error)
      toast({ title: 'Error', description: 'Unable to load parent credentials', variant: 'destructive' })
    }
  }, [toast])

  useEffect(() => {
    fetchPatients()
    fetchParentUsers()
  }, [fetchPatients, fetchParentUsers])

  const hasCredentials = (patient: Patient) => {
    return users.some(user => user.patientId === patient.id || user.email === (patient.email || ''))
  }

  const [exporting, setExporting] = useState(false)
  const handleExportExcel = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const headers = ['Patient ID', 'Child Name', 'Parent Name', 'Mobile', 'Email', 'Login Status']
      const rows = patients.map((patient) => [
        patient.patientId,
        patient.childName,
        patient.parentName || '',
        patient.mobile,
        patient.email || '',
        hasCredentials(patient) ? 'Active' : 'Not Created',
      ])
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Parent Login Management')
      XLSX.writeFile(wb, 'Parent_Login_Management.xlsx')
    } catch (error) {
      console.error(error)
      toast({ title: 'Error', description: 'Failed to export parent login records', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  const openCreateDialog = (patient: Patient) => {
    setSelectedPatient(patient)
    setForm({ email: patient.email || '', password: '', confirmPassword: '' })
    setDialogOpen(true)
  }

  const handleCreate = async () => {
    if (!selectedPatient) return
    if (!form.email || !form.password) {
      toast({ title: 'Error', description: 'Email and password are required', variant: 'destructive' })
      return
    }
    if (form.password !== form.confirmPassword) {
      toast({ title: 'Error', description: 'Passwords do not match', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      const res = await authFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedPatient.parentName || `${selectedPatient.childName} Parent`,
          email: form.email,
          password: form.password,
          role: 'parent',
          phone: selectedPatient.mobile,
          patientId: selectedPatient.id,
        }),
      })

      if (res.ok) {
        toast({ title: 'Success', description: 'Parent credentials created' })
        setDialogOpen(false)
        fetchParentUsers()
      } else {
        const json = await res.json().catch(() => ({}))
        toast({ title: 'Error', description: json.error || 'Failed to create credentials', variant: 'destructive' })
      }
    } catch (error) {
      console.error(error)
      toast({ title: 'Error', description: 'Failed to create credentials', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Parent Login Management</h1>
          <p className="text-sm text-muted-foreground">Create and manage parent login credentials using the existing user API.</p>
        </div>
        <Button variant="outline" onClick={handleExportExcel} disabled={exporting}>
          <Download className="h-4 w-4 mr-2" />
          Export to Excel
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient ID</TableHead>
                <TableHead>Child Name</TableHead>
                <TableHead className="hidden lg:table-cell">Parent Name</TableHead>
                <TableHead className="hidden md:table-cell">Mobile</TableHead>
                <TableHead className="hidden xl:table-cell">Email</TableHead>
                <TableHead>Login Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patientsLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-6 text-center text-muted-foreground">Loading patients...</TableCell>
                </TableRow>
              ) : patients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-6 text-center text-muted-foreground">No patients found</TableCell>
                </TableRow>
              ) : (
                patients.map(patient => {
                  const active = hasCredentials(patient)
                  return (
                    <TableRow key={patient.id}>
                      <TableCell className="font-mono text-xs">{patient.patientId}</TableCell>
                      <TableCell>{patient.childName}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{patient.parentName || '-'}</TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-sm">{patient.mobile}</TableCell>
                      <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">{patient.email || '-'}</TableCell>
                      <TableCell>
                        {active ? <span className="text-sm text-green-600">Active</span> : <span className="text-sm text-muted-foreground">Not Created</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openCreateDialog(patient)}
                            title="Create Parent Credentials"
                          >
                            {submitting && selectedPatient?.id === patient.id ? (
                              <Loader2 className="animate-spin h-4 w-4" />
                            ) : (
                              <Plus className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Parent Credentials</DialogTitle>
            <DialogDescription>Create login credentials for the parent/guardian using the existing users API.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Parent Email</Label>
              <Input
                value={form.email}
                onChange={event => setForm(prev => ({ ...prev, email: event.target.value }))}
                placeholder="parent@example.com"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={event => setForm(prev => ({ ...prev, password: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Confirm Password</Label>
                <Input
                  type="password"
                  value={form.confirmPassword}
                  onChange={event => setForm(prev => ({ ...prev, confirmPassword: event.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Credentials'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
