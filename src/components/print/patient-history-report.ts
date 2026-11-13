import { format } from 'date-fns'
import { buildDocumentHTML, escapeHTML as esc } from '@/components/print/DocumentLayout'
import { getPaymentStatus as getPaymentStatusLabel } from '@/lib/payment-status'
import type { PrintBranding, PrintMode } from '@/lib/print-branding'
import { resolveAppointmentTypeLabel } from '@/store/app-store'

// ─── Types (matching API response from /api/patients/[id]) ──────────────────────

export interface ReportPatient {
  id: string
  patientId: string
  childName: string
  fatherName?: string
  motherName?: string
  parentName?: string
  mobile?: string
  dateOfBirth?: string
  gender?: string
  photo?: string
}

export interface ReportSummary {
  totalPackageAmount: number
  totalAmountPaid: number
  pendingAmount: number
}

export interface ReportPackage {
  id: string
  name?: string
  therapyType?: string
  sessionDuration?: number
  totalAmount?: number
  sessionsPurchased: number
  sessionsCompleted: number
  sessionsExpired?: number
  netAmount: number
  discountAmount?: number
  startDate: string
  endDate: string
  status: string
  package: { name: string; therapyType: string; sessionCount: number; sessionDuration: number; amount?: number }
}

export interface ReportAppointment {
  id: string
  date?: string
  status?: string
  title?: string
  type?: string
  therapistId?: string | null
  notes?: string
  sessionFocus?: string | null
  goalTargeted?: string | null
  progressAchieved?: string | null
  sessionRemarks?: string | null
}

export interface ReportSession {
  id: string
  therapistName?: string
}

export interface ReportPayment {
  id: string
  amount?: number
  paymentMode?: string
  date?: string
  referenceNo?: string
}

export interface PatientHistoryReportData {
  patient: ReportPatient
  summary: ReportSummary
  packages: ReportPackage[]
  appointments: ReportAppointment[]
  sessions: ReportSession[]
  payments: ReportPayment[]
  // Used to resolve a generic appointment "type" (e.g. "therapy") to the
  // assigned therapist's actual role for the Upcoming Sessions "Focus Area"
  // column — same fix already applied to Appointments/Sessions/Patient
  // Profile. Optional so existing callers that don't pass it still work
  // (the raw type just won't be resolved to a role in that case).
  therapists?: Array<{ name: string; role?: string | null }>
}

function formatCurrency(amount?: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0)
}

/**
 * Builds the full "PATIENT HISTORY REPORT" print HTML — the clinic's
 * standard rich report (Child Details, Package Details, Payment Summary,
 * Payment History, Completed/Upcoming Sessions, Therapist Summary) with the
 * clinic's uploaded branding per the chosen print mode. Shared by both the
 * patient history list print and the patient history detail-page print so
 * they stay visually identical.
 */
export type ReportBranding = PrintBranding

