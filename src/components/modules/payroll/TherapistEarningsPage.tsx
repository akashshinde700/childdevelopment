'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Wallet, Lock, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { authFetch } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount)
}

interface TherapistEarningsSummary {
  employeeId: string
  employeeName: string
  sessions: number
  amount: number
  locked: number
  pending: number
}

interface TherapistEarningsDetail {
  employeeId: string
  sessions: number
  amount: number
  locked: number
  pending: number
  breakdown: { serviceType: string; rateType: string; sessions: number; amount: number; avgRate: number }[]
}

export default function TherapistEarningsPage() {
  const { navigate } = useAppStore()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [rows, setRows] = useState<TherapistEarningsSummary[]>([])
  const [loading, setLoading] = useState(true)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailRow, setDetailRow] = useState<TherapistEarningsSummary | null>(null)
  const [detail, setDetail] = useState<TherapistEarningsDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchEarnings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`/api/payroll/earnings?month=${month}&year=${year}`)
      if (res.ok) {
        const json = await res.json()
        setRows(json.employees || [])
      }
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { fetchEarnings() }, [fetchEarnings])

  const openDetail = async (row: TherapistEarningsSummary) => {
    setDetailRow(row)
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const res = await authFetch(`/api/payroll/earnings?month=${month}&year=${year}&employeeId=${row.employeeId}`)
      if (res.ok) setDetail(await res.json())
    } catch { /* silent */ } finally {
      setDetailLoading(false)
    }
  }

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => navigate('payroll')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Therapist Earnings</h1>
          <p className="text-sm text-muted-foreground">Per-session/hybrid earnings accrued as sessions and assessments are completed</p>
        </div>
      </div>

      <div className="flex gap-3">
        <Select value={month.toString()} onValueChange={(v) => setMonth(parseInt(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {months.map((m, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {yearOptions.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            {months[month - 1]} {year}
          </CardTitle>
          <CardDescription>Sessions and assessments completed by therapists on Per Session / Hybrid payment</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No earnings recorded for this month.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Therapist</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.employeeId} className="cursor-pointer" onClick={() => openDetail(row)}>
                    <TableCell className="font-medium">{row.employeeName}</TableCell>
                    <TableCell>{row.sessions}</TableCell>
                    <TableCell>{formatCurrency(row.amount)}</TableCell>
                    <TableCell>
                      {row.pending === 0 ? (
                        <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-200 bg-emerald-50">
                          <Lock className="h-3 w-3" /> Locked
                        </Badge>
                      ) : row.locked === 0 ? (
                        <Badge variant="outline" className="gap-1 text-amber-700 border-amber-200 bg-amber-50">
                          <Clock className="h-3 w-3" /> Pending
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          {row.locked} locked · {row.pending} pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openDetail(row) }}>View</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailRow?.employeeName} — {months[month - 1]} {year}</DialogTitle>
            <DialogDescription>Earnings breakdown by service type</DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="space-y-2"><Skeleton className="h-24 w-full" /></div>
          ) : detail ? (
            <div className="space-y-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.breakdown.map((b) => (
                    <TableRow key={`${b.serviceType}::${b.rateType}`}>
                      <TableCell>{b.serviceType}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {b.rateType === 'PERCENTAGE' ? `${b.avgRate.toFixed(1)}% of collected` : formatCurrency(b.avgRate) + ' / session'}
                      </TableCell>
                      <TableCell>{b.sessions}</TableCell>
                      <TableCell>{formatCurrency(b.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="rounded-lg bg-muted/50 p-3 flex justify-between text-sm">
                <span className="text-muted-foreground">Total ({detail.sessions} sessions)</span>
                <span className="font-bold">{formatCurrency(detail.amount)}</span>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
