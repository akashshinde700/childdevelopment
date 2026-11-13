'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { CircleDollarSign, Clock3, Download, Loader2, Printer, RefreshCw, Search, Trash2, Users, X } from 'lucide-react'
import { useAppStore, canViewPatientContact } from '@/store/app-store'
import { authFetch } from '@/lib/api-client'
import { getPaymentStatus as getPaymentStatusLabel } from '@/lib/payment-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '@/components/ui/pagination'
import { buildPatientHistoryReportHTML, type PatientHistoryReportData } from '@/components/print/patient-history-report'
import { usePrintSettings } from '@/components/print/PrintSettingsDialog'
import { buildDocumentHTML, deliverDocument, escapeHTML as esc } from '@/components/print/DocumentLayout'
import { toast } from 'sonner'

interface PatientRecord {
  id: string
  patientId: string
  childName: string
  fatherName?: string
  motherName?: string
  mobile?: string
  dateOfBirth?: string
  gender?: string
  diagnosis?: string
  status?: string
}

interface PatientSummary {
  totalPackageAmount: number
  totalDiscount: number
  totalAmountPaid: number
  pendingAmount: number
  sessionsRemaining: number
  totalSessionsCompleted: number
  totalSessionsPurchased: number
  lastVisit?: string
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function getPaymentStatus(summary?: PatientSummary) {
  if (!summary) return { label: 'Loading', variant: 'secondary' }
  // Use shared logic: never show "Paid" when no package/invoice exists
  const hasPackages = (summary.totalPackageAmount ?? 0) > 0
  const hasInvoices = (summary.totalPackageAmount ?? 0) > 0 || (summary.totalAmountPaid ?? 0) > 0
  const status = getPaymentStatusLabel({
    totalPackageAmount: summary.totalPackageAmount ?? 0,
    totalAmountPaid: summary.totalAmountPaid ?? 0,
    pendingAmount: summary.pendingAmount ?? 0,
    hasInvoices,
    hasPackages,
  })
  const variant = status === 'Paid' ? 'success'
    : status === 'Pending' ? 'warning'
    : status === 'Overdue' ? 'destructive'
    : status === 'Partially Paid' ? 'default'
    : 'secondary'
  return { label: status, variant }
}

export default function PatientHistoryPage() {
  const { searchQuery: globalSearchQuery, setSearchQuery: setGlobalSearchQuery } = useAppStore()
  const { user } = useAppStore()
  const canSeeMobile = canViewPatientContact(user?.role)
  const canManagePatients = user?.role === 'super_admin' || user?.role === 'admin'
  const [patients, setPatients] = useState<PatientRecord[]>([])
  const { choosePrintMode, PrintSettingsDialog } = usePrintSettings()
  const [letterheadUrl, setLetterheadUrl] = useState<string | null>(null)
  useEffect(() => {
    authFetch('/api/settings/branding').then((r) => (r.ok ? r.json() : null)).then((b) => { if (b?.letterhead) setLetterheadUrl(b.letterhead) }).catch(() => {})
  }, [])
  const [summaries, setSummaries] = useState<Record<string, PatientSummary>>({})
  const { query: searchQuery, debouncedQuery: debouncedSearchQuery, setQuery: setSearchQuery, isDebouncing, clear: clearSearch } = useDebouncedSearch(globalSearchQuery)
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const pageSize = 10
  const [deleteTarget, setDeleteTarget] = useState<PatientRecord | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletionReason, setDeletionReason] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Clear the global search query once consumed as this page's initial search
  useEffect(() => {
    if (globalSearchQuery) setGlobalSearchQuery('')
  }, [])

