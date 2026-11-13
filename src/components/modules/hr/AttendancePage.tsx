'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { format, getDaysInMonth, startOfMonth, endOfMonth, isToday, isSunday, isSameDay } from 'date-fns'
import {
  ChevronLeft, ChevronRight, ChevronDown, CalendarDays, Check, X as XIcon, Clock,
  Users, Loader2, CheckCircle2, XCircle, AlertCircle, Coffee, Pencil,
} from 'lucide-react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useAppStore } from '@/store/app-store'
import { authFetch } from '@/lib/api-client'
// Static import — avoids Turbopack ChunkLoadError on the ESM `xlsx.mjs`
// async chunk that intermittently fails to load.
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { usePrintSettings } from '@/components/print/PrintSettingsDialog'
import { createLetterheadPDF, letterheadMargins, letterheadDidDrawPage } from '@/lib/letterhead-pdf'

interface Employee {
  id: string
  employeeId: string
  name: string
  designation?: string
  department?: string
  status: string
}

interface AttendanceRecord {
  id: string
  employeeId: string
  employee?: { name: string; employeeId: string; designation: string }
  date: string
  status: string
  derivedStatus?: string
  checkIn?: string
  checkOut?: string
  workingHours?: number
  overtime?: number
  notes?: string
}

interface AttendanceMap {
  [key: string]: string // key: "employeeId-date" -> status
}

interface AttendanceRecordMap {
  [key: string]: AttendanceRecord // key: "employeeId-date" -> full record
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; short: string }> = {
  present: { label: 'Present', color: 'text-emerald-700', bg: 'bg-emerald-100 border-emerald-200', short: 'P' },
  absent: { label: 'Absent', color: 'text-red-700', bg: 'bg-red-100 border-red-200', short: 'A' },
  half_day: { label: 'Half Day', color: 'text-yellow-700', bg: 'bg-yellow-100 border-yellow-200', short: 'HD' },
  leave: { label: 'Leave', color: 'text-blue-700', bg: 'bg-blue-100 border-blue-200', short: 'L' },
  holiday: { label: 'Holiday', color: 'text-gray-500', bg: 'bg-gray-100 border-gray-200', short: 'H' },
  incomplete: { label: 'Incomplete', color: 'text-amber-700', bg: 'bg-amber-100 border-amber-200', short: 'I' },
}

const SUMMARY_COLORS: Record<string, string> = {
  present: 'text-emerald-600',
  absent: 'text-red-600',
  half_day: 'text-yellow-600',
  leave: 'text-blue-600',
  holiday: 'text-gray-500',
}

// Attendance.checkIn/checkOut holds either a plain "HH:mm" (manual/admin
// entry via the type="time" inputs below) or a full ISO timestamp (written
// by the self check-in/check-out API — see src/app/api/attendance/check-in).
// Both formatters below need to handle either shape.
function isIsoTimestamp(value: string): boolean {
  return value.includes('T')
}

/** Human-readable display, e.g. "09:05" -> "09:05 AM"; an ISO timestamp is
 * converted to the browser's local time (IST for this app's users) instead
 * of showing the raw UTC string. */
function formatAttendanceTime(value?: string | null): string {
  if (!value) return '-'
  if (isIsoTimestamp(value)) {
    const d = new Date(value)
    return isNaN(d.getTime()) ? value : format(d, 'hh:mm a')
  }
  const [h, m] = value.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return value
  return format(new Date(2000, 0, 1, h, m), 'hh:mm a')
}

/** "HH:mm" for pre-filling a type="time" input — converts an ISO timestamp
 * to local-time HH:mm; passes a plain "HH:mm" value straight through. */
function toTimeInputValue(value?: string | null): string {
  if (!value) return ''
  if (!isIsoTimestamp(value)) return value
  const d = new Date(value)
  return isNaN(d.getTime()) ? '' : format(d, 'HH:mm')
}

