'use client'

import { useState } from 'react'
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type DashboardPeriod =
  | { mode: 'single'; date: string }
  | { mode: 'range'; from: string; to: string }

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

function quickFilters(today: Date) {
  const lastMonthStart = startOfMonth(subMonths(today, 1))
  const lastMonthEnd = endOfMonth(subMonths(today, 1))
  return [
    { key: 'today', label: 'Today', period: { mode: 'single', date: iso(today) } as DashboardPeriod },
    { key: 'yesterday', label: 'Yesterday', period: { mode: 'single', date: iso(subDays(today, 1)) } as DashboardPeriod },
    { key: 'last7', label: 'Last 7 Days', period: { mode: 'range', from: iso(subDays(today, 6)), to: iso(today) } as DashboardPeriod },
    { key: 'last30', label: 'Last 30 Days', period: { mode: 'range', from: iso(subDays(today, 29)), to: iso(today) } as DashboardPeriod },
    { key: 'thisMonth', label: 'This Month', period: { mode: 'range', from: iso(startOfMonth(today)), to: iso(today) } as DashboardPeriod },
    { key: 'lastMonth', label: 'Last Month', period: { mode: 'range', from: iso(lastMonthStart), to: iso(lastMonthEnd) } as DashboardPeriod },
  ]
}

/** Matches a period back to a quick-filter key, for highlighting the active one — '' if it's a custom pick. */
function matchQuickFilter(period: DashboardPeriod, today: Date): string {
  for (const f of quickFilters(today)) {
    if (f.period.mode !== period.mode) continue
    if (period.mode === 'single' && f.period.mode === 'single' && f.period.date === period.date) return f.key
    if (period.mode === 'range' && f.period.mode === 'range' && f.period.from === period.from && f.period.to === period.to) return f.key
  }
  return ''
}

function periodLabel(period: DashboardPeriod, today: Date): string {
  if (period.mode === 'single') {
    if (period.date === iso(today)) return `Today, ${format(today, 'dd MMM yyyy')}`
    return format(new Date(`${period.date}T00:00:00`), 'dd MMM yyyy, EEEE')
  }
  const active = matchQuickFilter(period, today)
  const prefix = active === 'last7' ? 'Last 7 Days — '
    : active === 'last30' ? 'Last 30 Days — '
    : active === 'thisMonth' ? 'This Month — '
    : active === 'lastMonth' ? 'Last Month — '
    : ''
  return `${prefix}${format(new Date(`${period.from}T00:00:00`), 'dd MMM')} – ${format(new Date(`${period.to}T00:00:00`), 'dd MMM yyyy')}`
}

export function DashboardDateFilter({
  period,
  onChange,
}: {
  period: DashboardPeriod
  onChange: (next: DashboardPeriod) => void
}) {
  const today = new Date()
  const [open, setOpen] = useState(false)
  // Only relevant while the Custom Range calendar is open, before both ends are picked.
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined)
  const [pickingCustom, setPickingCustom] = useState(false)

  const activeKey = matchQuickFilter(period, today)

  const selectSingleDay = (d: Date | undefined) => {
    if (!d) return
    onChange({ mode: 'single', date: iso(d) })
    setPickingCustom(false)
    setOpen(false)
  }

  const selectCustomRange = (range: { from?: Date; to?: Date } | undefined) => {
    setCustomFrom(range?.from)
    if (range?.from && range?.to) {
      onChange({ mode: 'range', from: iso(range.from), to: iso(range.to) })
      setPickingCustom(false)
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPickingCustom(false) }}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-gray-200 shadow-sm text-sm text-gray-700 hover:bg-gray-50 transition-colors self-end">
          <CalendarDays className="h-3.5 w-3.5 text-[#0F7A87]" />
          <span className="font-medium">{periodLabel(period, today)}</span>
          <ChevronDown className="h-3 w-3 text-gray-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex">
          <div className="flex flex-col gap-0.5 border-r border-gray-100 p-2 w-40">
            {quickFilters(today).map((f) => (
              <button
                key={f.key}
                onClick={() => { onChange(f.period); setPickingCustom(false); setOpen(false) }}
                className={cn(
                  'text-left text-sm px-2.5 py-1.5 rounded-lg transition-colors',
                  activeKey === f.key && !pickingCustom ? 'bg-[#0F7A87]/10 text-[#0F7A87] font-semibold' : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                {f.label}
              </button>
            ))}
            <div className="my-1 border-t border-gray-100" />
            <button
              onClick={() => { setPickingCustom(true); setCustomFrom(undefined) }}
              className={cn(
                'text-left text-sm px-2.5 py-1.5 rounded-lg transition-colors',
                pickingCustom ? 'bg-[#0F7A87]/10 text-[#0F7A87] font-semibold' : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              Custom Range
            </button>
          </div>
          <div className="p-1">
            {pickingCustom ? (
              <>
                <Calendar
                  mode="range"
                  selected={customFrom ? { from: customFrom, to: undefined } : undefined}
                  onSelect={selectCustomRange}
                  numberOfMonths={2}
                  disabled={{ after: today }}
                  initialFocus
                />
                <p className="px-3 pb-2 text-[11px] text-gray-400">Pick a start date, then an end date.</p>
              </>
            ) : (
              <Calendar
                mode="single"
                selected={period.mode === 'single' ? new Date(`${period.date}T00:00:00`) : undefined}
                onSelect={selectSingleDay}
                disabled={{ after: today }}
                initialFocus
              />
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default DashboardDateFilter
