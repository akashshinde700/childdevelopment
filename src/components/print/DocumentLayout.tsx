'use client'

import * as React from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { createDocumentLink, saveDocumentPdf, shareDocumentPdf, whatsappUrl } from '@/lib/document-share'
import type { PrintOutput } from '@/components/print/PrintSettingsDialog'
import { absoluteAssetUrl, resolvePrintMode, type PrintAssets, type PrintMode } from '@/lib/print-branding'

// ---------------------------------------------------------------------------
// DOCUMENT_PRINT_CSS — self-contained version of src/styles/print.css used
// when generating standalone print documents via window.open(). Mirrors the
// rules from print.css but the `.doc-content` padding is locked with
// `!important` so it can never be overridden by user-agent or injected CSS.
// ---------------------------------------------------------------------------
export const DOCUMENT_PRINT_CSS = `
  /* Force color output */
  .lh-print, .lh-print *, .doc-layout, .doc-layout * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }

  @page { size: A4 portrait; margin: 10mm 15mm 12mm 15mm; }

  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: Arial, sans-serif; color: #1f2937; font-size: 12px; line-height: 1.5; }

  /* ── Screen preview layout (matches A4 proportions) ── */
  .doc-layout { position: relative; width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; box-shadow: 0 4px 24px rgba(0,0,0,0.08); font-family: Arial, sans-serif; color: #1f2937; }

  /* ── Clinic header/footer bands (Settings → Print Branding) ──
   * In-flow, not position:fixed: fixed elements combined with multi-page
   * content proved unreliable in Chrome (bands overlapping mid-page). Once at
   * the very top, once at the very end. Uploaded images keep their own
   * aspect ratio. */
  .doc-band-header { margin: 0 0 14px 0; break-after: avoid; page-break-after: avoid; }
  .doc-band-footer { margin: 16px 0 0 0; break-before: avoid; page-break-before: avoid; }
  .doc-band-header img, .doc-band-footer img { width: 100%; height: auto; display: block; object-fit: contain; }
  .doc-band-header img { max-height: 60mm; }
  .doc-band-footer img { max-height: 35mm; }

  /* ── Report header (title/subtitle, inside body) ── */
  .doc-report-header { text-align: center; margin-bottom: 18px; word-wrap: break-word; overflow-wrap: break-word; max-width: 100%; break-after: avoid; page-break-after: avoid; }
  .doc-report-header h2 { font-size: 18px; color: #0f766e; margin: 0 0 4px; }
  .doc-report-header p { font-size: 11px; color: #555; margin: 2px 0; word-wrap: break-word; overflow-wrap: break-word; line-height: 1.5; }
  .doc-report-header .address { font-size: 9px; color: #888; word-wrap: break-word; overflow-wrap: break-word; line-height: 1.4; }
  .doc-report-header hr { border: none; border-top: none; margin: 8px 0 0; }

  /* ── Content area — no padding needed (handled by @page margins) ── */
  .doc-content { position: relative; z-index: 1; box-sizing: border-box; }

  /* ── Tables ── */
  .doc-content table, .doc-content .doc-content table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }
  .doc-content th, .doc-content td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; vertical-align: top; }
  .doc-content th { background: #f3f4f6; font-weight: 600; color: #374151; }
  .doc-content tr:nth-child(even) { background: #fafafa; }
  .doc-content tfoot tr { background: #e5e7eb !important; font-weight: 700; }

  .doc-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; }
  .doc-badge-green { background: #dcfce7; color: #15803d; }
  .doc-badge-yellow { background: #fef9c3; color: #a16207; }
  .doc-badge-red { background: #fee2e2; color: #b91c1c; }
  .doc-badge-gray { background: #f3f4f6; color: #374151; }
  .doc-badge-blue { background: #dbeafe; color: #1d4ed8; }

  /* ── Footer note (inside body, at end of content) ── */
  .doc-footer-note { text-align: center; color: #9ca3af; font-size: 10px; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; break-inside: avoid; page-break-inside: avoid; }

  /* ── Print-specific rules ── */
  @media print {
    body * { visibility: hidden; }
    .doc-layout, .doc-layout * { visibility: visible; }
    .doc-layout { box-shadow: none; margin: 0; width: 100%; min-height: auto; }

    /* Table headers repeat on each page */
    .doc-content thead { display: table-header-group; }
    .doc-content tfoot { display: table-footer-group; }

    /* Never split rows, headings, or sections across pages */
    .doc-content tr { break-inside: avoid; page-break-inside: avoid; }
    .doc-content table { break-inside: auto; }
    .doc-content h1, .doc-content h2, .doc-content h3,
    .doc-content .doc-signature, .doc-content .doc-summary-card,
    .doc-content .doc-footer-note { break-inside: avoid; page-break-inside: avoid; }

    /* Keep headings with their following content */
    .doc-content h1, .doc-content h2, .doc-content h3 { break-after: avoid; page-break-after: avoid; }
  }
`

