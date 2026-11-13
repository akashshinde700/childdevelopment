'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  SlidersHorizontal,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ShieldAlert,
  PaintBucket,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { useAppStore } from '@/store/app-store'
import { authFetch } from '@/lib/api-client'
import { clearConfigCache } from '@/hooks/use-system-config'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AllSystemConfigItem {
  id: string
  category: string
  key: string
  label: string
  color: string | null
  sortOrder: number
  isActive: boolean
  metadata: string | null
  createdAt: string
  updatedAt: string
}

// Category labels for the tab UI
const CATEGORY_LABELS: Record<string, string> = {
  roles: 'Roles',
  therapy_types: 'Therapy Types',
  appointment_statuses: 'Appointment Statuses',
  appointment_types: 'Appointment Types',
  assessment_types: 'Assessment Types',
  session_statuses: 'Session Statuses',
  expense_categories: 'Expense Categories',
  expense_statuses: 'Expense Statuses',
  leave_types: 'Leave Types',
  leave_statuses: 'Leave Statuses',
  payment_modes: 'Payment Modes',
  payment_types: 'Payment Types',
  invoice_types: 'Invoice Types',
  invoice_statuses: 'Invoice Statuses',
  lead_sources: 'Lead Sources',
  lead_statuses: 'Lead Statuses',
  patient_statuses: 'Patient Statuses',
  genders: 'Genders',
  employee_departments: 'Employee Departments',
  employee_statuses: 'Employee Statuses',
  payroll_statuses: 'Payroll Statuses',
  attendance_statuses: 'Attendance Statuses',
  whatsapp_templates: 'WhatsApp Templates',
  whatsapp_statuses: 'WhatsApp Statuses',
}

const DEFAULT_CATEGORIES = Object.keys(CATEGORY_LABELS)

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function ColorPreview({ color }: { color: string | null }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block h-4 w-4 rounded-full border border-gray-300 dark:border-gray-600"
        style={{ backgroundColor: color || 'transparent' }}
      />
      <span className="font-mono text-xs text-muted-foreground">
        {color || '—'}
      </span>
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Add / Edit dialog
// ─────────────────────────────────────────────────────────────────────────────

interface ItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: string
  initial?: AllSystemConfigItem | null
  onSaved: () => void
}