  useEffect(() => {
    const fetchPatients = async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams({ limit: '100' })
        if (debouncedSearchQuery) params.set('search', debouncedSearchQuery)
        const response = await authFetch(`/api/patients?${params.toString()}`)
        const data = await response.json()
        setPatients(data.patients ?? [])
      } catch (error) {
        setPatients([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchPatients()
  }, [debouncedSearchQuery])

  useEffect(() => {
    if (patients.length === 0) return

    const controller = new AbortController()
    const fetchSummaries = async () => {
      const map: Record<string, PatientSummary> = {}
      await Promise.all(
        patients.map(async (patient) => {
          try {
            const response = await authFetch(`/api/patients/${patient.id}`, { signal: controller.signal })
            const detail = await response.json()
            if (response.ok && detail?.summary) {
              map[patient.id] = {
                totalPackageAmount: detail.summary.totalPackageAmount ?? 0,
                totalDiscount: detail.summary.totalDiscount ?? 0,
                totalAmountPaid: detail.summary.totalAmountPaid ?? 0,
                pendingAmount: detail.summary.pendingAmount ?? 0,
                sessionsRemaining: detail.summary.sessionsRemaining ?? 0,
                totalSessionsCompleted: detail.summary.totalSessionsCompleted ?? 0,
                totalSessionsPurchased: detail.summary.totalSessionsPurchased ?? 0,
                lastVisit: detail.summary.lastAppointment?.date,
              }
            }
          } catch {
            // ignore individual failures
          }
        })
      )
      setSummaries(map)
    }

    fetchSummaries()
    return () => controller.abort()
  }, [patients])

  const filteredPatients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return patients
    return patients.filter((patient) => {
      return [patient.childName, patient.patientId, patient.mobile, patient.fatherName, patient.motherName]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query))
    })
  }, [patients, searchQuery])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredPatients.length / pageSize)), [filteredPatients.length])

  const summaryMetrics = useMemo(() => {
    const totalOutstanding = filteredPatients.reduce((sum, patient) => sum + (summaries[patient.id]?.pendingAmount ?? 0), 0)
    const patientsWithVisits = filteredPatients.filter((patient) => summaries[patient.id]?.lastVisit).length
    const pendingPatients = filteredPatients.filter((patient) => (summaries[patient.id]?.pendingAmount ?? 0) > 0).length

    return {
      totalPatients: filteredPatients.length,
      totalOutstanding,
      patientsWithVisits,
      pendingPatients,
    }
  }, [filteredPatients, summaries])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const paginatedPatients = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredPatients.slice(startIndex, startIndex + pageSize)
  }, [filteredPatients, currentPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  const handleDeleteClick = (patient: PatientRecord) => {
    setDeleteTarget(patient)
    setDeletionReason('')
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !deletionReason.trim()) return
    setDeleting(true)
    try {
      const res = await authFetch(`/api/patients?id=${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: deletionReason.trim() }),
      })
      if (res.ok) {
        toast.success(`${deleteTarget.childName} and all related records have been removed.`)
        setPatients((prev) => prev.filter((p) => p.id !== deleteTarget.id))
      } else {
        const data = await res.json().catch(() => null)
        toast.error(data?.error || 'Failed to delete patient. Please try again.')
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
      setDeleteTarget(null)
      setDeletionReason('')
    }
  }

  const handleExportExcel = async () => {
    const headers = [
      'Patient ID', 'Patient Name', 'Parent Name', 'Mobile', 'Diagnosis',
      'Total Package', 'Discount', 'Total Paid', 'Outstanding', 'Payment Status', 'Last Visit',
    ]
    const rows = filteredPatients.map((patient) => {
      const summary = summaries[patient.id]
      return [
        patient.patientId,
        patient.childName,
        patient.fatherName || patient.motherName || 'N/A',
        canSeeMobile ? (patient.mobile || 'N/A') : '—',
        patient.diagnosis || 'N/A',
        summary ? summary.totalPackageAmount : 'N/A',
        summary ? summary.totalDiscount : 'N/A',
        summary ? summary.totalAmountPaid : 'N/A',
        summary ? summary.pendingAmount : 'N/A',
        summary ? getPaymentStatusLabel({
          totalPackageAmount: summary.totalPackageAmount ?? 0,
          totalAmountPaid: summary.totalAmountPaid ?? 0,
          pendingAmount: summary.pendingAmount ?? 0,
          hasPackages: (summary.totalPackageAmount ?? 0) > 0,
          hasInvoices: (summary.totalPackageAmount ?? 0) > 0 || (summary.totalAmountPaid ?? 0) > 0,
        }) : 'N/A',
        summary?.lastVisit ? format(new Date(summary.lastVisit), 'dd MMM yyyy') : 'N/A',
      ]
    })

    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = [
      { wch: 12 }, { wch: 22 }, { wch: 20 }, { wch: 14 }, { wch: 20 },
      { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 14 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Patient History')
    XLSX.writeFile(wb, `Patient_History_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
  }

  // Print the patient list as a real document. It used to call
  // window.print() on the page itself, but the global print stylesheet
  // (styles/print.css) hides everything outside a .doc-layout, so the page
  // came out completely blank. Building it like every other print also gives
  // the clinic's header/footer and the Save PDF / WhatsApp options.
  const handlePrintList = async () => {
    if (filteredPatients.length === 0) {
      toast.error('No patients to print')
      return
    }
    const choice = await choosePrintMode()
    if (!choice) return

    const inr = (n: number | undefined) => `₹${new Intl.NumberFormat('en-IN').format(n ?? 0)}`
    let totalPaid = 0
    let totalDue = 0
    const rows = filteredPatients.map((patient, i) => {
      const summary = summaries[patient.id]
      totalPaid += summary?.totalAmountPaid ?? 0
      totalDue += summary?.pendingAmount ?? 0
      const status = summary ? getPaymentStatusLabel({
        totalPackageAmount: summary.totalPackageAmount ?? 0,
        totalAmountPaid: summary.totalAmountPaid ?? 0,
        pendingAmount: summary.pendingAmount ?? 0,
        hasPackages: (summary.totalPackageAmount ?? 0) > 0,
        hasInvoices: (summary.totalPackageAmount ?? 0) > 0 || (summary.totalAmountPaid ?? 0) > 0,
      }) : '—'
      return `<tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${esc(patient.patientId)}</td>
        <td>${esc(patient.childName)}</td>
        <td>${esc(patient.fatherName || patient.motherName || '—')}</td>
        ${canSeeMobile ? `<td>${esc(patient.mobile || '—')}</td>` : ''}
        <td style="text-align:right">${summary ? inr(summary.totalPackageAmount) : '—'}</td>
        <td style="text-align:right">${summary ? inr(summary.totalAmountPaid) : '—'}</td>
        <td style="text-align:right">${summary ? inr(summary.pendingAmount) : '—'}</td>
        <td>${esc(status)}</td>
        <td style="white-space:nowrap">${summary?.lastVisit ? format(new Date(summary.lastVisit), 'dd MMM yyyy') : '—'}</td>
      </tr>`
    }).join('')

    const bodyHTML = `
      <table>
        <thead><tr>
          <th style="width:4%">#</th><th>Patient ID</th><th>Name</th><th>Parent</th>
          ${canSeeMobile ? '<th>Mobile</th>' : ''}
          <th style="text-align:right">Package</th><th style="text-align:right">Paid</th>
          <th style="text-align:right">Outstanding</th><th>Status</th><th>Last Visit</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="${canSeeMobile ? 6 : 5}" style="text-align:right">Total (${filteredPatients.length} patients)</td>
          <td style="text-align:right">${inr(totalPaid)}</td>
          <td style="text-align:right">${inr(totalDue)}</td>
          <td colspan="2"></td>
        </tr></tfoot>
      </table>`

    const html = buildDocumentHTML({
      title: 'Patient History',
      subtitle: `${filteredPatients.length} patients · Printed ${format(new Date(), 'dd MMM yyyy')}`,
      bodyHTML,
      extraCSS: '.doc-content table { font-size: 10.5px; } .doc-content th, .doc-content td { padding: 4px 6px; }',
      windowTitle: 'Patient History',
      autoPrint: false,
      mode: choice.mode,
      branding: choice.branding,
    })
    await deliverDocument(html, choice.output, {
      fileName: `Patient History ${format(new Date(), 'yyyy-MM-dd')}`,
      shareTitle: 'Patient History',
      shareText: `Patient history — ${filteredPatients.length} patients`,
    })
  }

  // Letterhead print CSS – added to <head> when component mounts
  useEffect(() => {
    const styleId = 'ph-letterhead-print-css'
    if (document.getElementById(styleId)) return
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      @page { size: A4; margin: 0; }
      @media print {
        .letterhead-img-bg {
          display: none !important;
        }
        .no-print { display: none !important; }
        .print-content-with-letterhead {
          position: relative;
          padding: 20px 30px 20px 30px;
          background: #fff;
        }
      }
      @media screen {
        .letterhead-img-bg { display: none; }
      }
    `
    document.head.appendChild(style)
    return () => { document.getElementById(styleId)?.remove() }
  }, [])

  const handleExportPatientExcel = async (patient: PatientRecord) => {
    const summary = summaries[patient.id]
    const parentDisplay = patient.fatherName || patient.motherName || 'N/A'
    const paymentStatus = summary
      ? getPaymentStatusLabel({
          totalPackageAmount: summary.totalPackageAmount ?? 0,
          totalAmountPaid: summary.totalAmountPaid ?? 0,
          pendingAmount: summary.pendingAmount ?? 0,
          hasPackages: (summary.totalPackageAmount ?? 0) > 0,
          hasInvoices: (summary.totalPackageAmount ?? 0) > 0 || (summary.totalAmountPaid ?? 0) > 0,
        })
      : 'N/A'

    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([
      ['Field', 'Value'],
      ['Patient ID', patient.patientId],
      ['Patient Name', patient.childName],
      ['Parent', parentDisplay],
      ['Mobile', canSeeMobile ? (patient.mobile || 'N/A') : '—'],
      ['Diagnosis', patient.diagnosis || 'N/A'],
      ['Total Package', summary ? summary.totalPackageAmount : 'N/A'],
      ['Discount', summary ? summary.totalDiscount : 'N/A'],
      ['Total Paid', summary ? summary.totalAmountPaid : 'N/A'],
      ['Outstanding', summary ? summary.pendingAmount : 'N/A'],
      ['Payment Status', paymentStatus],
      ['Last Visit', summary?.lastVisit ? format(new Date(summary.lastVisit), 'dd MMM yyyy') : 'N/A'],
    ])
    ws['!cols'] = [{ wch: 18 }, { wch: 28 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Patient History')
    XLSX.writeFile(wb, `${patient.patientId}-history.xlsx`)
  }

  const handlePrintPatient = async (patient: PatientRecord) => {
    // Header & footer / letterhead / plain — asked first, and the chosen
    // branding comes back with the answer (fetched fresh per print).
    const choice = await choosePrintMode()
    if (!choice) return

    // Reuse the same rich "PATIENT HISTORY REPORT" used on the patient
    // detail page — fetch the full detail payload (packages, appointments,
    // sessions, payments) rather than just the lightweight list summary.
    let data: PatientHistoryReportData
    try {
      const [res, usersRes] = await Promise.all([
        authFetch(`/api/patients/${patient.id}`),
        authFetch('/api/users'),
      ])
      if (!res.ok) throw new Error('Failed to fetch patient details')
      const json = await res.json()
      const usersJson = usersRes.ok ? await usersRes.json().catch(() => []) : []
      data = {
        patient: json.patient,
        summary: json.summary,
        packages: json.packages || [],
        appointments: json.appointments || [],
        sessions: json.sessions || [],
        payments: json.payments || [],
        therapists: Array.isArray(usersJson) ? usersJson : [],
      }
    } catch {
      toast.error('Failed to load patient details for printing')
      return
    }

    const html = buildPatientHistoryReportHTML(data, canSeeMobile, choice.branding, choice.mode)

    // Print, save as PDF, or share to WhatsApp/Files — chosen in the dialog.
    await deliverDocument(html, choice.output, {
      fileName: `Patient History - ${patient.childName}`,
      shareTitle: 'Patient History Report',
      shareText: `Patient history report for ${patient.childName}`,
      patientId: patient.id,
      patientPhone: patient.mobile || undefined,
    })
  }

  return (
    <div className="space-y-4">
      {PrintSettingsDialog}
      {/* Letterhead background for browser print (Ctrl+P) — the clinic's own
          uploaded letterhead from Settings → Print Branding; hidden when not
          configured (never another clinic's artwork). */}
      {letterheadUrl && (
         
        <img className="letterhead-img-bg" src={letterheadUrl} alt="" />
      )}

      <div className="grid gap-3 md:grid-cols-[1fr_auto] no-print">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 shadow-sm">
            <Users className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Patient History</h1>
            <p className="text-sm text-muted-foreground">Review records, finance summaries, and visit details.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <Download className="mr-2 h-4 w-4" /> Export to Excel
          </Button>
          <Button variant="secondary" size="sm" onClick={handlePrintList}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3 no-print">
        <Card className="border border-gray-200 hover:shadow-sm transition-shadow">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-600">Total Patients</p>
                <p className="mt-1 text-2xl font-bold text-teal-600">{summaryMetrics.totalPatients}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-100">
                <Users className="h-5 w-5 text-teal-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-gray-200 hover:shadow-sm transition-shadow">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-600">Outstanding</p>
                <p className="mt-1 text-xl font-bold text-amber-600">{formatCurrency(summaryMetrics.totalOutstanding)}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                <CircleDollarSign className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-gray-200 hover:shadow-sm transition-shadow">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-600">With Visit History</p>
                <p className="mt-1 text-xl font-bold text-blue-600">{summaryMetrics.patientsWithVisits}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <Clock3 className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-lg border border-gray-200 p-3 no-print">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by name, ID, parent, or mobile"
              className="h-8 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            />
            {isDebouncing && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
            {!isDebouncing && searchQuery && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {summaryMetrics.pendingPatients} patient{summaryMetrics.pendingPatients === 1 ? '' : 's'} with pending balance
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden print-content-with-letterhead">
        <CardHeader>
          <CardTitle>Patient history list</CardTitle>
          <CardDescription>Export, print, or manage each patient's record below.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 border-b-2 border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-bold uppercase tracking-wide text-gray-700">🔑 ID</TableHead>
                <TableHead className="font-bold uppercase tracking-wide text-gray-700">👤 Patient</TableHead>
                {canSeeMobile && <TableHead className="font-bold uppercase tracking-wide text-gray-700">📱 Mobile</TableHead>}
                <TableHead className="font-bold uppercase tracking-wide text-gray-700">📦 Package</TableHead>
                <TableHead className="font-bold uppercase tracking-wide text-gray-700">🏷️ Discount</TableHead>
                <TableHead className="font-bold uppercase tracking-wide text-gray-700">💰 Paid</TableHead>
                <TableHead className="font-bold uppercase tracking-wide text-gray-700">⚠️ Outstanding</TableHead>
                <TableHead className="font-bold uppercase tracking-wide text-gray-700">📊 Status</TableHead>
                <TableHead className="font-bold uppercase tracking-wide text-gray-700">📅 Last Visit</TableHead>
                <TableHead className="font-bold uppercase tracking-wide text-gray-700">⚙️ Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={index}>
                    {Array.from({ length: canSeeMobile ? 10 : 9 }).map((__, cellIndex) => (
                      <TableCell key={cellIndex}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredPatients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canSeeMobile ? 10 : 9} className="text-center py-10 text-sm text-muted-foreground">
                    No patient history records found.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedPatients.map((patient) => {
                  const summary = summaries[patient.id]
                  const status = getPaymentStatus(summary)
                  return (
                    <TableRow key={patient.id} className="border-l-4 border-transparent transition-all hover:border-blue-500 hover:bg-blue-50 hover:shadow-sm">
                      <TableCell className="font-mono text-xs font-semibold text-gray-700">{patient.patientId}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-700">
                            {patient.childName?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <span className="font-medium">{patient.childName}</span>
                        </div>
                      </TableCell>
                      {canSeeMobile && <TableCell>{patient.mobile || 'N/A'}</TableCell>}
                      <TableCell>{summary ? formatCurrency(summary.totalPackageAmount) : '—'}</TableCell>
                      <TableCell>{summary && summary.totalDiscount > 0 ? formatCurrency(summary.totalDiscount) : '—'}</TableCell>
                      <TableCell>{summary ? formatCurrency(summary.totalAmountPaid) : '—'}</TableCell>
                      <TableCell>{summary ? formatCurrency(summary.pendingAmount) : '—'}</TableCell>
                      <TableCell>
                        <Badge variant={status.variant as any}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>{summary?.lastVisit ? format(new Date(summary.lastVisit), 'dd MMM yyyy') : 'N/A'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Export to Excel" aria-label="Export to Excel" onClick={() => handleExportPatientExcel(patient)}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Print patient" onClick={() => handlePrintPatient(patient)}>
                            <Printer className="h-4 w-4" />
                          </Button>
                          {canManagePatients && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              title="Delete"
                              onClick={() => handleDeleteClick(patient)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          {filteredPatients.length > pageSize && (
            <div className="mt-4 px-4 pb-4">
              <Pagination aria-label="Patient history pagination">
                <PaginationContent>
                  <PaginationPrevious
                    onClick={(event) => {
                      event.preventDefault()
                      setCurrentPage((page) => Math.max(1, page - 1))
                    }}
                    disabled={currentPage === 1}
                  />
                  {Array.from({ length: totalPages }).map((_, index) => {
                    const page = index + 1
                    if (totalPages > 7) {
                      if (page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1) {
                        return (
                          <PaginationItem key={page}>
                            <PaginationLink
                              href="#"
                              isActive={page === currentPage}
                              onClick={(event) => {
                                event.preventDefault()
                                setCurrentPage(page)
                              }}
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        )
                      }

                      if (page === 2 && currentPage > 3) {
                        return <PaginationItem key="start-ellipsis"><PaginationEllipsis /></PaginationItem>
                      }

                      if (page === totalPages - 1 && currentPage < totalPages - 2) {
                        return <PaginationItem key="end-ellipsis"><PaginationEllipsis /></PaginationItem>
                      }

                      return null
                    }

                    return (
                      <PaginationItem key={page}>
                        <PaginationLink
                          href="#"
                          isActive={page === currentPage}
                          onClick={(event) => {
                            event.preventDefault()
                            setCurrentPage(page)
                          }}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  })}
                  <PaginationNext
                    onClick={(event) => {
                      event.preventDefault()
                      setCurrentPage((page) => Math.min(totalPages, page + 1))
                    }}
                    disabled={currentPage === totalPages}
                  />
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Patient</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Are you sure you want to permanently delete{' '}
                  <span className="font-semibold text-foreground">{deleteTarget?.childName}</span>?
                </p>
                <p>This action will remove:</p>
                <ul className="list-disc pl-5 text-sm">
                  <li>Patient profile</li>
                  <li>Session packages</li>
                  <li>Scheduled sessions &amp; appointments</li>
                  <li>Assessments</li>
                  <li>Uploaded reports/documents</li>
                </ul>
                <p>
                  Invoices and payments are archived (not deleted) for audit/accounting compliance.
                </p>
                <p className="font-semibold text-destructive">This action cannot be undone.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <label className="text-sm font-medium text-foreground">
              Deletion Reason <span className="text-destructive">*</span>
            </label>
            <textarea
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Enter the reason for deleting this patient (required)..."
              value={deletionReason}
              onChange={(e) => setDeletionReason(e.target.value)}
              disabled={deleting}
              autoFocus
            />
            {deletionReason.trim().length === 0 && (
              <p className="text-xs text-destructive">A deletion reason is required to proceed.</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false)
                setDeleteTarget(null)
                setDeletionReason('')
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting || deletionReason.trim().length === 0}
            >
              {deleting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete Patient
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