// ---------------------------------------------------------------------------
// buildDocumentHTML — produces a self-contained HTML document string for
// window.open()-based printing. The returned HTML inlines DOCUMENT_PRINT_CSS
// so it works without loading the host application's stylesheet.
// ---------------------------------------------------------------------------
export interface BuildDocumentHTMLOpts {
  /** Report title shown in the `.doc-report-header` (required). */
  title: string
  /** Optional subtitle line shown under the title (e.g. "Period: 01 Jun 2026 to 30 Jun 2026"). */
  subtitle?: string
  /** Optional center address line shown small under the subtitle. */
  centerAddress?: string
  /** Optional centered footer note rendered at the end of the content area. */
  footerNote?: string
  /** Inner HTML of the document body — typically per-category table HTML. */
  bodyHTML: string
  /** Optional extra CSS appended after DOCUMENT_PRINT_CSS. */
  extraCSS?: string
  /** Title used in the `<title>` tag of the new window. Defaults to `opts.title`. */
  windowTitle?: string
  /** When true (default), injects `<script>window.print();</script>` after the body. */
  autoPrint?: boolean
  /** How to brand the page (see PrintMode). Defaults to 'plain'. A mode whose
   * image was never uploaded falls back to 'plain'. */
  mode?: PrintMode
  /** The clinic's uploaded header/footer/letterhead (from /api/settings/branding). */
  branding?: PrintAssets
  /** When true, skips the built-in `.doc-report-header` title block (title/hr) —
   * use when bodyHTML supplies its own title. The header band still renders first. */
  hideBuiltInTitle?: boolean
}