export function buildPatientHistoryReportHTML(
  data: PatientHistoryReportData,
  canSeeMobile: boolean,
  branding?: ReportBranding,
  mode: PrintMode = 'header_footer',
): string {
  const { patient, summary, packages, appointments, sessions, payments, therapists = [] } = data
  const parentDisplay = patient.parentName || patient.fatherName || patient.motherName || 'N/A'

  const esc = (v: string | null | undefined) => (v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // ── Helper: colored icon badge + section header bar ──
  const sectionHeader = (icon: string, title: string, color: string) =>
    `<div style="display:flex;align-items:stretch;">
       <div style="background:${color};width:32px;min-width:32px;display:flex;align-items:center;justify-content:center;font-size:15px;border-radius:4px 0 0 0;">${icon}</div>
       <div style="background:${color};color:#fff;flex:1;padding:7px 12px;font-size:12.5px;font-weight:700;letter-spacing:0.5px;border-radius:0 4px 0 0;display:flex;align-items:center;">${title}</div>
     </div>`
  const boxBody = (inner: string, color: string) =>
    `<div style="border:1px solid ${color}66;border-top:none;padding:10px 12px;border-radius:0 0 4px 4px;font-size:12px;line-height:1.7;">${inner}</div>`
  const infoLine = (label: string, value: string) =>
    `<div style="display:flex;justify-content:space-between;padding:2px 0;"><span style="color:#6b7280;font-weight:600;">${label}:</span><span style="text-align:right;max-width:60%;">${value || 'N/A'}</span></div>`
  const summaryLine = (icon: string, bg: string, label: string, value: string, valueColor?: string) => `
    <div style="display:flex;align-items:center;gap:8px;padding:4px 0;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:${bg};color:#fff;font-size:10px;flex-shrink:0;">${icon}</span>
      <span style="flex:1;color:#374151;">${label}</span>
      <span style="font-weight:700;${valueColor ? `color:${valueColor};` : ''}">${value}</span>
    </div>`

  // ── Child Details box ──
  const childDetailsHTML = `
    ${sectionHeader('🧒', 'CHILD DETAILS', '#2563eb')}
    ${boxBody(`
      ${infoLine('Child Name', esc(patient.childName))}
      ${infoLine('Date of Birth', patient.dateOfBirth ? format(new Date(patient.dateOfBirth), 'dd MMM yyyy') : 'N/A')}
      ${infoLine('Gender', esc(patient.gender) || 'N/A')}
      ${infoLine('Parent Name', esc(parentDisplay))}
      ${infoLine('Contact', canSeeMobile ? (esc(patient.mobile) || 'N/A') : '—')}
    `, '#2563eb')}
  `

  // ── Package Details box ──
  const allPackages = packages || []
  const totalSessionsAll = allPackages.reduce((sum, p) => sum + (p.sessionsPurchased || 0), 0)
  const completedApptsForCount = (appointments || []).filter(a => a.status === 'completed')
  const actualSessionsCompleted = completedApptsForCount.length

  const packageCardsHTML = allPackages.length > 0
    ? allPackages.map((pkg, i) => {
        const pkgName = pkg.package?.name || pkg.name || 'N/A'
        const therapyType = (pkg.therapyType ?? pkg.package?.therapyType) || 'N/A'
        const sessionsPurchased = pkg.sessionsPurchased || 0
        const sessionsCompleted = pkg.sessionsCompleted || 0
        const remaining = sessionsPurchased - sessionsCompleted - (pkg.sessionsExpired || 0)
        const duration = pkg.sessionDuration ?? pkg.package?.sessionDuration ?? 30
        const totalAmount = pkg.totalAmount ?? pkg.package?.amount ?? 0
        const discount = pkg.discountAmount || 0
        const netAmount = pkg.netAmount ?? totalAmount
        const startDate = pkg.startDate ? format(new Date(pkg.startDate), 'dd MMM yyyy') : 'N/A'
        const endDate = pkg.endDate ? format(new Date(pkg.endDate), 'dd MMM yyyy') : 'N/A'
        const status = pkg.status || 'active'
        const statusColor = status === 'active' ? '#16a34a' : status === 'expired' ? '#dc2626' : '#6b7280'
        return `
          <div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;margin-bottom:${i < allPackages.length - 1 ? '10px' : '0'};background:#fafafa;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span style="font-weight:700;font-size:13px;color:#1f2937;">${esc(pkgName)}</span>
              <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:${statusColor}20;color:${statusColor};text-transform:capitalize;">${esc(status)}</span>
            </div>
            ${infoLine('Therapy Type', esc(therapyType))}
            ${infoLine('Sessions', `${sessionsCompleted} / ${sessionsPurchased} (${remaining} remaining)`)}
            ${infoLine('Session Duration', `${duration} min`)}
            ${infoLine('Total Amount', formatCurrency(totalAmount))}
            ${discount > 0 ? infoLine('Discount', formatCurrency(discount)) : ''}
            ${infoLine('Net Amount', formatCurrency(netAmount))}
            ${infoLine('Validity', `${startDate} to ${endDate}`)}
          </div>
        `
      }).join('')
    : '<p style="color:#9ca3af;text-align:center;margin:0;">No active package</p>'

  const packageDetailsHTML = `
    ${sectionHeader('🎁', 'PACKAGE DETAILS', '#16a34a')}
    ${boxBody(`
      ${infoLine('Total Sessions (All Packages)', `${totalSessionsAll} Sessions`)}
      ${infoLine('Sessions Completed', String(actualSessionsCompleted))}
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;">
        <span style="color:#6b7280;font-weight:600;font-size:12px;">Individual Package Details:</span>
      </div>
      <div style="margin-top:8px;">
        ${packageCardsHTML}
      </div>
    `, '#16a34a')}
  `

  // ── Payment Summary box (colored bullet per line) ──
  const paymentStatusLabel = getPaymentStatusLabel({
    totalPackageAmount: summary?.totalPackageAmount ?? 0,
    totalAmountPaid: summary?.totalAmountPaid ?? 0,
    pendingAmount: summary?.pendingAmount ?? 0,
    hasPackages: (summary?.totalPackageAmount ?? 0) > 0,
    hasInvoices: (summary?.totalPackageAmount ?? 0) > 0 || (summary?.totalAmountPaid ?? 0) > 0,
  })
  const paymentSummaryHTML = `
    ${sectionHeader('📄', 'PAYMENT SUMMARY', '#f59e0b')}
    ${boxBody(`
      ${summaryLine('₹', '#374151', 'Total Package Amount', formatCurrency(summary?.totalPackageAmount))}
      ${summaryLine('✓', '#16a34a', 'Total Paid Amount', formatCurrency(summary?.totalAmountPaid), '#16a34a')}
      ${summaryLine('!', '#dc2626', 'Balance Amount', formatCurrency(summary?.pendingAmount), '#dc2626')}
      ${summaryLine('i', '#2563eb', 'Payment Status', paymentStatusLabel, '#2563eb')}
    `, '#f59e0b')}
  `

  // ── Payment History box (table) ──
  const paymentsListHTML = (payments || []).length > 0
    ? `<table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead><tr style="background:#ede9fe;">
          <th style="padding:5px 6px;border:1px solid #e5e7eb;text-align:left;">Date</th>
          <th style="padding:5px 6px;border:1px solid #e5e7eb;text-align:left;">Payment Type</th>
          <th style="padding:5px 6px;border:1px solid #e5e7eb;text-align:right;">Amount (₹)</th>
          <th style="padding:5px 6px;border:1px solid #e5e7eb;text-align:left;">Reference</th>
        </tr></thead>
        <tbody>
          ${(payments || []).slice(0, 6).map((p, i) => `<tr style="background:${i % 2 === 0 ? '#fff' : '#faf9ff'};">
            <td style="padding:5px 6px;border:1px solid #e5e7eb;">${p.date ? format(new Date(p.date), 'dd MMM yyyy') : '-'}</td>
            <td style="padding:5px 6px;border:1px solid #e5e7eb;text-transform:capitalize;">${esc(p.paymentMode) || '-'}</td>
            <td style="padding:5px 6px;border:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatCurrency(p.amount)}</td>
            <td style="padding:5px 6px;border:1px solid #e5e7eb;">${esc(p.referenceNo) || '-'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`
    : '<p style="color:#9ca3af;text-align:center;margin:0;">No payment records</p>'

  const paymentHistoryHTML = `
    ${sectionHeader('📋', 'PAYMENT HISTORY', '#7c3aed')}
    ${boxBody(paymentsListHTML, '#7c3aed')}
  `

  // ── Completed Sessions table ──
  // `appointments` arrives sorted `date: desc` (most recent first) from the
  // API. Reversing gives true chronological order (oldest first) so
  // "Session No." actually reflects the session's real sequence — numbering
  // straight off the desc-sorted array would label the most recent session
  // as "#1", which is backwards.
  const completedApptsDesc = (appointments || []).filter(a => a.status === 'completed')
  const completedApptsChrono = [...completedApptsDesc].reverse()
  const completedToShow = completedApptsChrono.slice(-15) // most recent 15, in chronological order
  const completedShowOffset = completedApptsChrono.length - completedToShow.length
  const completedSessionsHTML = completedApptsChrono.length > 0
    ? `<table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#2563eb;color:#fff;">
            <th rowspan="2" style="padding:8px 6px;text-align:center;border:1px solid #e5e7eb;width:4%;font-size:13px;">#</th>
            <th rowspan="2" style="padding:8px 6px;text-align:left;border:1px solid #e5e7eb;width:12%;font-size:13px;">Date</th>
            <th rowspan="2" style="padding:8px 6px;text-align:center;border:1px solid #e5e7eb;width:8%;font-size:13px;">Session No.</th>
            <th colspan="2" style="padding:8px 6px;text-align:center;border:1px solid #e5e7eb;width:32%;font-size:13px;">Therapist Remark</th>
            <th rowspan="2" style="padding:8px 6px;text-align:left;border:1px solid #e5e7eb;width:44%;font-size:13px;">Therapist Notes</th>
          </tr>
          <tr style="background:#2563eb;color:#fff;">
            <th style="padding:6px 6px;text-align:left;border:1px solid #e5e7eb;font-size:12px;">Goal Achieved</th>
            <th style="padding:6px 6px;text-align:left;border:1px solid #e5e7eb;font-size:12px;">Goal Targeted</th>
          </tr>
        </thead>
        <tbody>
          ${completedToShow.map((a, i) => { const sessionNum = completedShowOffset + i + 1; return `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8f9fa'};">
            <td style="padding:6px;border:1px solid #e5e7eb;text-align:center;font-weight:600;font-size:12px;">${sessionNum}</td>
            <td style="padding:6px;border:1px solid #e5e7eb;font-size:12px;">${a.date ? format(new Date(a.date), 'dd MMM yyyy') : '-'}</td>
            <td style="padding:6px;border:1px solid #e5e7eb;text-align:center;font-size:12px;">${sessionNum}</td>
            <td style="padding:6px;border:1px solid #e5e7eb;font-size:12px;">${esc(a.progressAchieved) || '-'}</td>
            <td style="padding:6px;border:1px solid #e5e7eb;font-size:12px;">${esc(a.goalTargeted) || '-'}</td>
            <td style="padding:6px;border:1px solid #e5e7eb;font-size:12px;">${esc(a.sessionRemarks || a.notes) || '-'}</td>
          </tr>` }).join('')}
        </tbody>
      </table>`
    : '<p style="color:#9ca3af;text-align:center;padding:16px;font-size:13px;">No completed sessions</p>'

  const completedSessionsSection = `
    ${sectionHeader('✅', 'COMPLETED SESSIONS', '#2563eb')}
    <div style="border:1px solid #2563eb66;border-top:none;border-radius:0 0 4px 4px;">
      ${completedSessionsHTML}
    </div>
  `

  // ── Upcoming Sessions table ──
  // Same reordering issue as Completed Sessions: appointments arrive
  // `date: desc` (furthest-future first), but "upcoming" should show the
  // NEAREST session first — reverse to ascending (soonest first).
  const upcomingApptsDesc = (appointments || []).filter(a => a.status === 'scheduled' || a.status === 'confirmed')
  const upcomingApptsChrono = [...upcomingApptsDesc].reverse()
  const upcomingSessionsHTML = upcomingApptsChrono.length > 0
    ? `<table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead><tr style="background:#dcfce7;">
          <th style="padding:5px 6px;text-align:left;border:1px solid #e5e7eb;">#</th>
          <th style="padding:5px 6px;text-align:left;border:1px solid #e5e7eb;">Date</th>
          <th style="padding:5px 6px;text-align:left;border:1px solid #e5e7eb;">Session No.</th>
          <th style="padding:5px 6px;text-align:left;border:1px solid #e5e7eb;">Focus Area</th>
          <th style="padding:5px 6px;text-align:left;border:1px solid #e5e7eb;">Therapist</th>
        </tr></thead>
        <tbody>
          ${upcomingApptsChrono.slice(0, 10).map((a, i) => `<tr>
            <td style="padding:5px 6px;border:1px solid #e5e7eb;">${i + 1}</td>
            <td style="padding:5px 6px;border:1px solid #e5e7eb;">${a.date ? format(new Date(a.date), 'dd MMM yy') : '-'}</td>
            <td style="padding:5px 6px;border:1px solid #e5e7eb;">${completedApptsDesc.length + i + 1}</td>
            <td style="padding:5px 6px;border:1px solid #e5e7eb;">${esc(a.sessionFocus || resolveAppointmentTypeLabel(a.type, a.therapistId, therapists) || a.title) || '-'}</td>
            <td style="padding:5px 6px;border:1px solid #e5e7eb;">${esc(a.therapistId) || '-'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`
    : '<p style="color:#9ca3af;text-align:center;padding:12px;">No upcoming sessions</p>'

  const upcomingSessionsSection = `
    ${sectionHeader('📅', 'UPCOMING SESSIONS', '#16a34a')}
    <div style="border:1px solid #16a34a66;border-top:none;padding:8px;border-radius:0 0 4px 4px;">
      ${upcomingSessionsHTML}
    </div>
  `

  // ── Therapist Summary box (signature) ──
  const lastTherapist = (completedApptsDesc[0]?.therapistId) || (sessions || [])[0]?.therapistName || 'N/A'
  const progressLabel = actualSessionsCompleted === 0 ? 'Just Started' : actualSessionsCompleted >= totalSessionsAll && totalSessionsAll > 0 ? 'Completed' : 'Good Progress'
  const therapistSummaryHTML = `
    <div style="break-inside:avoid; page-break-inside:avoid;">
      ${sectionHeader('🎓', 'THERAPIST SUMMARY', '#f59e0b')}
      ${boxBody(`
        <table style="width:100%;border-collapse:collapse;"><tr>
          <td style="vertical-align:top;padding:0;">
            ${infoLine('Overall Progress', progressLabel)}
            ${infoLine('Sessions Completed', String(actualSessionsCompleted))}
            ${infoLine('Sessions Remaining', String(Math.max(0, totalSessionsAll - actualSessionsCompleted)))}
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;">
              <span style="color:#6b7280;font-weight:600;">Recommendations:</span>
              <p style="margin:4px 0 0 0;">Continue with the current therapy plan and practice recommended activities at home for consistent progress.</p>
            </div>
          </td>
        </tr></table>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;"><tr>
          <td style="vertical-align:bottom;padding:0;">
            ${infoLine('Therapist Name', esc(lastTherapist))}
            ${infoLine('Date', format(new Date(), 'dd MMM yyyy'))}
          </td>
          <td style="width:180px;vertical-align:bottom;text-align:center;padding:0;">
            <div style="font-family:'Brush Script MT','Segoe Script',cursive;font-size:22px;color:#0F7A87;line-height:1;">${lastTherapist !== 'N/A' ? esc(lastTherapist) : ''}</div>
            <div style="border-top:1px solid #333;margin-top:4px;padding-top:3px;width:180px;text-align:center;font-size:11px;color:#6b7280;">
              Therapist Signature
            </div>
          </td>
        </tr></table>
      `, '#f59e0b')}
    </div>
  `

  // ── Extra CSS for the rich layout ──
  // Table layout (not flexbox) for the 2-column rows below: browsers
  // fragment <table><tr> across page breaks far more predictably than
  // flex containers, which have a long-standing bug where break-inside:
  // avoid is ignored, splitting a card's fields across two pages.
  const extraCSS = `
    .doc-report-header h2 { color:#0F7A87 !important; font-size:22px !important; letter-spacing:1px; }
    .doc-report-header hr { border:none !important; border-top:2px solid #0F7A87 !important; width:70%; margin:6px auto 14px !important; }
    .phr-row { width:100%; border-collapse:separate; border-spacing:16px 0; margin-bottom:16px; table-layout:fixed; }
    .phr-row td { width:50%; vertical-align:top; padding:0; }
    .phr-therapist-summary { break-inside: avoid; page-break-inside: avoid; margin-bottom: 32px; }
    @media print {
      .phr-row, .phr-row td { break-inside:avoid; }
      .phr-therapist-summary { break-inside: avoid; page-break-inside: avoid; }
    }
  `

  const bodyHTML = `
    <table class="phr-row"><tr>
      <td>${childDetailsHTML}</td>
      <td>${packageDetailsHTML}</td>
    </tr></table>

    <table class="phr-row"><tr>
      <td>${paymentSummaryHTML}</td>
      <td>${paymentHistoryHTML}</td>
    </tr></table>

    <div style="margin-bottom:16px;">${completedSessionsSection}</div>
    <div style="margin-bottom:16px;">${upcomingSessionsSection}</div>
    <div class="phr-therapist-summary">${therapistSummaryHTML}</div>
  `

  // Header/footer bands or the full-page letterhead come from the clinic's
  // own uploads (Settings → Print Branding) via buildDocumentHTML, which
  // places the header band above the title. Nothing at all in plain mode.
  return buildDocumentHTML({
    title: 'PATIENT HISTORY REPORT',
    bodyHTML,
    footerNote: branding?.centerName ? `${branding.centerName} — Patient History Report` : undefined,
    windowTitle: `Patient History - ${patient.childName}`,
    autoPrint: false,
    extraCSS,
    mode,
    branding,
  })
}
