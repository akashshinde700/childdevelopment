'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { CreditCard, Users, Building2, UserCog, HardDrive, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

interface SubscriptionData {
  subscription: {
    status: string
    paymentProvider: string | null
    currentPeriodStart: string
    currentPeriodEnd: string | null
    trialEndsAt: string | null
    cancelAtPeriodEnd: boolean
  }
  plan: {
    name: string
    tier: string
    therapistLimit: number
    branchLimit: number
    userLimit: number
    storageLimitMB: number
    priceMonthly: number
    priceYearly: number
    features: Record<string, boolean>
  }
  usage: {
    therapists: number
    branches: number
    staff: number
  }
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  trialing: 'bg-amber-50 text-amber-700 border-amber-200',
  past_due: 'bg-orange-50 text-orange-700 border-orange-200',
  suspended: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-gray-50 text-gray-600 border-gray-200',
}

const FEATURE_LABELS: Record<string, string> = {
  customBranding: 'Custom Branding',
  whiteLabel: 'White Label',
  advancedReports: 'Advanced Reports',
  exportData: 'Data Export',
  apiAccess: 'API Access',
}

function UsageBar({ icon: Icon, label, used, limit }: { icon: React.ElementType; label: string; used: number; limit: number }) {
  const unlimited = limit >= 999
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100))
  const nearLimit = !unlimited && pct >= 90
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-gray-700 font-medium">
          <Icon className="h-4 w-4 text-[#0F7A87]" />
          {label}
        </span>
        <span className={nearLimit ? 'text-red-600 font-semibold' : 'text-gray-500'}>
          {used} {unlimited ? '' : `/ ${limit}`}
        </span>
      </div>
      {!unlimited && (
        <Progress value={pct} className={nearLimit ? '[&>div]:bg-red-500' : '[&>div]:bg-[#0F7A87]'} />
      )}
    </div>
  )
}

export default function SubscriptionPage() {
  const [data, setData] = useState<SubscriptionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/subscription')
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          setError(err.error || 'Failed to load subscription')
          return
        }
        setData(await res.json())
      } catch {
        setError('Network error loading subscription')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading subscription…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <CreditCard className="h-10 w-10 text-gray-300 mb-3" />
        <p className="text-gray-500">{error || 'No subscription data available.'}</p>
      </div>
    )
  }

  const { subscription, plan, usage } = data

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CreditCard className="h-6 w-6" style={{ color: '#0F7A87' }} />
          Subscription &amp; Plan
        </h1>
        <p className="text-sm text-gray-500 mt-1">Your organization's current plan, usage, and features.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-xl">{plan.name} Plan</CardTitle>
            <CardDescription>
              ₹{plan.priceMonthly.toLocaleString('en-IN')}/month · ₹{plan.priceYearly.toLocaleString('en-IN')}/year
            </CardDescription>
          </div>
          <Badge variant="outline" className={STATUS_STYLES[subscription.status] || 'bg-gray-50 text-gray-600 border-gray-200'}>
            {subscription.status.replace('_', ' ')}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <UsageBar icon={Users} label="Therapists" used={usage.therapists} limit={plan.therapistLimit} />
            <UsageBar icon={Building2} label="Branches" used={usage.branches} limit={plan.branchLimit} />
            <UsageBar icon={UserCog} label="Staff Users" used={usage.staff} limit={plan.userLimit} />
          </div>

          <div className="pt-2 border-t border-gray-100">
            <div className="flex items-center gap-2 text-sm text-gray-600 pt-4">
              <HardDrive className="h-4 w-4 text-[#0F7A87]" />
              Storage limit: <span className="font-medium text-gray-900">{(plan.storageLimitMB / 1024).toFixed(0)} GB</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(plan.features).map(([key, enabled]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                {enabled ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-gray-300 shrink-0" />
                )}
                <span className={enabled ? 'text-gray-900' : 'text-gray-400'}>{FEATURE_LABELS[key] || key}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {subscription.trialEndsAt && (
        <p className="text-xs text-gray-400 text-center">Trial ends {new Date(subscription.trialEndsAt).toLocaleDateString('en-IN')}</p>
      )}
    </div>
  )
}