export function buildDocumentHTML(opts: BuildDocumentHTMLOpts): string {
  const {
    title,
    subtitle,
    centerAddress,
    footerNote,
    bodyHTML,
    extraCSS,
    windowTitle,
    autoPrint = true,
    hideBuiltInTitle = false,
  } = opts
  const mode = resolvePrintMode(opts.mode, opts.branding)

  // ── Letterhead mode ──
  // The clinic's uploaded full-page letterhead is a fixed background on every
  // page. Content is rendered inside the writable area only — no
  // logo/name/address duplication (they're already on the letterhead).
  if (mode === 'letterhead') {
    const resolvedLetterhead = absoluteAssetUrl(opts.branding?.letterhead)
    const letterheadCSS = `
      @page { size: A4 portrait; margin: 0; }
      html, body { margin: 0; padding: 0; background: #fff; }
      body { font-family: Arial, sans-serif; color: #1f2937; font-size: 12px; line-height: 1.5; }
      /* Locked with !important so a browser extension that injects its own
         text-color/highlight styling (e.g. a writing-assistant extension
         recoloring plain-text content it's analyzing) can't recolor the
         printed document's body text. */
      .lh-content, .lh-content * {
        color: #1f2937 !important;
        -webkit-text-fill-color: #1f2937 !important;
        text-decoration: none !important;
      }
      .lh-content h2, .lh-content h3 { color: #0f766e !important; }
      .lh-bg {
        position: fixed;
        top: 0; left: 0;
        width: 210mm; height: 297mm;
        z-index: 0;
        pointer-events: none;
      }
      .lh-bg img { width: 100%; height: 100%; object-fit: fill; }
      .lh-content {
        position: relative;
        z-index: 1;
        padding: 55mm 15mm 35mm 15mm;
        box-sizing: border-box;
        min-height: 297mm;
      }
      .lh-content h2 { font-size: 16px; color: #0f766e; margin: 0 0 6px; }
      .lh-content h3 { font-size: 13px; color: #0f766e; margin: 14px 0 6px; break-after: avoid; page-break-after: avoid; }
      .lh-content table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11px; }
      .lh-content th, .lh-content td { border: 1px solid #d1d5db; padding: 5px 7px; text-align: left; vertical-align: top; }
      .lh-content th { background: #f3f4f6; font-weight: 600; color: #374151; }
      .lh-content tr { break-inside: avoid; page-break-inside: avoid; }
      .lh-content p { margin: 4px 0; }
      @media print {
        .lh-bg { position: fixed; top: 0; left: 0; width: 100%; height: 100vh; }
        .lh-content { min-height: auto; }
        .lh-content thead { display: table-header-group; }
      }
    `

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHTML(windowTitle ?? title)}</title>
  <style>
    ${letterheadCSS}
    ${extraCSS || ''}
  </style>
</head>
<body>
  <div class="lh-bg">
    <img src="${escapeHTML(resolvedLetterhead)}" alt="" />
  </div>
  <div class="lh-content">
    ${hideBuiltInTitle ? '' : `
    <h2>${escapeHTML(title)}</h2>
    ${subtitle ? `<p style="font-size:11px;color:#555;margin:2px 0 8px;">${escapeHTML(subtitle)}</p>` : ''}
    <hr style="border:none;margin:0 0 12px;" />
    `}
    ${bodyHTML}
  </div>
  ${autoPrint ? '<script>window.onload = function () { window.focus(); var goBack = function () { if (window.opener && !window.opener.closed) { window.opener.focus(); } window.close(); }; window.onafterprint = goBack; window.print(); goBack(); };<\/script>' : ''}
</body>
</html>`
  }

  // ── Header & footer / plain ──
  const headerSrc = mode === 'header_footer' ? absoluteAssetUrl(opts.branding?.printHeader) : ''
  const footerSrc = mode === 'header_footer' ? absoluteAssetUrl(opts.branding?.printFooter) : ''
  const headerBandHTML = headerSrc
    ? `<div class="doc-band-header"><img src="${escapeHTML(headerSrc)}" alt="" /></div>`
    : ''
  const footerBandHTML = footerSrc
    ? `<div class="doc-band-footer"><img src="${escapeHTML(footerSrc)}" alt="" /></div>`
    : ''

  const headerHTML = hideBuiltInTitle ? '' : `
    <div class="doc-report-header">
      <h2>${escapeHTML(title)}</h2>
      ${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ''}
      ${centerAddress ? `<p class="address">${escapeHTML(centerAddress)}</p>` : ''}
      <hr />
    </div>`.trim()

  const footerNoteHTML = footerNote
    ? `<p class="doc-footer-note">${escapeHTML(footerNote)}</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHTML(windowTitle ?? title)}</title>
  <style>${DOCUMENT_PRINT_CSS}${extraCSS ? `\n${extraCSS}` : ''}</style>
</head>
<body>
  <div class="doc-layout">
    <div class="doc-content">
      ${headerBandHTML}
      ${headerHTML}
      ${bodyHTML}
      ${footerNoteHTML}
      ${footerBandHTML}
    </div>
  </div>
  ${autoPrint ? '<script>window.onload = function () { window.focus(); var goBack = function () { if (window.opener && !window.opener.closed) { window.opener.focus(); } window.close(); }; window.onafterprint = goBack; window.print(); goBack(); };<\/script>' : ''}
