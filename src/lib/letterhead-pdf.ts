import type { PrintAssets, PrintMode } from '@/lib/print-branding'
import { resolvePrintMode } from '@/lib/print-branding'

/**
 * Branded PDF helper — generates a PDF with the clinic's OWN uploaded
 * branding (Settings → Print Branding) on every page, per PrintMode:
 *   letterhead    — full-page letterhead background
 *   header_footer — header band at the top, footer band at the bottom
 *   plain         — nothing
 *
 * Usage:
 *   const doc = await createLetterheadPDF({ mode, branding })
 *   // add content starting at doc.contentTopY (clears the letterhead header)
 *   autoTable(doc, { startY: doc.contentTopY, ... })
 *   doc.save('my-report.pdf')
 *
 * For multi-page documents, pass `didDrawPage` to autoTable to add the
 * letterhead to every new page (see addLetterheadToPage).
 */

/**
 * jsPDF's built-in fonts (Helvetica etc.) don't include the ₹ glyph — it
 * silently falls back to an unrelated character (renders as a stray
 * apostrophe/quote mark). Use this instead of the ₹ symbol anywhere a value
 * is placed into PDF text/table content (autoTable cells, doc.text, etc.).
 * The regular ₹-based formatter is fine for on-screen HTML, which has proper
 * font support.
 */
export function formatCurrencyForPdf(amount: number): string {
  return `Rs. ${new Intl.NumberFormat('en-IN').format(amount ?? 0)}`
}

/**
 * Re-encode any uploaded image (PNG/JPEG/WebP, data URL or path) as a PNG
 * data URL — jsPDF's addImage() can't take WebP and needs the format to match
 * the bytes — and read its natural size for aspect-correct placement.
 */
async function loadImageAsPng(src: string): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = reject
    el.src = src
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  ctx.drawImage(img, 0, 0)
  return { dataUrl: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight }
}

/**
 * A4 page dimensions in points (jsPDF default unit:pt, format:a4).
 */
export const A4_WIDTH_PT = 595.28
export const A4_HEIGHT_PT = 841.89

/**
 * Letterhead mode: where content starts (pt from the top), so it clears the
 * header area of a typical full-page letterhead (roughly the top 18%).
 */
export const CONTENT_TOP_Y = 150 // pt — clears the ~150px letterhead header

/**
 * Bottom margin (in pt) — content should end this far from the page bottom so
 * it doesn't overlap the letterhead's footer band (contact details).
 */
export const CONTENT_BOTTOM_MARGIN = 90 // pt

/**
 * Left/right content margin (in pt).
 */
export const CONTENT_SIDE_MARGIN = 40 // pt

// Plain mode / header_footer spacing. Callers draw their title up to ~34pt
// above contentTopY, so the top value must leave that much room.
const PLAIN_TOP_Y = 80
const PLAIN_BOTTOM_MARGIN = 40
const HEADER_GAP = 50
const FOOTER_GAP = 16

/**
 * Create a new jsPDF document (A4, pt units) with the clinic's branding drawn
 * on page 1 and — via a patched doc.addPage() — on every later page BEFORE
 * any table rows land on it, so branding stays underneath the content.
 * Attaches: doc.contentTopY / contentBottomY / contentLeftX / contentRightX /
 * pageWidth / pageHeight, and doc.addLetterheadToPage(pageIndex?).
 *
 * Callers draw their title a little ABOVE contentTopY (up to ~34pt), so every
 * mode leaves that much room under the header.
 *
 * Letterhead: drawn for a portrait A4 page. On landscape it is scaled to the
 * page HEIGHT (keeping its aspect ratio) and centered; CONTENT_TOP_Y /
 * CONTENT_BOTTOM_MARGIN are scaled by the same factor.
 */