export default function AttendancePage() {
  const user = useAppStore((s) => s.user)
  const isSuperAdmin = user?.role === 'super_admin'
  const { choosePrintMode, PrintSettingsDialog } = usePrintSettings()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [employees, setEmployees] = useState<Employee[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [attendanceMap, setAttendanceMap] = useState<AttendanceMap>({})
  const [recordsMap, setRecordsMap] = useState<AttendanceRecordMap>({})

  // Mark attendance dialog
  const [markDialogOpen, setMarkDialogOpen] = useState(false)
  const [markEmployee, setMarkEmployee] = useState<Employee | null>(null)
  const [markDate, setMarkDate] = useState<string>('')
  const [markStatus, setMarkStatus] = useState('present')
  const [markCheckIn, setMarkCheckIn] = useState('')
  const [markCheckOut, setMarkCheckOut] = useState('')
  const [markNotes, setMarkNotes] = useState('')

  // Edit attendance dialog (super_admin only)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editRecord, setEditRecord] = useState<AttendanceRecord | null>(null)
  const [editStatus, setEditStatus] = useState('present')
  const [editCheckIn, setEditCheckIn] = useState('')
  const [editCheckOut, setEditCheckOut] = useState('')
  const [editWorkingHours, setEditWorkingHours] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // Report dialog
  const [reportDialogOpen, setReportDialogOpen] = useState(false)
  const [reportMode, setReportMode] = useState<'monthly' | 'yearly'>('monthly')
  const [reportEmployeeId, setReportEmployeeId] = useState('all')
  const [reportExportType, setReportExportType] = useState<'pdf' | 'excel'>('pdf')
  const [reportYear, setReportYear] = useState(new Date().getFullYear())
  const [reportGenerating, setReportGenerating] = useState(false)

  // Summary stats
  const [summary, setSummary] = useState({ present: 0, absent: 0, halfDay: 0, leave: 0 })

  const month = currentDate.getMonth() + 1
  const year = currentDate.getFullYear()
  const daysInMonth = getDaysInMonth(currentDate)

  // Generate days array
  const days = useMemo(() => {
    const result: Date[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      result.push(new Date(year, currentDate.getMonth(), d))
    }
    return result
  }, [year, currentDate.getMonth(), daysInMonth])

  // Sundays set for quick reference
  const sundays = useMemo(() => {
    const s = new Set<number>()
    days.forEach(d => { if (isSunday(d)) s.add(d.getDate()) })
    return s
  }, [days])

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await authFetch(`/api/employees?limit=1000&status=active`)
      if (res.ok) {
        const data = await res.json()
        setEmployees(data.employees || [])
      }
    } catch { /* silent */ }
  }, [])

  const fetchAttendance = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`/api/attendance?month=${month}&year=${year}`)
      const data = await res.json()
      setRecords(data.records || [])
      setSummary({
        present: data.summary?.present || 0,
        absent: data.summary?.absent || 0,
        halfDay: data.summary?.halfDay || 0,
        leave: data.summary?.leave || 0,
      })

      // Build maps
      const map: AttendanceMap = {}
      const rMap: AttendanceRecordMap = {}
      data.records?.forEach((r: AttendanceRecord) => {
        const dateStr = format(new Date(r.date), 'yyyy-MM-dd')
        map[`${r.employeeId}-${dateStr}`] = r.status
        rMap[`${r.employeeId}-${dateStr}`] = r
      })
      setAttendanceMap(map)
      setRecordsMap(rMap)
    } catch {
      toast.error('Failed to fetch attendance')
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { fetchEmployees() }, [fetchEmployees])
  useEffect(() => { fetchAttendance() }, [fetchAttendance])

  const getStatusForCell = (employeeId: string, day: number) => {
    const dateStr = format(new Date(year, currentDate.getMonth(), day), 'yyyy-MM-dd')
    return attendanceMap[`${employeeId}-${dateStr}`] || ''
  }

  const handleCellClick = (employee: Employee, day: number) => {
    const dateStr = format(new Date(year, currentDate.getMonth(), day), 'yyyy-MM-dd')
    setMarkEmployee(employee)
    setMarkDate(dateStr)
    const current = getStatusForCell(employee.id, day)
    setMarkStatus(current || 'present')
    // Pre-fill check-in/check-out from existing record
    const existingRecord = recordsMap[`${employee.id}-${dateStr}`]
    setMarkCheckIn(toTimeInputValue(existingRecord?.checkIn))
    setMarkCheckOut(toTimeInputValue(existingRecord?.checkOut))
    setMarkNotes(existingRecord?.notes || '')
    setMarkDialogOpen(true)
  }

  // Calculate working hours from check-in and check-out
  const calculateWorkingHours = (checkIn: string, checkOut: string): number | null => {
    if (!checkIn || !checkOut) return null
    const [inH, inM] = checkIn.split(':').map(Number)
    const [outH, outM] = checkOut.split(':').map(Number)
    if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) return null
    const inMinutes = inH * 60 + inM
    const outMinutes = outH * 60 + outM
    const diff = outMinutes - inMinutes
    if (diff <= 0) return null
    return Math.round((diff / 60) * 100) / 100 // Round to 2 decimal places
  }

  const handleMarkAttendance = async () => {
    if (!markEmployee || !markDate) return

    setSaving(true)
    try {
      const workingHours = calculateWorkingHours(markCheckIn, markCheckOut)
      const overtime = workingHours !== null && workingHours > 9 ? Math.round((workingHours - 9) * 100) / 100 : 0

      const res = await authFetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: markEmployee.id,
          date: markDate,
          status: markStatus,
          checkIn: markCheckIn || undefined,
          checkOut: markCheckOut || undefined,
          workingHours: workingHours,
          overtime: overtime > 0 ? overtime : undefined,
          notes: markNotes || undefined,
        }),
      })
      if (!res.ok) throw new Error()

      // Update local map
      setAttendanceMap(prev => ({
        ...prev,
        [`${markEmployee!.id}-${markDate}`]: markStatus,
      }))

      toast.success(`Attendance marked as ${STATUS_CONFIG[markStatus]?.label || markStatus}`)
      setMarkDialogOpen(false)
      fetchAttendance() // Refresh summary
    } catch {
      toast.error('Failed to mark attendance')
    } finally {
      setSaving(false)
    }
  }

  const openEditDialog = (rec: AttendanceRecord) => {
    setEditRecord(rec)
    setEditStatus(rec.status || 'present')
    setEditCheckIn(toTimeInputValue(rec.checkIn))
    setEditCheckOut(toTimeInputValue(rec.checkOut))
    setEditWorkingHours(rec.workingHours !== undefined && rec.workingHours !== null ? String(rec.workingHours) : '')
    setEditNotes(rec.notes || '')
    setEditDialogOpen(true)
  }

  const handleEditSave = async () => {
    if (!editRecord) return
    setEditSaving(true)
    try {
      const payload: Record<string, unknown> = {
        id: editRecord.id,
        status: editStatus,
      }
      if (editCheckIn !== '') payload.checkIn = editCheckIn
      if (editCheckOut !== '') payload.checkOut = editCheckOut
      if (editWorkingHours !== '') payload.workingHours = parseFloat(editWorkingHours) || 0
      if (editNotes !== '') payload.notes = editNotes

      const res = await authFetch('/api/attendance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed')
      }
      toast.success('Attendance updated successfully')
      setEditDialogOpen(false)
      fetchAttendance()
    } catch (err) {
      toast.error((err as Error).message || 'Failed to update attendance')
    } finally {
      setEditSaving(false)
    }
  }

  // Records sorted by date desc (most recent first) — for the records table.
  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [records])

  const getEmployeeSummary = (employee: Employee) => {
    let present = 0, absent = 0, halfDay = 0, leave = 0
    days.forEach(d => {
      const status = getStatusForCell(employee.id, d.getDate())
      if (status === 'present') present++
      else if (status === 'absent') absent++
      else if (status === 'half_day') halfDay++
      else if (status === 'leave') leave++
    })
    return { present, absent, halfDay, leave }
  }

  const workingDaysInMonth = (monthNumber: number, yearNumber: number) => {
    const totalDays = new Date(yearNumber, monthNumber, 0).getDate()
    let count = 0
    for (let day = 1; day <= totalDays; day += 1) {
      if (new Date(yearNumber, monthNumber - 1, day).getDay() !== 0) {
        count += 1
      }
    }
    return count
  }

  const reportEmployees = useMemo(() => {
    if (reportEmployeeId === 'all') return employees
    return employees.filter((emp) => emp.id === reportEmployeeId)
  }, [employees, reportEmployeeId])

  const reportEmployeeName = useMemo(() => {
    if (reportEmployeeId === 'all') return 'All Employees'
    return employees.find((emp) => emp.id === reportEmployeeId)?.name || 'Employee'
  }, [employees, reportEmployeeId])

  const reportEmployeeDetails = useMemo(() => {
    if (reportEmployeeId === 'all') return null
    return employees.find((emp) => emp.id === reportEmployeeId) || null
  }, [employees, reportEmployeeId])

  const fetchAttendanceForReport = async ({ employeeId, month, year }: { employeeId?: string; month?: number; year: number }) => {
    const params = new URLSearchParams({ year: String(year) })
    if (month) params.set('month', String(month))
    if (employeeId && employeeId !== 'all') params.set('employeeId', employeeId)
    const res = await authFetch(`/api/attendance?${params.toString()}`)
    return res.json()
  }

  const getStatusShort = (status: string) => {
    if (!status) return ''
    return STATUS_CONFIG[status]?.short || status.slice(0, 2).toUpperCase()
  }

  const generateMonthlyReport = async (data: { records: AttendanceRecord[] }) => {
    const monthNumber = month
    const yearNumber = year
    const workingDays = workingDaysInMonth(monthNumber, yearNumber)
    const rows = reportEmployees.map((emp) => {
      const employeeRecords = data.records.filter((record) => record.employeeId === emp.id)
      const statusByDay = Object.fromEntries(employeeRecords.map((record) => [format(new Date(record.date), 'd'), record.status]))
      const counts = { present: 0, absent: 0, half_day: 0, leave: 0, holiday: 0 }
      for (let d = 1; d <= daysInMonth; d += 1) {
        const status = statusByDay[String(d)]
        if (status) {
          counts[status as keyof typeof counts] += 1
        }
      }
      const attendancePercent = workingDays > 0 ? ((counts.present + counts.half_day * 0.5) / workingDays) * 100 : 0
      return {
        name: emp.name,
        employeeId: emp.employeeId,
        designation: emp.designation || '',
        department: emp.department || '',
        month: format(currentDate, 'MMMM yyyy'),
        present: counts.present,
        absent: counts.absent,
        halfDay: counts.half_day,
        leave: counts.leave,
        holidays: counts.holiday,
        attendancePercentage: attendancePercent.toFixed(2),
        ...Object.fromEntries(Array.from({ length: daysInMonth }, (_, idx) => {
          const day = idx + 1
          return [`day${day}`, getStatusShort(statusByDay[String(day)] || '')]
        })),
      }
    })
    return { rows, workingDays }
  }

  const generateYearlyReport = async (data: { records: AttendanceRecord[] }) => {
    const yearNumber = reportYear
    const monthSummaries = Array.from({ length: 12 }, (_, idx) => {
      const monthNumber = idx + 1
      const monthRecords = data.records.filter((record) => new Date(record.date).getMonth() + 1 === monthNumber)
      const counts = { present: 0, absent: 0, half_day: 0, leave: 0, holiday: 0 }
      monthRecords.forEach((record) => {
        const status = record.status as keyof typeof counts
        if (counts[status] !== undefined) counts[status] += 1
      })
      const workingDays = workingDaysInMonth(monthNumber, yearNumber) * reportEmployees.length
      const attendancePercent = workingDays > 0 ? ((counts.present + counts.half_day * 0.5) / workingDays) * 100 : 0
      return {
        month: format(new Date(yearNumber, monthNumber - 1, 1), 'MMMM'),
        present: counts.present,
        absent: counts.absent,
        halfDay: counts.half_day,
        leave: counts.leave,
        holidays: counts.holiday,
        attendancePercentage: attendancePercent.toFixed(2),
      }
    })
    const totals = monthSummaries.reduce<{ present: number; absent: number; halfDay: number; leave: number; holidays: number }>((acc, item) => {
      acc.present += item.present
      acc.absent += item.absent
      acc.halfDay += item.halfDay
      acc.leave += item.leave
      acc.holidays += item.holidays
      return acc
    }, { present: 0, absent: 0, halfDay: 0, leave: 0, holidays: 0 })
    const totalWorkingDays = reportEmployees.length * Array.from({ length: 12 }).reduce<number>((acc, _, idx) => acc + workingDaysInMonth(idx + 1, yearNumber), 0)
    const overallPercent = totalWorkingDays > 0 ? ((totals.present + totals.halfDay * 0.5) / totalWorkingDays) * 100 : 0
    return { monthSummaries, totals, overallPercent: overallPercent.toFixed(2) }
  }

  const exportReport = async () => {
    // PDF only: header & footer / letterhead / plain. Excel has no branding.
    const pdfChoice = reportExportType === 'pdf'
      ? await choosePrintMode()
      : { mode: 'plain' as const, branding: {} }
    if (!pdfChoice) return
    setReportGenerating(true)
    try {
      const response = await fetchAttendanceForReport({ employeeId: reportEmployeeId, year: reportMode === 'yearly' ? reportYear : year, month: reportMode === 'monthly' ? month : undefined })
      if (!response.records) throw new Error('No attendance records')
      if (reportMode === 'monthly') {
        const reportData = await generateMonthlyReport(response)
        if (reportExportType === 'pdf') {
          const autoTable = (await import('jspdf-autotable')).default
          const doc = await createLetterheadPDF({ orientation: 'landscape', mode: pdfChoice.mode, branding: pdfChoice.branding })
          doc.setFontSize(14)
          doc.setTextColor(15, 118, 110)
          doc.text('Monthly Attendance Report', doc.contentLeftX, doc.contentTopY - 20)
          doc.setFontSize(9)
          doc.setTextColor(80, 80, 80)
          doc.text(`Period: ${format(currentDate, 'MMMM yyyy')} — Employee: ${reportEmployeeName}`, doc.contentLeftX, doc.contentTopY - 6)
          const head = [
            'Name', 'Employee ID', 'Designation', 'Department', 'Month', 'Present', 'Absent', 'Half Day', 'Leave', 'Holidays', 'Attendance %',
            ...Array.from({ length: daysInMonth }, (_, idx) => String(idx + 1)),
          ]
          const body = reportData.rows.map((row) => [
            row.name, row.employeeId, row.designation, row.department, row.month, row.present, row.absent, row.halfDay, row.leave, row.holidays, row.attendancePercentage,
            ...Array.from({ length: daysInMonth }, (_, idx) => row[`day${idx + 1}`] || ''),
          ])
          autoTable(doc, {
            head: [head], body,
            startY: doc.contentTopY,
            styles: { fontSize: 7 },
            headStyles: { fillColor: [15, 118, 110], textColor: 255 },
            margin: letterheadMargins(doc),
            didDrawPage: letterheadDidDrawPage(doc),
          })
          doc.save(`Attendance_Report_${format(currentDate, 'MMMM_yyyy')}.pdf`)
        } else {
          const headers = ['Name', 'Employee ID', 'Designation', 'Department', 'Month', 'Present', 'Absent', 'Half Day', 'Leave', 'Holidays', 'Attendance %', ...Array.from({ length: daysInMonth }, (_, idx) => `Day ${idx + 1}`)]
          const wsData = [headers, ...reportData.rows.map((row) => [
            row.name, row.employeeId, row.designation, row.department, row.month, row.present, row.absent, row.halfDay, row.leave, row.holidays, row.attendancePercentage,
            ...Array.from({ length: daysInMonth }, (_, idx) => row[`day${idx + 1}`] || ''),
          ])]
          const ws = XLSX.utils.aoa_to_sheet(wsData)
          const wb = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(wb, ws, 'Monthly Report')
          XLSX.writeFile(wb, `Attendance_Report_${format(currentDate, 'MMMM_yyyy')}.xlsx`)
        }
      } else {
        const reportData = await generateYearlyReport(response)
        if (reportExportType === 'pdf') {
          const autoTable = (await import('jspdf-autotable')).default
          const doc = await createLetterheadPDF({ orientation: 'landscape', mode: pdfChoice.mode, branding: pdfChoice.branding })
          doc.setFontSize(14)
          doc.setTextColor(15, 118, 110)
          doc.text('Yearly Attendance Report', doc.contentLeftX, doc.contentTopY - 20)
          doc.setFontSize(9)
          doc.setTextColor(80, 80, 80)
          doc.text(`Year: ${reportYear} — Employee: ${reportEmployeeName}`, doc.contentLeftX, doc.contentTopY - 6)
          const head = ['Month', 'Present', 'Absent', 'Half Day', 'Leave', 'Holidays', 'Attendance %']
          const body = reportData.monthSummaries.map((row) => [row.month, row.present, row.absent, row.halfDay, row.leave, row.holidays, row.attendancePercentage])
          body.push(['Total', reportData.totals.present, reportData.totals.absent, reportData.totals.halfDay, reportData.totals.leave, reportData.totals.holidays, reportData.overallPercent])
          autoTable(doc, {
            head: [head], body,
            startY: doc.contentTopY,
            styles: { fontSize: 10 },
            headStyles: { fillColor: [15, 118, 110], textColor: 255 },
            margin: letterheadMargins(doc),
            didDrawPage: letterheadDidDrawPage(doc),
          })
          doc.save(`Attendance_Yearly_Report_${reportYear}.pdf`)
        } else {
          const headers = ['Month', 'Present', 'Absent', 'Half Day', 'Leave', 'Holidays', 'Attendance %']
          const wsData = [headers, ...reportData.monthSummaries.map((row) => [row.month, row.present, row.absent, row.halfDay, row.leave, row.holidays, row.attendancePercentage]), ['Total', reportData.totals.present, reportData.totals.absent, reportData.totals.halfDay, reportData.totals.leave, reportData.totals.holidays, reportData.overallPercent]]
          const ws = XLSX.utils.aoa_to_sheet(wsData)
          const wb = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(wb, ws, 'Yearly Report')
          XLSX.writeFile(wb, `Attendance_Yearly_Report_${reportYear}.xlsx`)
        }
      }
      setReportDialogOpen(false)
    } catch (err) {
      toast.error('Failed to generate report')
    } finally {
      setReportGenerating(false)
    }
  }

  const reportYears = useMemo(() => {
    const current = new Date().getFullYear()
    return Array.from({ length: 6 }, (_, idx) => current - idx)
  }, [])

  const reportEmployeeOptions = useMemo(() => [
    { id: 'all', label: 'All Employees' },
    ...employees.map((emp) => ({ id: emp.id, label: `${emp.name} (${emp.employeeId})` })),
  ], [employees])

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, currentDate.getMonth() - 1, 1))
  }

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, currentDate.getMonth() + 1, 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  // Get unique status options
  const statusOptions = Object.entries(STATUS_CONFIG).map(([key, val]) => ({
    value: key,
    label: val.label,
    short: val.short,
  }))

  return (
    <div className="space-y-6">
      {PrintSettingsDialog}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attendance</h1>
          <p className="text-muted-foreground text-sm">Mark and track employee attendance</p>
        </div>
      </div>

      {/* Month Navigation & Summary Cards */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPrevMonth}>
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex items-center gap-2 min-w-[200px] justify-center">
            <CalendarDays className="size-5 text-primary" />
            <span className="text-lg font-semibold capitalize">
              {format(currentDate, 'MMMM yyyy')}
            </span>
          </div>
          <Button variant="outline" size="icon" onClick={goToNextMonth}>
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <Button variant="secondary" onClick={() => setReportDialogOpen(true)} className="gap-2">
            Generate Report <ChevronDown className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm">
            <div className="h-3 w-3 rounded bg-emerald-500" />
            <span>P: {summary.present}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <div className="h-3 w-3 rounded bg-red-500" />
            <span>A: {summary.absent}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <div className="h-3 w-3 rounded bg-yellow-500" />
            <span>HD: {summary.halfDay}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <div className="h-3 w-3 rounded bg-blue-500" />
            <span>L: {summary.leave}</span>
          </div>
        </div>
      </div>

      {/* Attendance Grid */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-6 space-y-3">
                <Skeleton className="h-8 w-full" />
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : employees.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Users className="size-12 mx-auto mb-3 opacity-40" />
                <p>No active employees found</p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 sticky top-0 z-10">
                    <th className="sticky left-0 bg-muted/50 z-20 text-left px-3 py-2 font-semibold border-b min-w-[160px]">
                      Employee
                    </th>
                    {days.map(d => (
                      <th
                        key={d.getDate()}
                        className={`px-1 py-2 font-medium text-center border-b min-w-[32px] ${
                          isToday(d) ? 'bg-primary/10 text-primary' :
                          isSunday(d) ? 'bg-gray-50 text-gray-400' : ''
                        }`}
                      >
                        <div className="text-[10px] leading-tight">{format(d, 'EEE')}</div>
                        <div className={`text-sm font-semibold leading-tight ${isToday(d) ? 'text-primary' : ''}`}>
                          {d.getDate()}
                        </div>
                      </th>
                    ))}
                    <th className="px-2 py-2 font-semibold text-center border-b min-w-[120px]">
                      Summary
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp, empIdx) => {
                    const empSummary = getEmployeeSummary(emp)
                    return (
                      <tr key={emp.id} className={`border-b hover:bg-muted/30 ${empIdx % 2 === 0 ? '' : 'bg-muted/10'}`}>
                        <td className="sticky left-0 bg-background z-10 px-3 py-2 border-r">
                          <div className="font-medium text-xs">{emp.name}</div>
                          <div className="text-[10px] text-muted-foreground">{emp.employeeId} {emp.designation ? `· ${emp.designation}` : ''}</div>
                        </td>
                        {days.map(d => {
                          const status = getStatusForCell(emp.id, d.getDate())
                          const config = status ? STATUS_CONFIG[status] : null
                          const isSundayDay = isSunday(d)
                          return (
                            <td
                              key={d.getDate()}
                              className={`px-1 py-1 text-center cursor-pointer transition-colors hover:bg-primary/10 ${
                                isToday(d) ? 'bg-primary/5' :
                                isSundayDay ? 'bg-gray-50' : ''
                              }`}
                              onClick={() => handleCellClick(emp, d.getDate())}
                            >
                              <div
                                className={`inline-flex items-center justify-center h-7 w-7 rounded text-[10px] font-bold border ${
                                  config ? config.bg + ' ' + config.color :
                                  isSundayDay ? 'border-gray-200 text-gray-400' :
                                  'border-dashed border-gray-300 text-gray-500'
                                }`}
                                title={config ? config.label : isSundayDay ? 'Sunday' : 'Not marked'}
                              >
                                {config ? config.short : isSundayDay ? 'H' : ''}
                              </div>
                            </td>
                          )
                        })}
                        <td className="px-2 py-2 border-l">
                          <div className="flex items-center justify-center gap-2 text-[10px]">
                            <span className={SUMMARY_COLORS.present}>{empSummary.present}</span>
                            <span className="text-gray-400">|</span>
                            <span className={SUMMARY_COLORS.absent}>{empSummary.absent}</span>
                            <span className="text-gray-400">|</span>
                            <span className={SUMMARY_COLORS.half_day}>{empSummary.halfDay}</span>
                            <span className="text-gray-400">|</span>
                            <span className={SUMMARY_COLORS.leave}>{empSummary.leave}</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-medium text-muted-foreground">Legend:</span>
            {statusOptions.map(opt => (
              <div key={opt.value} className="flex items-center gap-1.5">
                <div className={`h-5 w-5 rounded text-[10px] font-bold flex items-center justify-center border ${STATUS_CONFIG[opt.value].bg} ${STATUS_CONFIG[opt.value].color}`}>
                  {opt.short}
                </div>
                <span>{opt.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <div className="h-5 w-5 rounded border border-dashed border-gray-300 text-gray-500 flex items-center justify-center text-[10px]">-</div>
              <span>Not Marked</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Click on any cell to mark attendance for that employee and date.</p>
        </CardContent>
      </Card>

      {/* Attendance Records Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attendance Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sortedRecords.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="size-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No attendance records found for this period.</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Check In</TableHead>
                    <TableHead>Check Out</TableHead>
                    <TableHead className="text-right">Working Hours</TableHead>
                    {isSuperAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRecords.map((rec) => {
                    const ds = rec.derivedStatus || rec.status
                    const cfg = STATUS_CONFIG[ds] || STATUS_CONFIG[rec.status]
                    return (
                      <TableRow key={rec.id}>
                        <TableCell>
                          <div className="font-medium text-sm">{rec.employee?.name || rec.employeeId}</div>
                          <div className="text-xs text-muted-foreground">{rec.employee?.employeeId || rec.employeeId}</div>
                        </TableCell>
                        <TableCell className="text-sm">{format(new Date(rec.date), 'dd MMM yyyy')}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${cfg?.bg || ''} ${cfg?.color || ''}`}>
                            {cfg?.label || ds}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">{formatAttendanceTime(rec.checkIn)}</TableCell>
                        <TableCell className="text-sm tabular-nums">{formatAttendanceTime(rec.checkOut)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {rec.workingHours !== undefined && rec.workingHours !== null ? `${rec.workingHours} hrs` : '-'}
                        </TableCell>
                        {isSuperAdmin && (
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditDialog(rec)}
                              title="Edit attendance"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate Attendance Report</DialogTitle>
            <DialogDescription>Choose report scope, employee, and export format.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Report Type</Label>
                <Select value={reportMode} onValueChange={(v) => setReportMode(v as 'monthly' | 'yearly')}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Export Format</Label>
                <Select value={reportExportType} onValueChange={(v) => setReportExportType(v as 'pdf' | 'excel')}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="excel">Excel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Employee</Label>
                <Select value={reportEmployeeId} onValueChange={setReportEmployeeId}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {reportEmployeeOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {reportMode === 'yearly' && (
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Select value={String(reportYear)} onValueChange={(v) => setReportYear(Number(v))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {reportYears.map((yearOption) => (
                        <SelectItem key={yearOption} value={String(yearOption)}>{yearOption}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {reportMode === 'monthly' && (
                <div className="space-y-2">
                  <Label>Month</Label>
                  <div className="rounded-md border border-input px-3 py-2 text-sm text-muted-foreground">{format(currentDate, 'MMMM yyyy')}</div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportDialogOpen(false)}>Cancel</Button>
            <Button onClick={exportReport} disabled={reportGenerating} className="gap-2">
              {reportGenerating ? <Loader2 className="size-4 animate-spin" /> : <Clock className="size-4" />}
              {reportGenerating ? 'Generating...' : 'Generate Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Attendance Dialog */}
      <Dialog open={markDialogOpen} onOpenChange={setMarkDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Mark Attendance</DialogTitle>
            <DialogDescription>
              {markEmployee?.name} — {markDate ? format(new Date(markDate + 'T00:00:00'), 'dd MMM yyyy (EEE)') : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Attendance Status</Label>
              <Select value={markStatus} onValueChange={setMarkStatus}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <div className={`h-5 w-5 rounded text-[10px] font-bold flex items-center justify-center border ${STATUS_CONFIG[opt.value].bg} ${STATUS_CONFIG[opt.value].color}`}>
                          {opt.short}
                        </div>
                        <span>{opt.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Check-in / Check-out (always visible, optional) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  Check-In Time
                  <span className="text-[10px] font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  type="time"
                  value={markCheckIn}
                  onChange={(e) => setMarkCheckIn(e.target.value)}
                  placeholder="09:00"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  Check-Out Time
                  <span className="text-[10px] font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  type="time"
                  value={markCheckOut}
                  onChange={(e) => setMarkCheckOut(e.target.value)}
                  placeholder="18:00"
                />
              </div>
            </div>

            {/* Working Hours Display */}
            {markCheckIn && markCheckOut && calculateWorkingHours(markCheckIn, markCheckOut) !== null && (
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Working Hours</span>
                <span className="font-semibold">{calculateWorkingHours(markCheckIn, markCheckOut)} hrs</span>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={markNotes}
                onChange={(e) => setMarkNotes(e.target.value)}
                placeholder="Optional notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleMarkAttendance} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {saving ? 'Saving...' : 'Mark Attendance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Attendance Dialog (super_admin only) */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Attendance</DialogTitle>
            <DialogDescription>
              {editRecord?.employee?.name || editRecord?.employeeId} — {editRecord?.date ? format(new Date(editRecord.date), 'dd MMM yyyy') : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Attendance Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <div className={`h-5 w-5 rounded text-[10px] font-bold flex items-center justify-center border ${STATUS_CONFIG[opt.value].bg} ${STATUS_CONFIG[opt.value].color}`}>
                          {opt.short}
                        </div>
                        <span>{opt.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  Check-In
                </Label>
                <Input
                  type="time"
                  value={editCheckIn}
                  onChange={(e) => setEditCheckIn(e.target.value)}
                  placeholder="09:00"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  Check-Out
                </Label>
                <Input
                  type="time"
                  value={editCheckOut}
                  onChange={(e) => setEditCheckOut(e.target.value)}
                  placeholder="18:00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Working Hours</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={editWorkingHours}
                onChange={(e) => setEditWorkingHours(e.target.value)}
                placeholder="9.00"
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Optional notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editSaving} className="gap-2">
              {editSaving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {editSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