</body>
</html>`
}

// ---------------------------------------------------------------------------
// buildInvoiceHTML — premium 8-section invoice matching the clinic's
// brand reference design. Blue + Green + White theme with multi-color section
// headers, child details, payment information (bank + QR), and thank-you footer.
// ---------------------------------------------------------------------------

export interface InvoiceLineItem {
  description: string
  packageOrService?: string
  quantity: number
  rate: number
  amount: number
}

export interface BuildInvoiceHTMLOpts {
  invoiceNo: string
  date: string
  dueDate?: string
  type: string
  // Patient / bill-to
  childName: string
  patientId: string
  parentName?: string
  contact?: string
  address?: string
  // Child details
  dateOfBirth?: string
  therapistName?: string
  childPhotoUrl?: string
  // Line items
  items: InvoiceLineItem[]
  // Totals
  subtotal: number
  discount: number
  gstApplicable: boolean
  cgst: number
  sgst: number
  totalAmount: number
  amountPaid: number
  balanceDue: number
  // Center info
  centerName: string
  centerAddress: string
  centerPhone: string
  centerEmail: string
  gstNumber?: string
  website?: string
  // Payment / bank info
  bankName?: string
  bankBranch?: string
  bankAccountName?: string
  accountNumber?: string
  ifscCode?: string
  bankAccountType?: string
  upiId?: string
  // Notes / terms (string = single note; string[] = bullet list)
  notes?: string | string[]
  // Signature
  signatoryName?: string
  signatoryTitle?: string
  signatoryImageUrl?: string
  // QR code image URL / data URL. No default — the QR box is hidden when
  // the clinic hasn't uploaded one (never show another clinic's QR).
  qrCodeSrc?: string
  // Header/footer band images (URL or data URL) from the clinic's Print
  // Branding settings. When absent, a neutral text header/footer built from
  // centerName/centerAddress renders instead — prints must NEVER fall back
  // to another clinic's branded artwork.
  headerImageUrl?: string
  footerImageUrl?: string
  // Auto-print
  autoPrint?: boolean
}

function formatINR(amount: number): string {
  return `₹${(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export function buildInvoiceHTML(opts: BuildInvoiceHTMLOpts): string {
  const {
    invoiceNo, date, dueDate, type,
    childName, patientId, parentName, contact, address,
    dateOfBirth, therapistName, childPhotoUrl,
    items,
    subtotal, discount, gstApplicable, cgst, sgst, totalAmount, amountPaid, balanceDue,
    centerName, centerAddress, centerPhone, centerEmail, gstNumber, website,
    bankName, bankBranch, bankAccountName, accountNumber, ifscCode, bankAccountType, upiId,
    notes,
    signatoryName = centerName,
    signatoryTitle = 'Authorized Signature',
    qrCodeSrc,
    autoPrint = true,
  } = opts

  // Resolve the logo + QR code + child photo to absolute URLs (new window is about:blank)
  const resolveUrl = (src?: string) => {
    if (!src) return ''
    if (src.startsWith('http') || src.startsWith('data:')) return src
    if (typeof window !== 'undefined') return window.location.origin + src
    return src
  }
  const headerImgUrl = resolveUrl(opts.headerImageUrl)
  const footerImgUrl = resolveUrl(opts.footerImageUrl)
  const qrUrl = resolveUrl(qrCodeSrc)
  const photoUrl = resolveUrl(childPhotoUrl)
  const signatoryImage = resolveUrl(opts.signatoryImageUrl)

  const cgstPct = gstApplicable && (subtotal - discount) > 0 ? Math.round((cgst / (subtotal - discount)) * 100) : 9
  const sgstPct = gstApplicable && (subtotal - discount) > 0 ? Math.round((sgst / (subtotal - discount)) * 100) : 9

  const itemsRows = items.length > 0
    ? items.map((item, i) => `
      <tr>
        <td style="text-align:center;">${i + 1}</td>
        <td>${escapeHTML(item.description)}</td>
        <td style="text-align:center;">${escapeHTML(item.packageOrService || '—')}</td>
        <td style="text-align:center;">${item.quantity}</td>
        <td style="text-align:right;">${formatINR(item.rate)}</td>
        <td style="text-align:right;">${formatINR(item.amount)}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;padding:12px;color:#999;">No line items</td></tr>'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Invoice ${escapeHTML(invoiceNo)}</title>
  <style>
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; box-sizing: border-box; }
    @page { size: A4 portrait; margin: 8mm; }
    html, body { margin: 0; padding: 0; background: #f8fbff; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #17233d; font-size: 10.5px; line-height: 1.35; }
    .invoice-sheet { width: 210mm; max-width: 100%; margin: 0 auto; padding: 8mm; background: #ffffff; border-radius: 12px; box-shadow: 0 14px 45px rgba(15, 55, 95, 0.08); position: relative; }
    /* Clinic header/footer band images (Settings → Print Branding uploads)
       — same asset + in-flow (not position:fixed) approach used by the
       Patient History report, so both documents share one consistent brand
       header/footer instead of the invoice's own logo+title+contact strip. */
    .inv-clinic-header { margin: 0 0 12px 0; break-after: avoid; page-break-after: avoid; }
    .inv-clinic-header img { width: 100%; height: auto; max-height: 60mm; object-fit: contain; display: block; }
    .inv-clinic-footer { margin: 14px 0 0 0; break-before: avoid; page-break-before: avoid; }
    .inv-clinic-footer img { width: 100%; height: auto; max-height: 35mm; object-fit: contain; display: block; }
    .inv-title-block { text-align: center; margin-bottom: 10px; }
    .inv-title-block .center-name { font-size: 18px; font-weight: 800; color: #0F7A87; line-height: 1.05; letter-spacing: 0.02em; }
    .inv-title-block .center-tag { font-size: 9.5px; color: #0F7A87; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.08em; }
    .inv-meta-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
    .inv-meta-card { background: #eef6ff; border: 1px solid #dbe8ff; border-radius: 10px; padding: 8px 10px; }
    .inv-meta-card .label { font-size: 8.8px; color: #4b5563; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
    .inv-meta-card .value { margin-top: 3px; font-size: 11px; font-weight: 700; color: #11264d; }
    .two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
    .card { border: 1px solid #dde7ff; border-radius: 14px; overflow: hidden; background: #ffffff; }
    .card .hdr { padding: 8px 10px; background: linear-gradient(90deg, #2f67c7, #0d44b7); color: #ffffff; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; }
    .card .body { padding: 10px; display: grid; gap: 6px; }
    .card .item { display: grid; grid-template-columns: 100px 1fr; gap: 8px; font-size: 10px; }
    .card .item .label { color: #6b7280; font-weight: 700; }
    .card .item .value { color: #111827; font-weight: 700; }
    .inv-table-wrap { margin-top: 14px; overflow: hidden; border-radius: 14px; border: 1px solid #dde7ff; }
    .inv-table-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: linear-gradient(90deg, #0f57b0, #0d3fa6); color: #fff; font-size: 11px; font-weight: 800; }
    .inv-table { width: 100%; border-collapse: collapse; font-size: 10px; }
    .inv-table th, .inv-table td { border-bottom: 1px solid #e7eefb; padding: 8px 8px; vertical-align: middle; }
    .inv-table th { background: #f3f7ff; color: #0F7A87; font-weight: 800; text-align: left; font-size: 9.8px; }
    .inv-table td { color: #1f2937; }
    .inv-table tbody tr:last-child td { border-bottom: none; }
    .inv-table tfoot td { padding: 10px 8px; background: #f7fbff; font-weight: 700; color: #0F7A87; }
    .inv-table td.number, .inv-table th.number { text-align: right; }
    .pay-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
    .pay-card { border: 1px solid #dde7ff; border-radius: 14px; background: #ffffff; overflow: hidden; }
    .pay-card .hdr { padding: 8px 10px; background: linear-gradient(90deg, #00a5c4, #0d8ab1); color: #ffffff; font-size: 10px; font-weight: 800; }
    .pay-card .body { padding: 10px; display: grid; gap: 6px; }
    .pay-card .row { display: flex; justify-content: space-between; gap: 8px; font-size: 10px; }
    .pay-card .row .label { color: #4b5563; font-weight: 700; }
    .pay-card .row .value { color: #111827; font-weight: 800; text-align: right; }
    .pay-card .qr-box { margin-top: 8px; display: grid; gap: 6px; justify-items: center; }
    .pay-card .qr-box img { width: 92px; height: 92px; object-fit: contain; border-radius: 12px; border: 1px solid #e2edfb; }
    .pay-card .qr-label { font-size: 9px; color: #0F7A87; font-weight: 700; }
    .bottom-row { display: grid; grid-template-columns: 1.4fr 0.9fr; gap: 10px; margin-top: 12px; }
    .notes { border: 1px solid #dde7ff; border-radius: 14px; padding: 10px; background: #fafcff; }
    .notes .hdr { font-size: 10px; color: #0F7A87; font-weight: 800; margin-bottom: 8px; }
    .notes ul { list-style: disc inside; margin: 0; padding: 0; display: grid; gap: 4px; color: #334155; font-size: 9.8px; }
    .thank { border-radius: 14px; padding: 12px 14px; background: linear-gradient(180deg, #e2f2ff 0%, #ffffff 100%); display: grid; gap: 8px; align-items: center; justify-items: center; text-align: center; }
    .thank .title { font-size: 13px; font-weight: 800; color: #0F7A87; }
    .thank .subtitle { font-size: 9.8px; color: #475569; }
    .thank .sign { width: 100%; border-top: 1px solid #dbe8ff; padding-top: 10px; }
    .sign-image { width: 160px; max-width: 100%; height: auto; display: block; margin: 0 auto 8px; }
    .sign-label { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
    .sign-name { font-size: 12px; font-weight: 800; color: #111827; }
    .sign-title { font-size: 9.5px; color: #475569; }
    .values-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
    .value-pill { background: #eef6ff; border: 1px solid #d6e5ff; border-radius: 12px; padding: 10px 12px; display: flex; align-items: center; gap: 10px; }
    .pill { width: 34px; height: 34px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: #ffffff; font-weight: 800; font-size: 11px; }
    .pill.comp { background: #4b8edc; }
    .pill.growth { background: #21a26f; }
    .pill.excel { background: #f0a33b; }
    .pill.trust { background: #7f6ef3; }
    .value-label { display: grid; gap: 2px; font-size: 9px; color: #334155; }
    .value-label .title { font-weight: 700; color: #0F7A87; }
    @media print {
      html, body { width: 210mm; height: 297mm; }
      body { background: #ffffff; }
      .invoice-sheet { box-shadow: none; margin: 0; padding: 8mm; page-break-after: always; }
      .invoice-sheet, .two-col, .pay-row, .bottom-row, .inv-table-wrap, .notes, .thank { break-inside: avoid; page-break-inside: avoid; }
      img { max-width: 100%; height: auto; }
      .inv-clinic-header img, .inv-clinic-footer img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="invoice-sheet">
    ${headerImgUrl
      ? `<div class="inv-clinic-header"><img src="${escapeHTML(headerImgUrl)}" alt="header" /></div>`
      : ''}
    <div class="inv-title-block">
      <div class="center-name">INVOICE</div>
      <div class="center-tag">Billing Summary</div>
    </div>

    <div class="inv-meta-row">
      <div class="inv-meta-card"><div class="label">Invoice No</div><div class="value">${escapeHTML(invoiceNo)}</div></div>
      <div class="inv-meta-card"><div class="label">Invoice Date</div><div class="value">${escapeHTML(date)}</div></div>
      <div class="inv-meta-card"><div class="label">Due Date</div><div class="value">${escapeHTML(dueDate || date)}</div></div>
      <div class="inv-meta-card"><div class="label">Invoice Type</div><div class="value">${escapeHTML(type)}</div></div>
    </div>

    <div class="two-col">
      <div class="card">
        <div class="hdr">BILL TO</div>
        <div class="body">
          <div class="item"><span class="label">Child Name</span><span class="value">${escapeHTML(childName)}</span></div>
          ${parentName ? `<div class="item"><span class="label">Parent</span><span class="value">${escapeHTML(parentName)}</span></div>` : ''}
          ${contact ? `<div class="item"><span class="label">Contact</span><span class="value">${escapeHTML(contact)}</span></div>` : ''}
          ${address ? `<div class="item"><span class="label">Address</span><span class="value">${escapeHTML(address)}</span></div>` : ''}
        </div>
      </div>
      <div class="card">
        <div class="hdr">CHILD DETAILS</div>
        <div class="body" style="display:grid;gap:8px;">
          <div class="item"><span class="label">Patient ID</span><span class="value">${escapeHTML(patientId || '—')}</span></div>
          ${dateOfBirth ? `<div class="item"><span class="label">DOB</span><span class="value">${escapeHTML(dateOfBirth)}</span></div>` : ''}
          ${therapistName ? `<div class="item"><span class="label">Therapist</span><span class="value">${escapeHTML(therapistName)}</span></div>` : ''}
        </div>
      </div>
    </div>

    <div class="inv-table-wrap">
      <div class="inv-table-header">Invoice Details</div>
      <table class="inv-table">
        <thead>
          <tr>
            <th class="number" style="width:5%;">S.No</th>
            <th style="width:36%;">Description</th>
            <th style="width:18%;">Package / Service</th>
            <th class="number" style="width:10%;">Qty</th>
            <th class="number" style="width:14%;">Rate</th>
            <th class="number" style="width:17%;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="5" style="text-align:right;">Total</td>
            <td class="number">${formatINR(items.reduce((sum, item) => sum + item.amount, 0))}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="pay-row">
      <div class="pay-card">
        <div class="hdr">PAYMENT SUMMARY</div>
        <div class="body">
          <div class="row"><span class="label">Subtotal</span><span class="value">${formatINR(subtotal)}</span></div>
          ${discount > 0 ? `<div class="row"><span class="label">Discount</span><span class="value">-${formatINR(discount)}</span></div>` : ''}
          ${gstApplicable ? `<div class="row"><span class="label">CGST (${cgstPct}%)</span><span class="value">${formatINR(cgst)}</span></div>
          <div class="row"><span class="label">SGST (${sgstPct}%)</span><span class="value">${formatINR(sgst)}</span></div>` : ''}
          <div class="row" style="margin-top:6px;border-top:1px solid #ebf3ff;padding-top:6px;"><span class="label">Total Amount</span><span class="value">${formatINR(totalAmount)}</span></div>
          <div class="row"><span class="label">Paid</span><span class="value">${formatINR(amountPaid)}</span></div>
          <div class="row"><span class="label">Balance Due</span><span class="value">${formatINR(balanceDue)}</span></div>
        </div>
      </div>
      ${(() => {
        // Only the clinic's OWN configured details — never a hardcoded
        // fallback account. When NOTHING is configured, the whole Payment
        // Information box is omitted from the print (explicit product
        // decision: blank until the clinic adds its own details).
        const rows: Array<[string, string | undefined]> = [
          ['Bank', bankName], ['Branch', bankBranch], ['Account', bankAccountName],
          ['A/C No.', accountNumber], ['IFSC', ifscCode], ['UPI', upiId],
        ]
        const rowHtml = rows
          .filter(([, v]) => v && String(v).trim())
          .map(([label, v]) => `<div class="row"><span class="label">${escapeHTML(label)}</span><span class="value">${escapeHTML(String(v))}</span></div>`)
          .join('')
        const qrHtml = qrUrl
          ? `<div class="qr-box"><div class="qr-label">Scan and Pay</div><img src="${escapeHTML(qrUrl)}" alt="QR Code" /></div>`
          : ''
        if (!rowHtml && !qrHtml) return ''
        return `<div class="pay-card"><div class="hdr">PAYMENT INFORMATION</div><div class="body">${rowHtml}${qrHtml}</div></div>`
      })()}
    </div>

    <div class="bottom-row">
      <div class="notes">
        <div class="hdr">Important Notes</div>
        <ul>
          ${(() => {
            const defaultNotes = [
              'Please make the payment before the due date to avoid interruption in services.',
              'This is a computer generated invoice and does not require signature.',
              'Payment once made will not be refunded.',
              'For any queries, please contact us on the above details.',
            ]
            const notesList = notes
              ? (Array.isArray(notes) ? notes : [notes])
              : defaultNotes
            return notesList.length === 0 ? '' : notesList.map(n => `<li>${escapeHTML(n)}</li>`).join('')
          })()}
        </ul>
      </div>
      <div class="thank">
        <div class="title">Thank You!</div>
        <div class="subtitle">We appreciate your trust in ${escapeHTML(centerName)}</div>
        <div class="sign">
          <div class="sign-label">For ${escapeHTML(centerName)}</div>
          ${signatoryImage ? `<img class="sign-image" src="${escapeHTML(signatoryImage)}" alt="${escapeHTML(signatoryTitle)}" />` : ''}
          ${signatoryImage ? '' : `<div class="sign-name">${escapeHTML(signatoryName)}</div>`}
          ${signatoryImage ? '' : `<div class="sign-title">${escapeHTML(signatoryTitle)}</div>`}
        </div>
      </div>
    </div>

    <div class="values-row">
      <div class="value-pill"><span class="pill comp">C</span><div class="value-label"><span class="title">Center</span><span>${escapeHTML(centerName)}</span></div></div>
      <div class="value-pill"><span class="pill growth">T</span><div class="value-label"><span class="title">Type</span><span>${escapeHTML(type)}</span></div></div>
      <div class="value-pill"><span class="pill excel">P</span><div class="value-label"><span class="title">Paid</span><span>${formatINR(amountPaid)}</span></div></div>
      <div class="value-pill"><span class="pill trust">B</span><div class="value-label"><span class="title">Balance</span><span>${formatINR(balanceDue)}</span></div></div>
    </div>

    ${footerImgUrl
      ? `<div class="inv-clinic-footer"><img src="${escapeHTML(footerImgUrl)}" alt="footer" /></div>`
      : ''}
  </div>
  ${autoPrint ? '<script>window.onload = function () { window.focus(); var goBack = function () { if (window.opener && !window.opener.closed) { window.opener.focus(); } window.close(); }; window.onafterprint = goBack; window.print(); goBack(); };<\/script>' : ''}
</body>
</html>`
}

// ---------------------------------------------------------------------------
// printHTMLDocument — prints a self-contained HTML string (from
// buildDocumentHTML/buildInvoiceHTML) via a hidden same-page <iframe> instead
// of window.open('', '_blank'). This avoids the browser's "about:blank" tab
// that briefly appears with the popup approach — nothing new ever opens, no
// window.close()/redirect timing to get right, no popup-blocker to handle.
// Call with autoPrint: false on the builder so it doesn't also inject its own
// window.print() script (that script targets the popup-window flow only).
// ---------------------------------------------------------------------------
export function printHTMLDocument(html: string, onDone?: () => void): void {
  if (typeof window === 'undefined') return

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.visibility = 'hidden'
  document.body.appendChild(iframe)

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    onDone?.()
  }

  iframe.onload = () => {
    const win = iframe.contentWindow
    if (!win) { cleanup(); return }
    win.onafterprint = cleanup
    win.focus()
    win.print()
    // Fallback in case onafterprint never fires (some browsers skip it).
    setTimeout(cleanup, 60000)
  }

  const doc = iframe.contentDocument || iframe.contentWindow?.document
  if (!doc) { cleanup(); return }
  doc.open()
  doc.write(html)
  doc.close()
}

// ---------------------------------------------------------------------------
// deliverDocument — one call site for "what happens to this document":
// print it, save it as a PDF, or hand it to the device's share sheet
// (WhatsApp / Files / Mail). Which one is chosen in PrintSettingsDialog.
// ---------------------------------------------------------------------------
export async function deliverDocument(
  html: string,
  output: PrintOutput,
  opts: {
    fileName: string
    shareTitle?: string
    shareText?: string
    /** For the WhatsApp-link output: whose chat to open, and what to label it. */
    patientId?: string
    patientPhone?: string
    onDone?: () => void
  },
): Promise<void> {
  if (output === 'print') {
    printHTMLDocument(html, opts.onDone)
    return
  }
  try {
    if (output === 'link') {
      // A plain link in a WhatsApp message — works on WhatsApp Web, no
      // attachment and no share sheet. Opening it downloads the PDF.
      const url = await createDocumentLink(html, opts.fileName, {
        title: opts.shareTitle,
        patientId: opts.patientId,
      })
      try { await navigator.clipboard.writeText(url) } catch { /* clipboard is a bonus */ }
      const message = `${opts.shareText || opts.shareTitle || 'Document'}
${url}`
      window.open(whatsappUrl(opts.patientPhone, message), '_blank', 'noopener')
      toast.success(
        opts.patientPhone
          ? 'WhatsApp opened with the link — link also copied'
          : 'Link copied — paste it into the chat'
      )
      return
    }
    if (output === 'share') {
      const shared = await shareDocumentPdf(html, opts.fileName, {
        title: opts.shareTitle,
        text: opts.shareText,
      })
      // Device can't attach files to a share — saving is the useful fallback.
      if (!shared) {
        await saveDocumentPdf(html, opts.fileName)
        toast.success('Saved as PDF — this device can’t share files directly')
      }
    } else {
      await saveDocumentPdf(html, opts.fileName)
      toast.success('Saved as PDF')
    }
  } catch (err) {
    console.error('deliverDocument failed:', err)
    const what = output === 'share' ? 'share the document'
      : output === 'link' ? 'create the WhatsApp link'
      : 'save the PDF'
    toast.error(`Could not ${what}`)
  } finally {
    opts.onDone?.()
  }
}

// Escape user-controlled text that gets interpolated into HTML — prevents
// stray angle-brackets in titles/addresses from breaking the document.
export function escapeHTML(value: unknown): string {
  if (value == null) return ''
  const str = String(value)
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ---------------------------------------------------------------------------
// React component — on-screen preview wrapper that mirrors the structure of
// the standalone print document.
// ---------------------------------------------------------------------------
export interface DocumentLayoutProps {
  title: string
  subtitle?: string
  centerAddress?: string
  footerNote?: string
  children: React.ReactNode
  onPrint?: () => void
  hideToolbar?: boolean
  className?: string
}

export function DocumentLayout({
  title,
  subtitle,
  centerAddress,
  footerNote,
  children,
  onPrint,
  hideToolbar = false,
  className,
}: DocumentLayoutProps) {
  const handlePrint = React.useCallback(() => {
    if (typeof onPrint === 'function') {
      onPrint()
      return
    }
    if (typeof window !== 'undefined') {
      window.print()
    }
  }, [onPrint])

  return (
    <div className={`lh-print ${className ?? ''}`.trim()}>
      {!hideToolbar && (
        <div className="lh-no-print flex items-center justify-between gap-3 mb-4 print:!hidden">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-800 truncate">{title}</h2>
            <p className="text-xs text-gray-500">
              Document preview · use the Print button to save as PDF
            </p>
          </div>
          <Button type="button" onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      )}

      <div className="doc-layout">
        <div className="doc-content">
          <div className="doc-report-header">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
            {centerAddress && <p className="address">{centerAddress}</p>}
            <hr />
          </div>
          {children}
          {footerNote && <p className="doc-footer-note">{footerNote}</p>}
        </div>
      </div>
    </div>
  )
}

export default DocumentLayout
