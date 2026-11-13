'use client'

// Payroll Engine — organization-level salary mode + org-default rates.
// Self-contained: fetches /api/settings (payrollSalaryMode/
// payrollLockAfterGenerate), /api/subscription/features (to grey out
// plan-gated modes), and /api/payroll/rates (organization default rates),
// same convention as PrintBrandingCard.

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Wallet, Save, Lock } from 'lucide-react'
import { authFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import { PAYROLL_SERVICE_TYPES } from '@/lib/therapy-types'

interface RoleOption {
  value: string
  label: string
  isSystem: boolean
}

const SALARY_MODE_OPTIONS = [
  { value: 'MONTHLY', label: 'Monthly Salary', description: 'Every therapist is paid a fixed monthly amount.', feature: null },
  { value: 'PER_SESSION', label: 'Per Session', description: 'Therapists earn a rate per completed session/assessment.', feature: 'payrollPerSession' as const },
  { value: 'HYBRID', label: 'Hybrid (Monthly + Per Session)', description: 'A monthly base plus a per-session top-up.', feature: 'payrollHybrid' as const },
]

export default function PayrollSettingsCard() {
  const [salaryMode, setSalaryMode] = useState('MONTHLY')
  const [lockAfterGenerate, setLockAfterGenerate] = useState(true)
  const [features, setFeatures] = useState<Record<string, boolean | undefined>>({})
  const [planName, setPlanName] = useState<string | null>(null)
  const [defaultRates, setDefaultRates] = useState<Record<string, string>>({})
  const [defaultRateTypes, setDefaultRateTypes] = useState<Record<string, string>>({})
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingRates, setSavingRates] = useState(false)

  // Every custom role (e.g. "Consultant Play Therapist") gets a configurable
  // default rate too, not just the fixed built-in therapy types — mirrors
  // the same merge in EmployeesPage's Session Rates.
  const allServiceTypes = [
    ...PAYROLL_SERVICE_TYPES,
    ...roleOptions.filter((r) => !r.isSystem).map((r) => r.label),
  ].filter((v, i, arr) => arr.indexOf(v) === i)

  useEffect(() => {
    Promise.all([
      authFetch('/api/settings').then((res) => (res.ok ? res.json() : null)),
      authFetch('/api/subscription/features').then((res) => (res.ok ? res.json() : null)),
      authFetch('/api/payroll/rates').then((res) => (res.ok ? res.json() : null)),
      authFetch('/api/roles').then((res) => (res.ok ? res.json() : null)),
    ]).then(([settings, sub, rates, rolesData]) => {
      if (rolesData?.roles) setRoleOptions(rolesData.roles)
      if (settings) {
        setSalaryMode(settings.payrollSalaryMode || 'MONTHLY')
        setLockAfterGenerate(settings.payrollLockAfterGenerate !== false)
      }
      if (sub) {
        setFeatures(sub.features || {})
        setPlanName(sub.planName ?? null)
      }
      if (rates) {
        const rateMap: Record<string, string> = {}
        const typeMap: Record<string, string> = {}
        // Only the plain (no package/branch scoping) org-default row is
        // shown/edited by this simple editor.
        for (const r of rates.organizationDefaultRates || []) {
          if (r.packageId || r.branchId) continue
          rateMap[r.serviceType] = String(r.rate)
          typeMap[r.serviceType] = r.rateType || 'FIXED'
        }
        setDefaultRates(rateMap)
        setDefaultRateTypes(typeMap)
      }
    }).finally(() => setLoaded(true))
  }, [])

  const handleSaveMode = async () => {
    setSaving(true)
    try {
      const res = await authFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payrollSalaryMode: salaryMode,
          payrollLockAfterGenerate: lockAfterGenerate,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to save payroll settings')
        return
      }
      toast.success('Payroll settings saved')
    } catch {
      toast.error('Failed to save payroll settings')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRates = async () => {
    setSavingRates(true)
    try {
      const entries = Object.entries(defaultRates).filter(([, v]) => v.trim() !== '')
      for (const [serviceType, rateStr] of entries) {
        const res = await authFetch('/api/payroll/rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serviceType, rate: Number(rateStr), rateType: defaultRateTypes[serviceType] || 'FIXED' }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          toast.error(err.error || `Failed to save default rate for ${serviceType}`)
          return
        }
      }
      toast.success('Organization default rates saved')
    } catch {
      toast.error('Failed to save default rates')
    } finally {
      setSavingRates(false)
    }
  }

  if (!loaded) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Payroll
        </CardTitle>
        <CardDescription>
          Choose how therapists are paid across the clinic. Individual therapists can override this from their Employee profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <Label className="text-base">Salary Calculation</Label>
          <div className="grid grid-cols-1 gap-2">
            {SALARY_MODE_OPTIONS.map((opt) => {
              const locked = opt.feature ? !features[opt.feature] : false
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={locked}
                  onClick={() => setSalaryMode(opt.value)}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                    salaryMode === opt.value ? 'border-primary bg-primary/5' : 'border-border'
                  } ${locked ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/50'}`}
                >
                  <div className={`mt-0.5 size-4 shrink-0 rounded-full border-2 ${salaryMode === opt.value ? 'border-primary bg-primary' : 'border-muted-foreground'}`} />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{opt.label}</span>
                      {locked && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          <Lock className="size-2.5" /> Upgrade required
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
          {planName && (
            <p className="text-xs text-muted-foreground">Current plan: {planName}</p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base">Lock Sessions After Payroll</Label>
            <p className="text-sm text-muted-foreground">
              Once a therapist&apos;s payroll is generated, their completed sessions for that month can&apos;t be edited or undone until the payroll is unlocked.
            </p>
          </div>
          <Switch checked={lockAfterGenerate} onCheckedChange={setLockAfterGenerate} />
        </div>

        <Button onClick={handleSaveMode} disabled={saving} size="sm">
          <Save className="mr-2 size-4" />
          {saving ? 'Saving...' : 'Save Payroll Settings'}
        </Button>

        <Separator />

        <div className="space-y-2">
          <Label className="text-base">Organization Default Rates</Label>
          <p className="text-sm text-muted-foreground">
            Fallback rate used when a therapist has no custom rate of their own for a service.
          </p>
          <div className="rounded-lg border divide-y">
            {allServiceTypes.map((serviceType) => {
              const rateType = defaultRateTypes[serviceType] || 'FIXED'
              return (
                <div key={serviceType} className="flex items-center justify-between gap-2 p-2.5">
                  <span className="text-sm">{serviceType}</span>
                  <div className="flex items-center gap-2">
                    <Select value={rateType} onValueChange={(v) => setDefaultRateTypes({ ...defaultRateTypes, [serviceType]: v })}>
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
                      placeholder="0"
                      value={defaultRates[serviceType] || ''}
                      onChange={(e) => setDefaultRates({ ...defaultRates, [serviceType]: e.target.value })}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <Button onClick={handleSaveRates} disabled={savingRates} variant="outline" size="sm">
            {savingRates ? 'Saving...' : 'Save Default Rates'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
