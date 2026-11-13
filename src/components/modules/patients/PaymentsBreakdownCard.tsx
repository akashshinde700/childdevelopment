'use client'

import React, { useState } from 'react'
import { format } from 'date-fns'
import { Package, CalendarCheck, Receipt, ChevronDown, IndianRupee } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Totals { total: number; paid: number; due: number }

export interface BillingBreakdown {
  packages: Totals & {
    items: Array<Totals & {
      id: string; name: string; therapyType: string | null
      sessionsUsed: number; sessionsPurchased: number; status: string
    }>
  }
  sessions: Totals & {
    items: Array<Totals & {
      id: string; invoiceNo: string; date: string; therapyType: string | null
      therapistName: string | null; sessionStatus: string
    }>
  }
  other: Totals & {
    items: Array<Totals & { id: string; invoiceNo: string; date: string; notes: string | null }>
  }
}

const inr = (n: number) => `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0)}`

function PaidBadge({ paid, due }: { paid: number; due: number }) {
  if (due <= 0) return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Paid</Badge>
  if (paid > 0) return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">Partly paid</Badge>
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Unpaid</Badge>
}

/** Total / Paid / Due strip — same three numbers in every section. */
function TotalsStrip({ t }: { t: Totals }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div className="rounded-md bg-muted/50 px-2 py-1.5">
        <p className="text-[11px] text-muted-foreground">Total</p>
        <p className="text-sm font-semibold">{inr(t.total)}</p>
      </div>
      <div className="rounded-md bg-emerald-50 px-2 py-1.5 dark:bg-emerald-950/30">
        <p className="text-[11px] text-emerald-700 dark:text-emerald-400">Paid</p>
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{inr(t.paid)}</p>
      </div>
      <div className={`rounded-md px-2 py-1.5 ${t.due > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-muted/50'}`}>
        <p className={`text-[11px] ${t.due > 0 ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground'}`}>Due</p>
        <p className={`text-sm font-semibold ${t.due > 0 ? 'text-red-700 dark:text-red-400' : ''}`}>{inr(t.due)}</p>
      </div>
    </div>
  )
}

function Section({
  icon, title, hint, totals, count, children, defaultOpen,
}: {
  icon: React.ReactNode; title: string; hint: string; totals: Totals; count: number
  children: React.ReactNode; defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title} <span className="font-normal text-muted-foreground">({count})</span></span>
          <span className="block truncate text-xs text-muted-foreground">{hint}</span>
        </span>
        <span className="hidden text-right sm:block">
          <span className="block text-xs text-muted-foreground">Due</span>
          <span className={`block text-sm font-semibold ${totals.due > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{inr(totals.due)}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t px-3 py-3">
          <TotalsStrip t={totals} />
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * Patient's billing split by HOW they pay: a package, session by session,
 * or other one-off charges. The single "Payment Status" card mixes all of
 * them into one number, which is hard to read for a patient on a package
 * who also books extra sessions.
 */
export function PaymentsBreakdownCard({ breakdown }: { breakdown: BillingBreakdown | undefined }) {
  if (!breakdown) return null
  const { packages, sessions, other } = breakdown
  const nothing = packages.items.length === 0 && sessions.items.length === 0 && other.items.length === 0
  const grand: Totals = {
    total: packages.total + sessions.total + other.total,
    paid: packages.paid + sessions.paid + other.paid,
    due: packages.due + sessions.due + other.due,
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <IndianRupee className="h-4 w-4 text-primary" />
          Payments Breakdown
        </CardTitle>
        <p className="text-xs text-muted-foreground">What has been billed and paid — package-wise and session-wise, separately.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {nothing ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing billed for this patient yet.</p>
        ) : (
          <>
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Overall</p>
              <TotalsStrip t={grand} />
            </div>

            {packages.items.length > 0 && (
              <Section
                icon={<Package className="h-4 w-4" />}
                title="Package-wise"
                hint="Paid for as a package of sessions"
                totals={packages}
                count={packages.items.length}
                defaultOpen
              >
                <div className="space-y-2">
                  {packages.items.map((p) => (
                    <div key={p.id} className="rounded-md border px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium">{p.name}</p>
                        <PaidBadge paid={p.paid} due={p.due} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {p.therapyType ? `${p.therapyType} · ` : ''}{p.sessionsUsed}/{p.sessionsPurchased} sessions used
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                        <span>Total <b>{inr(p.total)}</b></span>
                        <span className="text-emerald-700">Paid <b>{inr(p.paid)}</b></span>
                        <span className={p.due > 0 ? 'text-red-600' : 'text-muted-foreground'}>Due <b>{inr(p.due)}</b></span>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {sessions.items.length > 0 && (
              <Section
                icon={<CalendarCheck className="h-4 w-4" />}
                title="Session-wise"
                hint="Each session charged on its own"
                totals={sessions}
                count={sessions.items.length}
                defaultOpen={packages.items.length === 0}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-1.5 pr-2 font-medium">Date</th>
                        <th className="py-1.5 pr-2 font-medium">Session</th>
                        <th className="py-1.5 pr-2 text-right font-medium">Price</th>
                        <th className="py-1.5 pr-2 text-right font-medium">Due</th>
                        <th className="py-1.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.items.map((s) => (
                        <tr key={s.id} className="border-b last:border-0">
                          <td className="whitespace-nowrap py-1.5 pr-2">{format(new Date(s.date), 'dd MMM yyyy')}</td>
                          <td className="py-1.5 pr-2">
                            <span className="block">{s.therapyType || 'Therapy'}</span>
                            <span className="text-muted-foreground">{s.invoiceNo}{s.therapistName ? ` · ${s.therapistName}` : ''}</span>
                          </td>
                          <td className="whitespace-nowrap py-1.5 pr-2 text-right">{inr(s.total)}</td>
                          <td className={`whitespace-nowrap py-1.5 pr-2 text-right ${s.due > 0 ? 'font-semibold text-red-600' : ''}`}>{inr(s.due)}</td>
                          <td className="py-1.5"><PaidBadge paid={s.paid} due={s.due} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {other.items.length > 0 && (
              <Section
                icon={<Receipt className="h-4 w-4" />}
                title="Other charges"
                hint="Services and one-off bills"
                totals={other}
                count={other.items.length}
                defaultOpen={false}
              >
                <div className="space-y-1.5">
                  {other.items.map((o) => (
                    <div key={o.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate">
                        {o.invoiceNo} · {format(new Date(o.date), 'dd MMM yyyy')}
                        {o.notes ? <span className="text-muted-foreground"> · {o.notes}</span> : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span>{inr(o.total)}</span>
                        <PaidBadge paid={o.paid} due={o.due} />
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {grand.due > 0 && (
              <p className="text-xs text-muted-foreground">
                Collect dues from <b>Billing &amp; Invoices</b> — pick this patient and use <b>Pay</b> on any unpaid bill.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