export async function createLetterheadPDF(opts?: {
  orientation?: 'portrait' | 'landscape'
  format?: string
  mode?: PrintMode
  branding?: PrintAssets
}): Promise<any> {
  const jsPDF = (await import('jspdf')).default
  const orientation = opts?.orientation || 'portrait'
  const format = opts?.format || 'a4'
  const doc = new jsPDF({ orientation, unit: 'pt', format })

  const pageW = orientation === 'landscape' ? A4_HEIGHT_PT : A4_WIDTH_PT
  const pageH = orientation === 'landscape' ? A4_WIDTH_PT : A4_HEIGHT_PT

  let mode = resolvePrintMode(opts?.mode, opts?.branding)
  type Placed = { dataUrl: string; x: number; y: number; w: number; h: number }
  const layers: Placed[] = []
  let contentTopY = PLAIN_TOP_Y
  let contentBottomY = pageH - PLAIN_BOTTOM_MARGIN

  try {
    if (mode === 'letterhead') {
      const img = await loadImageAsPng(opts!.branding!.letterhead!)
      let x = 0, w = pageW, h = pageH, scale = 1
      if (orientation === 'landscape') {
        h = pageH
        w = h * (img.width / img.height)
        x = (pageW - w) / 2
        scale = pageH / A4_HEIGHT_PT
      }
      layers.push({ dataUrl: img.dataUrl, x, y: 0, w, h })
      contentTopY = CONTENT_TOP_Y * scale
      contentBottomY = pageH - CONTENT_BOTTOM_MARGIN * scale
    } else if (mode === 'header_footer') {
      // Full page width at natural aspect, capped so a tall upload can't eat
      // the page; a capped band is narrowed and centered instead of stretched.
      const band = async (src: string, maxH: number, atBottom: boolean) => {
        const img = await loadImageAsPng(src)
        let w = pageW
        let h = w * (img.height / img.width)
        if (h > maxH) { h = maxH; w = h * (img.width / img.height) }
        const placed = { dataUrl: img.dataUrl, x: (pageW - w) / 2, y: atBottom ? pageH - h : 0, w, h }
        layers.push(placed)
        return placed
      }
      const { printHeader, printFooter } = opts!.branding!
      if (printHeader) contentTopY = (await band(printHeader, pageH * 0.22, false)).h + HEADER_GAP
      if (printFooter) contentBottomY = pageH - (await band(printFooter, pageH * 0.14, true)).h - FOOTER_GAP
    }
  } catch {
    // An unreadable upload shouldn't block the export — fall back to plain.
    mode = 'plain'
    layers.length = 0
    contentTopY = PLAIN_TOP_Y
    contentBottomY = pageH - PLAIN_BOTTOM_MARGIN
  }

  ;(doc as any).addLetterheadToPage = (pageIndex?: number) => {
    if (layers.length === 0) return
    doc.setPage(pageIndex ?? doc.getCurrentPageInfo().pageNumber)
    for (const l of layers) doc.addImage(l.dataUrl, 'PNG', l.x, l.y, l.w, l.h, undefined, 'FAST')
  }

  const originalAddPage = doc.addPage.bind(doc)
  doc.addPage = (...args: any[]) => {
    const result = originalAddPage(...args)
    ;(doc as any).addLetterheadToPage()
    return result
  }

  ;(doc as any).contentTopY = contentTopY
  ;(doc as any).contentBottomY = contentBottomY
  ;(doc as any).contentLeftX = CONTENT_SIDE_MARGIN
  ;(doc as any).contentRightX = pageW - CONTENT_SIDE_MARGIN
  ;(doc as any).pageWidth = pageW
  ;(doc as any).pageHeight = pageH

  ;(doc as any).addLetterheadToPage(1)

  return doc
}

/**
 * Build a `didDrawPage` hook for jsPDF-autoTable. This hook is a NO-OP — the
 * letterhead is added to every page automatically via a monkey-patched
 * doc.addPage() (see createLetterheadPDF). The hook exists only so callers
 * that pass it don't break.
 */
export function letterheadDidDrawPage(doc: any) {
  return () => {
    // Intentionally empty — letterhead is auto-added by the patched addPage.
  }
}

/**
 * Stamp the letterhead image as a full-page background on EVERY page of the
 * document. Call this AFTER all autoTable() calls, right before doc.save().
 *
 * This is a safety net: createLetterheadPDF already patches doc.addPage() to
 * add the letterhead to each new page as it's created (BEFORE table content
 * is drawn). This function re-stamps all pages at the end to cover any edge
 * cases (e.g. pages created outside of autoTable).
 *
 * NOTE: The letterhead PNG has a white center (not transparent). To avoid
 * covering table content, this should only be called if the letterhead was
 * NOT already added via the addPage patch. In practice, calling it after
 * autoTable is safe because the addPage patch already drew the letterhead
 * BEFORE the table rows — so the table is ON TOP of the letterhead, and
 * re-stamping here would cover it. Therefore: DO NOT call this function
 * if you used autoTable with the patched doc. The addPage patch is sufficient.
 */
export function stampLetterheadOnAllPages(doc: any) {
  // Intentionally empty — the patched addPage() in createLetterheadPDF
  // already adds the letterhead to every page BEFORE table content is drawn.
  // Re-stamping here would cover the content with the letterhead's white center.
}

/**
 * autoTable margin preset that clears the letterhead header (top) and footer
 * (bottom) so table rows never overlap the branding bands.
 */
export function letterheadMargins(doc: any) {
  return {
    top: doc.contentTopY,
    // Derived from contentBottomY (already scaled for landscape by
    // createLetterheadPDF) rather than the raw portrait constant, so the
    // bottom margin still clears the footer band in landscape documents.
    bottom: doc.pageHeight - doc.contentBottomY,
    left: CONTENT_SIDE_MARGIN,
    right: CONTENT_SIDE_MARGIN,
  }
}
