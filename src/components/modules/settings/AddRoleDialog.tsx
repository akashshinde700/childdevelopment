'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { authFetch } from '@/lib/api-client'
import { PERMISSION_MODULES, emptyPermissions, hasAtLeastOnePermission, type RolePermission } from '@/lib/role-permissions'

export interface CreatedRole {
  id: string
  name: string
  value: string
}

interface AddRoleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (role: CreatedRole) => void
}

// Custom roles are only enforced for page navigation today (see
// lib/role-permissions.ts normalizeToViewOnly) — so the editor only exposes
// the one permission that's actually respected, instead of promising
// create/edit/delete gating that doesn't exist yet.
const CRUD_FIELDS = ['view'] as const

export function AddRoleDialog({ open, onOpenChange, onCreated }: AddRoleDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [permissions, setPermissions] = useState<RolePermission[]>(emptyPermissions())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const reset = () => {
    setName('')
    setDescription('')
    setPermissions(emptyPermissions())
    setError('')
  }

  const togglePerm = (moduleKey: string, field: (typeof CRUD_FIELDS)[number]) => {
    setPermissions((prev) => prev.map((p) => (p.module === moduleKey ? { ...p, [field]: !p[field] } : p)))
  }

  const selectAll = () => setPermissions((prev) => prev.map((p) => ({ ...p, view: true })))
  const clearAll = () => setPermissions((prev) => prev.map((p) => ({ ...p, view: false })))

  const handleSave = async () => {
    const trimmed = name.trim().replace(/\s+/g, ' ')
    if (!trimmed) {
      setError('Role name is required')
      return
    }
    if (!hasAtLeastOnePermission(permissions)) {
      setError('At least one permission must be selected')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const res = await authFetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, description: description.trim() || undefined, permissions }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to create role')
        return
      }
      toast.success(`Role "${data.name}" created`)
      onCreated({ id: data.id, name: data.name, value: data.value })
      reset()
      onOpenChange(false)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Role</DialogTitle>
          <DialogDescription>Create a custom role with access to specific pages. It will immediately appear in the Role dropdown.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label>Role Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Senior Therapist" disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label>Description (Optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this role"
              rows={2}
              disabled={submitting}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>Page Access *</Label>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={selectAll} disabled={submitting}>Select All Pages</Button>
              <Button type="button" variant="outline" size="sm" onClick={clearAll} disabled={submitting}>Clear All Pages</Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Custom roles currently control which pages a user can open, not individual create/edit/delete actions within those pages — that per-action enforcement doesn't exist yet, so it isn't offered here. Treat this role as read-mostly access to the modules checked below.
          </p>

          <div className="rounded-md border divide-y max-h-[320px] overflow-y-auto">
            {PERMISSION_MODULES.map((mod) => {
              const perm = permissions.find((p) => p.module === mod.key)!
              return (
                <div key={mod.key} className="p-3">
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                    <Checkbox checked={perm.view} onCheckedChange={() => togglePerm(mod.key, 'view')} disabled={submitting} />
                    {mod.label}
                  </label>
                </div>
              )
            })}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
              reset()
            }}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
