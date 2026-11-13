'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { LogIn, LogOut, Loader2, CheckCircle2, Clock, CalendarClock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppStore } from '@/store/app-store'
import { authFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import { format } from 'date-fns'

const ALLOWED_ROLES = ['receptionist', 'therapist_speech', 'therapist_ot', 'therapist_behavioral', 'therapist_remedial']

interface AttendanceRecord {
  id: string
  employeeId: string
  date: string
  status: string
  checkIn?: string | null
  checkOut?: string | null
  workingHours?: number | null
}

// Format an ISO timestamp string as "hh:mm AM/PM" in the user's local timezone.
// Falls back to the raw value if it's not a valid date.
function formatTimeDisplay(timeStr: string | null | undefined): string {
  if (!timeStr) return '--:--'
  try {
    const d = new Date(timeStr)
    if (isNaN(d.getTime())) return timeStr
    return format(d, 'hh:mm a')
  } catch {
    return timeStr
  }
}

// Format a number of seconds as HH:MM:SS
function formatHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':')
}

export default function AttendanceCheckCard() {
  const user = useAppStore((s) => s.user)

  const [record, setRecord] = useState<AttendanceRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<'in' | 'out' | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const todayDate = new Date()
  const month = todayDate.getMonth() + 1
  const year = todayDate.getFullYear()

  const fetchToday = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`/api/attendance?month=${month}&year=${year}`)
      if (!res.ok) return
      const data = await res.json()
      const todayStr = format(todayDate, 'yyyy-MM-dd')
      const todayRec: AttendanceRecord | undefined = (data.records || []).find(
        (r: AttendanceRecord) => format(new Date(r.date), 'yyyy-MM-dd') === todayStr,
      )
      setRecord(todayRec || null)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => {
    fetchToday()
  }, [fetchToday])

  // Live timer: starts on check-in, stops/freezes on check-out
  useEffect(() => {
    const checkIn = record?.checkIn || null
    const checkOut = record?.checkOut || null

    // No check-in → no timer
    if (!checkIn) {
      setElapsedSeconds(0)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }

    // Compute baseline elapsed from ISO timestamps
    const computeElapsed = () => {
      const checkInDate = new Date(checkIn)
      if (isNaN(checkInDate.getTime())) return 0

      if (checkOut) {
        // Freeze at (checkOut - checkIn) seconds
        const checkOutDate = new Date(checkOut)
        if (isNaN(checkOutDate.getTime())) return 0
        return Math.max(0, Math.floor((checkOutDate.getTime() - checkInDate.getTime()) / 1000))
      }
      // Running: now - checkIn
      return Math.max(0, Math.floor((Date.now() - checkInDate.getTime()) / 1000))
    }

    setElapsedSeconds(computeElapsed())

    // If checked out → no live interval
    if (checkOut) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }

    timerRef.current = setInterval(() => {
      setElapsedSeconds(computeElapsed())
    }, 1000)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [record?.checkIn, record?.checkOut])

  const handleCheckIn = async () => {
    setSubmitting('in')
    try {
      const res = await authFetch('/api/attendance/check-in', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error || 'Failed to check in')
        return
      }
      toast.success('Checked In Successfully')
      setRecord(data)
    } catch {
      toast.error('Failed to check in')
    } finally {
      setSubmitting(null)
    }
  }

  const handleCheckOut = async () => {
    setSubmitting('out')
    try {
      const res = await authFetch('/api/attendance/check-out', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error || 'Failed to check out')
        return
      }
      toast.success('Checked Out Successfully')
      setRecord(data)
    } catch {
      toast.error('Failed to check out')
    } finally {
      setSubmitting(null)
    }
  }

  // Role gate: only render for allowed roles with employeeId
  if (!user || !ALLOWED_ROLES.includes(user.role) || !user.employeeId) {
    return null
  }

  const isCheckedIn = !!record?.checkIn
  const isCheckedOut = !!record?.checkOut
  const isCompleted = isCheckedIn && isCheckedOut
  const timerRunning = isCheckedIn && !isCheckedOut

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-emerald-600" />
            Today&apos;s Attendance
          </CardTitle>
          {isCompleted ? (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              <CheckCircle2 className="h-3 w-3" /> Completed
            </Badge>
          ) : timerRunning ? (
            <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
              LIVE
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Not checked in
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            {/* Time + working hours grid */}
            <div className="grid grid-cols-3 gap-3">
              {/* Check In */}
              <div className="rounded-xl border bg-blue-50/50 dark:bg-blue-900/10 p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-xs text-blue-700 dark:text-blue-400 font-medium mb-1">
                  <LogIn className="h-3 w-3" /> Check In
                </div>
                <p className="text-lg font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                  {formatTimeDisplay(record?.checkIn)}
                </p>
              </div>

              {/* Working Hours (live) */}
              <div className="rounded-xl border bg-emerald-50/50 dark:bg-emerald-900/10 p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 font-medium mb-1">
                  <Clock className="h-3 w-3" /> Working Hours
                </div>
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {formatHMS(elapsedSeconds)}
                </p>
              </div>

              {/* Check Out */}
              <div className="rounded-xl border bg-purple-50/50 dark:bg-purple-900/10 p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-xs text-purple-700 dark:text-purple-400 font-medium mb-1">
                  <LogOut className="h-3 w-3" /> Check Out
                </div>
                <p className="text-lg font-bold text-purple-700 dark:text-purple-400 tabular-nums">
                  {formatTimeDisplay(record?.checkOut)}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                onClick={handleCheckIn}
                disabled={isCheckedIn || submitting !== null}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {submitting === 'in' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                {submitting === 'in' ? 'Checking in...' : 'Check In'}
              </Button>

              <Button
                type="button"
                onClick={handleCheckOut}
                disabled={!isCheckedIn || isCheckedOut || submitting !== null}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {submitting === 'out' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                {submitting === 'out' ? 'Checking out...' : 'Check Out'}
              </Button>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              {isCompleted
                ? `You worked ${formatHMS(elapsedSeconds)} today. Great job!`
                : timerRunning
                  ? 'Your working hours are being tracked live. Remember to check out before you leave.'
                  : 'Click Check In to start tracking your working hours for today.'}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
