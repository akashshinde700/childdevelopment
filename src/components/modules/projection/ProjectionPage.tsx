'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAppStore, type AppPage } from '@/store/app-store'
import { authFetch } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { createLetterheadPDF, letterheadMargins, letterheadDidDrawPage, formatCurrencyForPdf } from '@/lib/letterhead-pdf'
import { printHTMLDocument, escapeHTML as esc } from '@/components/print/DocumentLayout'
import { usePrintSettings } from '@/components/print/PrintSettingsDialog'
import { absoluteAssetUrl, type PrintAssets } from '@/lib/print-branding'
import {
  Plus,
  Printer,
  FileDown,
  TrendingUp,
  RefreshCw,
  Loader2,
  ClipboardCheck,
  CalendarDays,
  Phone,
  IndianRupee,
  Package,
  RefreshCcw,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────

interface ProjectionRow {
  id: string
  childName: string
  patientId?: string
  package: string
  amount: number
  projectedAmount: number
  receivedAmount: number
  balanceAmount: number
  date: string
}

interface LeadRow {
  id: string
  childName: string
  parentName: string
  contactNumber: string
  address: string
  remark: string
  date: string
}

interface Summary {
  totalEnrollments: { count: number; amount: number }
  totalAssessments: { count: number; amount: number }
  totalConsultations: { count: number; amount: number }
  totalRenewals: { count: number; amount: number }
  totalLeads: { count: number }
  totalReceived: { amount: number }
}

interface MonthlySummaryRow {
  category: string
  projected: number
  received: number
  pending: number
}

interface PendingPayment {
  childName: string
  category: string
  pendingAmount: number
}

interface ProjectionData {
  centerName: string
  branchName: string
  month: number
  year: number
  monthLabel: string
  currentDate: string
  preparedBy: string
  summary: Summary
  enrollments: ProjectionRow[]
  assessments: ProjectionRow[]
  consultations: ProjectionRow[]
  renewals: ProjectionRow[]
  leads: LeadRow[]
  monthlySummary: MonthlySummaryRow[]
  grandTotals: { projected: number; received: number; pending: number }
  pendingPayments: PendingPayment[]
}

interface Branch {
  id: string
  name: string
  code: string
}

// ─── Helpers ──────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatCurrency(amount: number): string {
  return `₹${(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(date: string | Date): string {
  if (!date) return '-'
  const d = new Date(date)
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(date: string | Date): string {
  if (!date) return '-'
  const d = new Date(date)
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Lead status -> badge styling
const LEAD_STATUS_STYLES: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800 border-blue-200',
  contacted: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  interested: 'bg-purple-100 text-purple-800 border-purple-200',
  registered: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  lost: 'bg-red-100 text-red-800 border-red-200',
  dropped: 'bg-red-100 text-red-800 border-red-200',
}

function getLeadStatusBadge(status: string) {
  const cls = LEAD_STATUS_STYLES[status] || 'bg-gray-100 text-gray-800 border-gray-200'
  return (
    <Badge variant="outline" className={`capitalize ${cls}`}>
      {status}
    </Badge>
  )
}

// ─── Summary Card Config ──────────────────────────────────────────

interface SummaryCardConfig {
  key: string
  title: string
  icon: React.ReactNode
  // Tailwind classes
  iconBg: string
  iconColor: string
  borderClass: string
}

const SUMMARY_CARDS: SummaryCardConfig[] = [
  {
    key: 'enrollments',
    title: 'Total Enrollments',
    icon: <Package className="h-5 w-5" />,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    borderClass: 'border-l-blue-500',
  },
  {
    key: 'assessments',
    title: 'Total Assessments',
    icon: <ClipboardCheck className="h-5 w-5" />,
    iconBg: 'bg-green-50',
    iconColor: 'text-green-600',
    borderClass: 'border-l-green-500',
  },
  {
    key: 'consultations',
    title: 'Total Consultations',
    icon: <CalendarDays className="h-5 w-5" />,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-600',
    borderClass: 'border-l-orange-500',
  },
  {
    key: 'renewals',
    title: 'Total Renewals',
    icon: <RefreshCcw className="h-5 w-5" />,
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-600',
    borderClass: 'border-l-purple-500',
  },
  {
    key: 'leads',
    title: 'Total Leads',
    icon: <Phone className="h-5 w-5" />,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    borderClass: 'border-l-indigo-500',
  },
  {
    key: 'received',
    title: 'Total Received',
    icon: <IndianRupee className="h-5 w-5" />,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    borderClass: 'border-l-emerald-500',
  },
]

// ─── Section header bar styling ───────────────────────────────────

interface SectionConfig {
  title: string
  addTooltip: string
  addPage: AppPage
  headerBg: string
  headerText: string
}

const SECTION_CONFIG: Record<string, SectionConfig> = {
  enrollments: {
    title: 'New Enrollments',
    addTooltip: 'Add Enrollment',
    addPage: 'package-form',
    headerBg: 'bg-blue-500',
    headerText: 'text-white',
  },
  assessments: {
    title: 'New Assessments',
    addTooltip: 'Add Assessment',
    addPage: 'assessment-form',
    headerBg: 'bg-green-500',
    headerText: 'text-white',
  },
  consultations: {
    title: 'New Consultations',
    addTooltip: 'Add Consultation',
    addPage: 'appointment-form',
    headerBg: 'bg-orange-500',
    headerText: 'text-white',
  },
  renewals: {
    title: 'New Renewals',
    addTooltip: 'Add Renewal',
    addPage: 'package-form',
    headerBg: 'bg-purple-500',
    headerText: 'text-white',
  },
  leads: {
    title: 'New Leads',
    addTooltip: 'Add Lead',
    addPage: 'lead-form',
    headerBg: 'bg-indigo-500',
    headerText: 'text-white',
  },
}

// ─── Print HTML builder ───────────────────────────────────────────

function buildPrintHTML(data: ProjectionData, branding: PrintAssets, withBands: boolean): string {
  // Clinic's own uploaded bands (Settings → Print Branding), or none.
  const headerSrc = withBands ? absoluteAssetUrl(branding.printHeader) : ''
  const footerSrc = withBands ? absoluteAssetUrl(branding.printFooter) : ''
  const centerAddr = []
  // No address available without settings fetch — keep concise
  const head = `<style>
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    @page { size: A4; margin: 10mm 15mm; }
    body { font-family: Arial, sans-serif; color: #333; max-width: 900px; margin: auto; }
    /* Header/footer are rendered as normal in-flow images (once at the very
       top, once at the very end) rather than position:fixed — fixed elements
       combined with multi-page print content are unreliable in Chrome (the
       band can end up overlapping mid-page content instead of repeating
       cleanly per page). See buildPatientHistoryReportHTML for the same
       pattern already proven in this codebase. */
    .rp-header { margin: 0 0 16px; break-after: avoid; page-break-after: avoid; }
    .rp-header img { width: 100%; height: auto; max-height: 60mm; object-fit: contain; display: block; }
    .rp-footer { margin: 16px 0 0; break-before: avoid; page-break-before: avoid; }
    .rp-footer img { width: 100%; height: auto; max-height: 35mm; object-fit: contain; display: block; }
    .content-area { position: relative; padding: 0 50px; }
    @media screen { .content-area { padding: 0 20px; } }
    .report-header { text-align: center; margin-bottom: 20px; }
    .report-header h2 { font-size: 18px; color: #0f766e; margin: 0 0 4px; }
    .report-header p { font-size: 12px; color: #666; margin: 2px 0; }
    .report-header hr { border: none; border-top: 2px solid #0F7A87; margin: 8px 0 0; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11px; }
    th, td { border: 1px solid #ddd; padding: 5px 7px; text-align: left; }
    th { background: #f8f9fa; font-weight: 600; color: #444; }
    tfoot td { font-weight: 700; background: #f0f0f0; }
    tr:nth-child(even) { background: #fafafa; }
    .section-title { font-size: 13px; font-weight: 700; color: #0f766e; margin: 14px 0 4px; padding: 4px 8px; background: #f1f5f9; border-left: 4px solid #0f766e; }
    .badge { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 10px; font-weight: 500; }
    .badge-blue { background: #dbeafe; color: #1e40af; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-orange { background: #ffedd5; color: #9a3412; }
    .badge-purple { background: #f3e8ff; color: #6b21a8; }
    .badge-red { background: #fee2e2; color: #b91c1c; }
    .badge-gray { background: #f3f4f6; color: #374151; }
    .footer-note { text-align: center; color: #999; font-size: 10px; margin-top: 30px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 10px 0; }
    .summary-item { border: 1px solid #ddd; padding: 8px; border-radius: 4px; text-align: center; }
    .summary-item .title { font-size: 10px; color: #666; text-transform: uppercase; }
    .summary-item .value { font-size: 14px; font-weight: 700; color: #333; }
  </style>`

  // Build summary cards HTML
  const summaryCardsHtml = `
    <div class="summary-grid">
      <div class="summary-item"><div class="title">Enrollments</div><div class="value">${data.summary.totalEnrollments.count}</div><div style="font-size:11px">${formatCurrency(data.summary.totalEnrollments.amount)}</div></div>
      <div class="summary-item"><div class="title">Assessments</div><div class="value">${data.summary.totalAssessments.count}</div><div style="font-size:11px">${formatCurrency(data.summary.totalAssessments.amount)}</div></div>
      <div class="summary-item"><div class="title">Consultations</div><div class="value">${data.summary.totalConsultations.count}</div><div style="font-size:11px">${formatCurrency(data.summary.totalConsultations.amount)}</div></div>
      <div class="summary-item"><div class="title">Renewals</div><div class="value">${data.summary.totalRenewals.count}</div><div style="font-size:11px">${formatCurrency(data.summary.totalRenewals.amount)}</div></div>
      <div class="summary-item"><div class="title">Leads</div><div class="value">${data.summary.totalLeads.count}</div><div style="font-size:11px">&nbsp;</div></div>
      <div class="summary-item"><div class="title">Total Received</div><div class="value">${formatCurrency(data.summary.totalReceived.amount)}</div><div style="font-size:11px">&nbsp;</div></div>
    </div>`

  // Helper to render a financial detail section
  const renderFinSection = (title: string, rows: ProjectionRow[]) => {
    if (rows.length === 0) {
      return `<div class="section-title">${title}</div><p style="font-size:11px;color:#999;font-style:italic">No records for this period.</p>`
    }
    const bodyHtml = rows.map((r, i) => {
      const balClass = r.balanceAmount > 0 ? 'badge-red' : 'badge-green'
      return `<tr>
        <td>${i + 1}</td>
        <td>${esc(r.childName)}</td>
        <td>${esc(r.package)}</td>
        <td style="text-align:right">${formatCurrency(r.amount)}</td>
        <td style="text-align:right">${formatCurrency(r.projectedAmount)}</td>
        <td style="text-align:right">${formatCurrency(r.receivedAmount)}</td>
        <td style="text-align:right"><span class="badge ${balClass}">${formatCurrency(r.balanceAmount)}</span></td>
        <td>${formatDate(r.date)}</td>
      </tr>`
    }).join('')
    const totals = rows.reduce(
      (acc, r) => {
        acc.amount += r.amount
        acc.projected += r.projectedAmount
        acc.received += r.receivedAmount
        acc.balance += r.balanceAmount
        return acc
      },
      { amount: 0, projected: 0, received: 0, balance: 0 },
    )
    return `<div class="section-title">${title}</div>
      <table>
        <thead><tr><th>#</th><th>Child Name</th><th>Package</th><th style="text-align:right">Amount</th><th style="text-align:right">Projected</th><th style="text-align:right">Received</th><th style="text-align:right">Balance</th><th>Date</th></tr></thead>
        <tbody>${bodyHtml}</tbody>
        <tfoot><tr><td colspan="3">TOTAL</td><td style="text-align:right">${formatCurrency(totals.amount)}</td><td style="text-align:right">${formatCurrency(totals.projected)}</td><td style="text-align:right">${formatCurrency(totals.received)}</td><td style="text-align:right">${formatCurrency(totals.balance)}</td><td></td></tr></tfoot>
      </table>`
  }

  // Leads section
  const renderLeadsSection = (rows: LeadRow[]) => {
    if (rows.length === 0) {
      return `<div class="section-title">New Leads</div><p style="font-size:11px;color:#999;font-style:italic">No leads for this period.</p>`
    }
    const bodyHtml = rows.map((r, i) => {
      const badgeCls =
        r.remark === 'registered' ? 'badge-green' :
        r.remark === 'lost' || r.remark === 'dropped' ? 'badge-red' :
        r.remark === 'interested' ? 'badge-purple' :
        r.remark === 'contacted' ? 'badge-orange' :
        'badge-blue'
      return `<tr>
        <td>${i + 1}</td>
        <td>${esc(r.childName)}</td>
        <td>${esc(r.parentName)}</td>
        <td>${esc(r.contactNumber)}</td>
        <td>${esc(r.address)}</td>
        <td><span class="badge ${badgeCls}">${esc(r.remark)}</span></td>
      </tr>`
    }).join('')
    return `<div class="section-title">New Leads</div>
      <table>
        <thead><tr><th>#</th><th>Child Name</th><th>Parent Name</th><th>Contact No.</th><th>Address</th><th>Remark</th></tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>`
  }

  // Monthly summary
  const msBodyHtml = data.monthlySummary.map((m) => `
    <tr>
      <td>${m.category}</td>
      <td style="text-align:right">${formatCurrency(m.projected)}</td>
      <td style="text-align:right">${formatCurrency(m.received)}</td>
      <td style="text-align:right">${formatCurrency(m.pending)}</td>
    </tr>
  `).join('')
  const monthlySummaryHtml = `
    <div class="section-title">Monthly Summary</div>
    <table>
      <thead><tr><th>Category</th><th style="text-align:right">Projected</th><th style="text-align:right">Received</th><th style="text-align:right">Pending</th></tr></thead>
      <tbody>${msBodyHtml}</tbody>
      <tfoot><tr><td>Grand Total</td><td style="text-align:right">${formatCurrency(data.grandTotals.projected)}</td><td style="text-align:right">${formatCurrency(data.grandTotals.received)}</td><td style="text-align:right">${formatCurrency(data.grandTotals.pending)}</td></tr></tfoot>
    </table>`

  // Pending payments
  const pendingHtml = data.pendingPayments.length === 0
    ? `<p style="font-size:11px;color:#999;font-style:italic">No pending payments.</p>`
    : `<table>
        <thead><tr><th>Child Name</th><th>Category</th><th style="text-align:right">Pending Amount</th></tr></thead>
        <tbody>${data.pendingPayments.map((p) => `<tr><td>${esc(p.childName)}</td><td>${esc(p.category)}</td><td style="text-align:right"><span class="badge badge-red">${formatCurrency(p.pendingAmount)}</span></td></tr>`).join('')}</tbody>
      </table>`

  return `<html><head><title>Projection Report - ${esc(data.monthLabel)}</title>${head}</head><body>
    ${headerSrc ? `<div class="rp-header"><img src="${esc(headerSrc)}" alt="" /></div>` : ''}
    <div class="content-area">
      <div class="report-header">
        <h2>${esc(data.centerName)}</h2>
        <p style="font-size:14px;font-weight:700;color:#0f766e">PROJECTION REPORT</p>
        <p>Month: <strong>${esc(data.monthLabel)}</strong> | Branch: <strong>${esc(data.branchName)}</strong></p>
        <p>Prepared by: ${esc(data.preparedBy)} | Generated: ${formatDateTime(data.currentDate)}</p>
        <hr />
      </div>
      ${summaryCardsHtml}
      ${monthlySummaryHtml}
      ${renderFinSection('New Enrollments', data.enrollments)}
      ${renderFinSection('New Assessments', data.assessments)}
      ${renderFinSection('New Consultations', data.consultations)}
      ${renderFinSection('New Renewals', data.renewals)}
      ${renderLeadsSection(data.leads)}
      <div class="section-title">Pending Payments</div>
      ${pendingHtml}
      <p class="footer-note">${data.centerName} — Projection Report for ${data.monthLabel}</p>
    </div>
    ${footerSrc ? `<div class="rp-footer"><img src="${esc(footerSrc)}" alt="" /></div>` : ''}
  </body></html>`
}

// ─── Component ────────────────────────────────────────────────────

export default function ProjectionPage() {
  const user = useAppStore((s) => s.user)
  const navigate = useAppStore((s) => s.navigate)
  const isSuperAdmin = user?.role === 'super_admin'

  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [branchId, setBranchId] = useState('')
  const [branches, setBranches] = useState<Branch[]>([])
  const [data, setData] = useState<ProjectionData | null>(null)
  const [loading, setLoading] = useState(false)
  const { choosePrintMode, PrintSettingsDialog } = usePrintSettings()

  // Fetch branches for super_admin selector
  useEffect(() => {
    if (!isSuperAdmin) return
    const fetchBranches = async () => {
      try {
        const res = await authFetch('/api/branches')
        if (res.ok) {
          const result = await res.json()
          setBranches(result)
        }
      } catch {
        /* silent */
      }
    }
    fetchBranches()
  }, [isSuperAdmin])

  const generateReport = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('month', String(month))
      params.set('year', String(year))
      if (isSuperAdmin && branchId) params.set('branchId', branchId)

      const res = await authFetch(`/api/projection?${params.toString()}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to generate report')
      }
      const result = await res.json()
      setData(result)
      toast.success('Projection report generated successfully')
    } catch (error) {
      console.error('Projection fetch error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to generate report')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [month, year, branchId, isSuperAdmin])

  // Auto-generate on mount (intentionally only on initial render)
  useEffect(() => {
    generateReport()
  }, [])

  const handlePrint = async () => {
    if (!data) {
      toast.error('Generate the report first')
      return
    }
    const choice = await choosePrintMode({ modes: ['header_footer', 'plain'] })
    if (!choice) return
    printHTMLDocument(
      buildPrintHTML(data, choice.branding, choice.mode === 'header_footer'),
      () => navigate('projection'),
    )
  }

  const handleExportPDF = async () => {
    if (!data) {
      toast.error('Generate the report first')
      return
    }
    const choice = await choosePrintMode()
    if (!choice) return
    try {
      const autoTable = (await import('jspdf-autotable')).default
      const doc = await createLetterheadPDF({ orientation: 'landscape', mode: choice.mode, branding: choice.branding })
      const tableOpts = { margin: letterheadMargins(doc), didDrawPage: letterheadDidDrawPage(doc) }

      // Header (clinic name/logo already on the letterhead background)
      doc.setFontSize(12)
      doc.setTextColor(15, 118, 110)
      doc.text('PROJECTION REPORT', doc.contentLeftX, doc.contentTopY - 34)
      doc.setTextColor(80, 80, 80)
      doc.setFontSize(10)
      doc.text(`Month: ${data.monthLabel}  |  Branch: ${data.branchName}`, doc.contentLeftX, doc.contentTopY - 18)
      doc.text(`Prepared by: ${data.preparedBy}  |  Generated: ${formatDate(data.currentDate)}`, doc.contentLeftX, doc.contentTopY - 4)

      // Summary table
      doc.setFontSize(11)
      doc.setTextColor(0, 0, 0)
      doc.text('Summary', doc.contentLeftX, doc.contentTopY + 16)
      autoTable(doc, {
        head: [['Category', 'Count', 'Amount']],
        body: [
          ['Enrollments', String(data.summary.totalEnrollments.count), formatCurrencyForPdf(data.summary.totalEnrollments.amount)],
          ['Assessments', String(data.summary.totalAssessments.count), formatCurrencyForPdf(data.summary.totalAssessments.amount)],
          ['Consultations', String(data.summary.totalConsultations.count), formatCurrencyForPdf(data.summary.totalConsultations.amount)],
          ['Renewals', String(data.summary.totalRenewals.count), formatCurrencyForPdf(data.summary.totalRenewals.amount)],
          ['Leads', String(data.summary.totalLeads.count), '-'],
          ['Total Received', '-', formatCurrencyForPdf(data.summary.totalReceived.amount)],
        ],
        startY: doc.contentTopY + 26,
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [15, 118, 110], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [246, 250, 249] },
        columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
        ...tableOpts,
      })

      // Helper: get the Y position after the last autoTable call
      const getLastY = (): number =>
        (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 0

      // Monthly Summary
      const msY = getLastY() + 20
      doc.setFontSize(11)
      doc.text('Monthly Summary', 40, msY)
      autoTable(doc, {
        head: [['Category', 'Projected', 'Received', 'Pending']],
        body: [
          ...data.monthlySummary.map((m) => [
            m.category,
            formatCurrencyForPdf(m.projected),
            formatCurrencyForPdf(m.received),
            formatCurrencyForPdf(m.pending),
          ]),
          [
            'Grand Total',
            formatCurrencyForPdf(data.grandTotals.projected),
            formatCurrencyForPdf(data.grandTotals.received),
            formatCurrencyForPdf(data.grandTotals.pending),
          ],
        ],
        startY: msY + 10,
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [15, 118, 110], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [246, 250, 249] },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
        footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
        ...tableOpts,
      })

      // Detail sections (4 financial categories)
      const detailSections: { title: string; rows: ProjectionRow[] }[] = [
        { title: 'New Enrollments', rows: data.enrollments },
        { title: 'New Assessments', rows: data.assessments },
        { title: 'New Consultations', rows: data.consultations },
        { title: 'New Renewals', rows: data.renewals },
      ]

      for (const section of detailSections) {
        const nextY = getLastY() + 22
        doc.setFontSize(11)
        doc.text(section.title, 40, nextY)
        const body = section.rows.map((r, i) => [
          String(i + 1),
          r.childName,
          r.package,
          formatCurrencyForPdf(r.amount),
          formatCurrencyForPdf(r.projectedAmount),
          formatCurrencyForPdf(r.receivedAmount),
          formatCurrencyForPdf(r.balanceAmount),
          formatDate(r.date),
        ])
        const totals = section.rows.reduce(
          (acc, r) => {
            acc.amount += r.amount
            acc.projected += r.projectedAmount
            acc.received += r.receivedAmount
            acc.balance += r.balanceAmount
            return acc
          },
          { amount: 0, projected: 0, received: 0, balance: 0 },
        )
        body.push([
          '',
          'TOTAL',
          '',
          formatCurrencyForPdf(totals.amount),
          formatCurrencyForPdf(totals.projected),
          formatCurrencyForPdf(totals.received),
          formatCurrencyForPdf(totals.balance),
          '',
        ])
        autoTable(doc, {
          head: [['#', 'Child Name', 'Package', 'Amount', 'Projected', 'Received', 'Balance', 'Date']],
          body,
          startY: nextY + 10,
          styles: { fontSize: 8, cellPadding: 5, valign: 'middle', overflow: 'linebreak' },
          headStyles: { fillColor: [15, 118, 110], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [246, 250, 249] },
          columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
          footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
          ...tableOpts,
        })
      }

      // Leads
      const leadsY = getLastY() + 22
      doc.setFontSize(11)
      doc.text('New Leads', 40, leadsY)
      autoTable(doc, {
        head: [['#', 'Child Name', 'Parent Name', 'Contact No.', 'Address', 'Remark']],
        body: data.leads.map((l, i) => [
          String(i + 1),
          l.childName,
          l.parentName,
          l.contactNumber,
          l.address,
          l.remark,
        ]),
        startY: leadsY + 10,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [15, 118, 110] },
        ...tableOpts,
      })

      // Pending Payments
      const ppY = getLastY() + 22
      doc.setFontSize(11)
      doc.text('Pending Payments', 40, ppY)
      autoTable(doc, {
        head: [['Child Name', 'Category', 'Pending Amount']],
        body:
          data.pendingPayments.length === 0
            ? [['-', '-', '-']]
            : data.pendingPayments.map((p) => [p.childName, p.category, formatCurrencyForPdf(p.pendingAmount)]),
        startY: ppY + 10,
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [15, 118, 110], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [246, 250, 249] },
        columnStyles: { 2: { halign: 'right' } },
        ...tableOpts,
      })

      doc.save(`Projection_Report_${data.monthLabel.replace(' ', '_')}.pdf`)
      toast.success('PDF exported successfully')
    } catch (error) {
      console.error('PDF export error:', error)
      toast.error('Failed to export PDF')
    }
  }

  // Render a financial detail section
  const renderFinancialSection = (
    sectionKey: 'enrollments' | 'assessments' | 'consultations' | 'renewals',
    rows: ProjectionRow[],
  ) => {
    const config = SECTION_CONFIG[sectionKey]
    const totals = rows.reduce(
      (acc, r) => {
        acc.amount += r.amount
        acc.projected += r.projectedAmount
        acc.received += r.receivedAmount
        acc.balance += r.balanceAmount
        return acc
      },
      { amount: 0, projected: 0, received: 0, balance: 0 },
    )
    return (
      <Card className="overflow-hidden">
        {/* Colored header bar */}
        <div className={`flex items-center justify-between px-4 py-2.5 ${config.headerBg} ${config.headerText}`}>
          <h3 className="text-sm font-semibold tracking-wide flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            {config.title}
            <Badge variant="secondary" className="ml-1 bg-white/20 text-white border-0">
              {rows.length}
            </Badge>
          </h3>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-white hover:bg-white/20 hover:text-white"
                onClick={() => navigate(config.addPage)}
                aria-label={config.addTooltip}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{config.addTooltip}</TooltipContent>
          </Tooltip>
        </div>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur z-10">
                <TableRow>
                  <TableHead className="w-12">Sr No</TableHead>
                  <TableHead>Child Name</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Projected</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-6 italic">
                      No records for this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r, i) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{i + 1}</TableCell>
                      <TableCell className="font-medium">{r.childName}</TableCell>
                      <TableCell className="text-muted-foreground">{r.package}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(r.amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(r.projectedAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(r.receivedAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.balanceAmount > 0 ? (
                          <span className="text-red-600 font-semibold">{formatCurrency(r.balanceAmount)}</span>
                        ) : (
                          <span className="text-green-600 font-semibold">{formatCurrency(r.balanceAmount)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{formatDate(r.date)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {rows.length > 0 && (
                <TableFooter>
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={3}>TOTAL</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(totals.amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(totals.projected)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(totals.received)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(totals.balance)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Render leads section
  const renderLeadsSection = (rows: LeadRow[]) => {
    const config = SECTION_CONFIG.leads
    return (
      <Card className="overflow-hidden">
        <div className={`flex items-center justify-between px-4 py-2.5 ${config.headerBg} ${config.headerText}`}>
          <h3 className="text-sm font-semibold tracking-wide flex items-center gap-2">
            <Phone className="h-4 w-4" />
            {config.title}
            <Badge variant="secondary" className="ml-1 bg-white/20 text-white border-0">
              {rows.length}
            </Badge>
          </h3>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-white hover:bg-white/20 hover:text-white"
                onClick={() => navigate(config.addPage)}
                aria-label={config.addTooltip}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{config.addTooltip}</TooltipContent>
          </Tooltip>
        </div>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur z-10">
                <TableRow>
                  <TableHead className="w-12">Sr No</TableHead>
                  <TableHead>Child Name</TableHead>
                  <TableHead>Parent Name</TableHead>
                  <TableHead>Contact No.</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Remark</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6 italic">
                      No leads for this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r, i) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{i + 1}</TableCell>
                      <TableCell className="font-medium">{r.childName}</TableCell>
                      <TableCell>{r.parentName}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.contactNumber}</TableCell>
                      <TableCell className="text-muted-foreground">{r.address}</TableCell>
                      <TableCell>{getLeadStatusBadge(r.remark)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Render a summary card
  const renderSummaryCard = (config: SummaryCardConfig) => {
    let count: string
    let amount: string
    if (config.key === 'enrollments') {
      count = String(data?.summary.totalEnrollments.count ?? 0)
      amount = formatCurrency(data?.summary.totalEnrollments.amount ?? 0)
    } else if (config.key === 'assessments') {
      count = String(data?.summary.totalAssessments.count ?? 0)
      amount = formatCurrency(data?.summary.totalAssessments.amount ?? 0)
    } else if (config.key === 'consultations') {
      count = String(data?.summary.totalConsultations.count ?? 0)
      amount = formatCurrency(data?.summary.totalConsultations.amount ?? 0)
    } else if (config.key === 'renewals') {
      count = String(data?.summary.totalRenewals.count ?? 0)
      amount = formatCurrency(data?.summary.totalRenewals.amount ?? 0)
    } else if (config.key === 'leads') {
      count = String(data?.summary.totalLeads.count ?? 0)
      amount = ''
    } else {
      // received
      count = ''
      amount = formatCurrency(data?.summary.totalReceived.amount ?? 0)
    }

    return (
      <Card key={config.key} className={`border-l-4 ${config.borderClass} shadow-sm`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
                {config.title}
              </p>
              {count !== '' && (
                <p className="text-2xl font-bold tabular-nums leading-none">{count}</p>
              )}
              {amount !== '' && (
                <p className="text-sm font-semibold tabular-nums text-foreground/80">{amount}</p>
              )}
            </div>
            <div className={`shrink-0 h-10 w-10 rounded-lg flex items-center justify-center ${config.iconBg} ${config.iconColor}`}>
              {config.icon}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Render loading skeletons
  const renderSkeletons = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} className="h-64 rounded-xl" />
      ))}
      <Skeleton className="h-48 rounded-xl" />
    </div>
  )

  return (
    <div className="space-y-6">
      {PrintSettingsDialog}
      {/* ─── Header ──────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {data?.centerName || 'Your Clinic Name'}
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight">PROJECTION REPORT</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {data && (
                  <Badge variant="destructive" className="bg-red-500 hover:bg-red-500 text-white">
                    {data.monthLabel}
                  </Badge>
                )}
                {data && (
                  <Badge variant="outline" className="font-medium">
                    Branch: {data.branchName}
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-sm text-muted-foreground space-y-1 lg:text-right">
              <p>
                <span className="font-medium text-foreground">Today&apos;s Date:</span>{' '}
                {formatDate(new Date())}
              </p>
              <p>
                <span className="font-medium text-foreground">Prepared By:</span>{' '}
                {data?.preparedBy || user?.name || '-'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Filters ────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Month</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Year</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Year" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 7 }, (_, i) => now.getFullYear() - 3 + i).map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isSuperAdmin && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Branch</Label>
                <Select value={branchId || 'all'} onValueChange={(v) => setBranchId(v === 'all' ? '' : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All Branches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={generateReport} disabled={loading} className="h-10">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Generate Report
            </Button>
            <div className="flex gap-2">
              <Button onClick={handlePrint} variant="outline" className="flex-1 h-10" disabled={!data}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button onClick={handleExportPDF} variant="outline" className="flex-1 h-10" disabled={!data}>
                <FileDown className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Body ───────────────────────────────────────────── */}
      {loading && !data ? (
        renderSkeletons()
      ) : data ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {SUMMARY_CARDS.map(renderSummaryCard)}
          </div>

          {/* Detail tables */}
          {renderFinancialSection('enrollments', data.enrollments)}
          {renderFinancialSection('assessments', data.assessments)}
          {renderFinancialSection('consultations', data.consultations)}
          {renderFinancialSection('renewals', data.renewals)}
          {renderLeadsSection(data.leads)}

          {/* Monthly Summary */}
          <Card>
            <div className="px-4 py-2.5 bg-slate-700 text-white flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-wide">Monthly Summary</h3>
            </div>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Projected</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.monthlySummary.map((m) => (
                    <TableRow key={m.category}>
                      <TableCell className="font-medium">{m.category}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(m.projected)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(m.received)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.pending > 0 ? (
                          <span className="text-red-600 font-semibold">{formatCurrency(m.pending)}</span>
                        ) : (
                          <span className="text-green-600 font-semibold">{formatCurrency(m.pending)}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="bg-muted/50 font-bold text-base">
                    <TableCell>Grand Total</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(data.grandTotals.projected)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(data.grandTotals.received)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {data.grandTotals.pending > 0 ? (
                        <span className="text-red-600">{formatCurrency(data.grandTotals.pending)}</span>
                      ) : (
                        <span className="text-green-600">{formatCurrency(data.grandTotals.pending)}</span>
                      )}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          {/* Pending Payments */}
          <Card>
            <div className="px-4 py-2.5 bg-red-600 text-white flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-wide">Pending Payment List</h3>
              <Badge variant="secondary" className="ml-1 bg-white/20 text-white border-0">
                {data.pendingPayments.length}
              </Badge>
            </div>
            <CardContent className="p-0">
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur z-10">
                    <TableRow>
                      <TableHead>Child Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Pending Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.pendingPayments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-6 italic">
                          No pending payments for this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.pendingPayments.map((p, i) => (
                        <TableRow key={`${p.childName}-${p.category}-${i}`}>
                          <TableCell className="font-medium">{p.childName}</TableCell>
                          <TableCell className="text-muted-foreground">{p.category}</TableCell>
                          <TableCell className="text-right tabular-nums text-red-600 font-semibold">
                            {formatCurrency(p.pendingAmount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No projection data available. Adjust filters and click Generate Report.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