function ItemDialog({ open, onOpenChange, category, initial, onSaved }: ItemDialogProps) {
  const [form, setForm] = useState({
    key: '',
    label: '',
    color: '',
    sortOrder: 0,
    isActive: true,
    metadata: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({
        key: initial?.key ?? '',
        label: initial?.label ?? '',
        color: initial?.color ?? '',
        sortOrder: initial?.sortOrder ?? 0,
        isActive: initial?.isActive ?? true,
        metadata: initial?.metadata ?? '',
      })
    }
  }, [open, initial])

  const isEdit = !!initial

  const handleSubmit = async () => {
    if (!form.key.trim() || !form.label.trim()) {
      toast.error('Key and Label are required')
      return
    }
    setSaving(true)
    try {
      const res = await authFetch('/api/config/item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          key: form.key.trim(),
          label: form.label.trim(),
          color: form.color.trim() || null,
          sortOrder: Number(form.sortOrder) || 0,
          isActive: form.isActive,
          metadata: form.metadata.trim() || null,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'Failed to save item')
      }
      toast.success(isEdit ? 'Config item updated' : 'Config item created')
      clearConfigCache()
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error((e as Error).message || 'Failed to save item')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit Config Item' : 'Add Config Item'}
          </DialogTitle>
          <DialogDescription>
            Category: <span className="font-mono text-xs">{category}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cfg-key">Key *</Label>
              <Input
                id="cfg-key"
                value={form.key}
                disabled={isEdit}
                onChange={(e) => setForm((p) => ({ ...p, key: e.target.value }))}
                placeholder="e.g. cash, pending"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">Lowercase snake_case recommended.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cfg-label">Label *</Label>
              <Input
                id="cfg-label"
                value={form.label}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                placeholder="Human-readable label"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cfg-color">Color (hex)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="cfg-color"
                  value={form.color}
                  onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                  placeholder="#2563eb"
                  className="font-mono"
                />
                <span
                  aria-hidden
                  className="h-8 w-8 shrink-0 rounded-md border border-gray-300 dark:border-gray-600"
                  style={{ backgroundColor: form.color || 'transparent' }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cfg-sort">Sort Order</Label>
              <Input
                id="cfg-sort"
                type="number"
                inputMode="numeric"
                value={form.sortOrder}
                onChange={(e) => setForm((p) => ({ ...p, sortOrder: Number(e.target.value) || 0 }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cfg-meta">Metadata (optional JSON)</Label>
            <Input
              id="cfg-meta"
              value={form.metadata}
              onChange={(e) => setForm((p) => ({ ...p, metadata: e.target.value }))}
              placeholder='{"icon":"banknote"}'
              className="font-mono text-xs"
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <Label htmlFor="cfg-active" className="cursor-pointer">Active</Label>
              <p className="text-[11px] text-muted-foreground">Inactive items are hidden from regular dropdowns.</p>
            </div>
            <Switch
              id="cfg-active"
              checked={form.isActive}
              onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-category tab content
// ─────────────────────────────────────────────────────────────────────────────

interface CategoryPanelProps {
  category: string
  items: AllSystemConfigItem[]
  loading: boolean
  onRefresh: () => void
}

function CategoryPanel({ category, items, loading, onRefresh }: CategoryPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AllSystemConfigItem | null>(null)
  const [deleting, setDeleting] = useState<AllSystemConfigItem | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [toggleBusy, setToggleBusy] = useState<string | null>(null)

  const openAdd = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (item: AllSystemConfigItem) => {
    setEditing(item)
    setDialogOpen(true)
  }

  const handleToggleActive = async (item: AllSystemConfigItem) => {
    setToggleBusy(item.id)
    try {
      const res = await authFetch('/api/config/item', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          isActive: !item.isActive,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'Failed to update item')
      }
      toast.success(`Item ${!item.isActive ? 'activated' : 'deactivated'}`)
      clearConfigCache()
      onRefresh()
    } catch (e) {
      toast.error((e as Error).message || 'Failed to update item')
    } finally {
      setToggleBusy(null)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    setDeleteSubmitting(true)
    try {
      const res = await authFetch(`/api/config/item?id=${encodeURIComponent(deleting.id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'Failed to delete item')
      }
      toast.success('Item deleted')
      clearConfigCache()
      onRefresh()
      setDeleting(null)
    } catch (e) {
      toast.error((e as Error).message || 'Failed to delete item')
    } finally {
      setDeleteSubmitting(false)
    }
  }

  const activeCount = items.filter((i) => i.isActive).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{CATEGORY_LABELS[category] || category}</h3>
          <p className="text-xs text-muted-foreground">
            {items.length} item{items.length !== 1 ? 's' : ''} ({activeCount} active)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <SlidersHorizontal className="h-8 w-8 opacity-40" />
              <p className="text-sm">No items in this category yet.</p>
              <Button size="sm" variant="outline" onClick={openAdd}>
                <Plus className="mr-2 h-4 w-4" />
                Add the first item
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">#</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead className="hidden md:table-cell">Color</TableHead>
                    <TableHead className="w-[100px]">Sort</TableHead>
                    <TableHead className="w-[110px]">Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow
                      key={item.id}
                      className={!item.isActive ? 'opacity-60' : ''}
                    >
                      <TableCell className="text-muted-foreground">
                        <PaintBucket className="h-3.5 w-3.5" style={{ color: item.color || undefined }} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.key}</TableCell>
                      <TableCell>
                        <span className="font-medium">{item.label}</span>
                        {!item.isActive && (
                          <Badge variant="outline" className="ml-2 text-[10px]">inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <ColorPreview color={item.color} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.sortOrder}</TableCell>
                      <TableCell>
                        <Switch
                          checked={item.isActive}
                          disabled={toggleBusy === item.id}
                          onCheckedChange={() => handleToggleActive(item)}
                          aria-label={`Toggle active for ${item.label}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(item)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleting(item)}
                            title="Delete"
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
          )}
        </CardContent>
      </Card>

      <ItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={category}
        initial={editing}
        onSaved={onRefresh}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete config item?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to permanently delete <span className="font-semibold">{deleting?.label}</span>{' '}
              (<span className="font-mono text-xs">{deleting?.key}</span>) from{' '}
              <span className="font-mono text-xs">{deleting?.category}</span>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={deleteSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function SystemConfigPage() {
  const user = useAppStore((s) => s.user)
  const isSuperAdmin = user?.role === 'super_admin'

  const [data, setData] = useState<Record<string, AllSystemConfigItem[]>>({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string>('roles')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/config/all')
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'Failed to load config')
      }
      const json = (await res.json()) as Record<string, AllSystemConfigItem[]>
      setData(json)
    } catch (e) {
      toast.error((e as Error).message || 'Failed to load config')
      setData({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isSuperAdmin) {
      fetchAll()
    } else {
      setLoading(false)
    }
  }, [isSuperAdmin, fetchAll])

  if (!isSuperAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You don&apos;t have permission to view this page. System Configuration
              is restricted to Super Admin users only.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  // Use existing categories plus any extras that come back from the DB.
  const allCategories = Array.from(new Set([
    ...DEFAULT_CATEGORIES,
    ...Object.keys(data),
  ]))

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <SlidersHorizontal className="h-6 w-6" />
            System Configuration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage all dropdown values, statuses, and categories used across the ERP.
            Changes here immediately affect every module.
          </p>
        </div>
        <Button variant="outline" onClick={fetchAll} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="max-w-full overflow-x-auto pb-1">
          <TabsList className="flex w-max flex-wrap h-auto gap-1">
            {allCategories.map((cat) => (
              <TabsTrigger key={cat} value={cat} className="text-xs">
                {CATEGORY_LABELS[cat] || cat}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {allCategories.map((cat) => (
          <TabsContent key={cat} value={cat} className="mt-4">
            <CategoryPanel
              category={cat}
              items={data[cat] ?? []}
              loading={loading}
              onRefresh={fetchAll}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
