'use client'

// Turning a print document into a file the user can keep or send.
//
// The app's print documents are self-contained HTML strings (see
// buildDocumentHTML / buildInvoiceHTML). Printing them is enough on a
// desktop, but on an installed iPad/Android app staff also need to save a
// copy and send it to the parent. Both of those need a real file, so the
// HTML is rendered offscreen and turned into a PDF here.
//
// Sharing goes through the device's own share sheet (Web Share API with
// files — iOS Safari 15+, Android Chrome). That is what puts WhatsApp,
// Files/Drive and Mail in front of the user. The WhatsApp contact is chosen
// in that sheet: the web platform gives no way to attach a file to one
// specific chat, so a prefilled wa.me link (text only) and an attached file
// are mutually exclusive.

const A4_WIDTH_PX = 794 // A4 width at 96dpi — the width documents are laid out for
const A4_RATIO = 297 / 210

/** Render a standalone HTML document offscreen and snapshot it. */
async function renderToCanvas(html: string): Promise<HTMLCanvasElement> {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${A4_WIDTH_PX}px`,
    height: '1px',
    border: '0',
    visibility: 'hidden',
  })
  document.body.appendChild(iframe)

  try {
    const doc = iframe.contentDocument
    if (!doc) throw new Error('Could not prepare the document')
    doc.open()
    doc.write(html)
    doc.close()

    // Let layout settle and every image (logo, header/footer bands, QR,
    // signature) finish loading — html2canvas draws whatever is ready, so a
    // half-loaded letterhead would silently come out blank.
    await new Promise<void>((resolve) => {
      if (doc.readyState === 'complete') resolve()
      else iframe.onload = () => resolve()
      setTimeout(resolve, 3000)
    })
    await Promise.all(
      Array.from(doc.images).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve()
              img.onerror = () => resolve()
              setTimeout(resolve, 3000)
            }),
      ),
    )

    const body = doc.body
    iframe.style.height = `${Math.max(body.scrollHeight, 100)}px`

    const html2canvas = (await import('html2canvas')).default
    return await html2canvas(body, {
      scale: 2, // readable text without an unreasonably large file
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: A4_WIDTH_PX,
      width: A4_WIDTH_PX,
      height: body.scrollHeight,
    })
  } finally {
    iframe.remove()
  }
}

/** Build an A4 PDF from a print-document HTML string. */
export async function htmlToPdfBlob(html: string): Promise<Blob> {
  const canvas = await renderToCanvas(html)
  const jsPDF = (await import('jspdf')).default
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  // Slice the full-height snapshot into A4-tall pages.
  const sliceHeight = Math.floor(canvas.width * A4_RATIO)
  const pages = Math.max(1, Math.ceil(canvas.height / sliceHeight))

  for (let i = 0; i < pages; i++) {
    const h = Math.min(sliceHeight, canvas.height - i * sliceHeight)
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = h
    const ctx = slice.getContext('2d')
    if (!ctx) throw new Error('Could not prepare the page')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, slice.width, slice.height)
    ctx.drawImage(canvas, 0, i * sliceHeight, canvas.width, h, 0, 0, canvas.width, h)

    if (i > 0) doc.addPage()
    doc.addImage(
      slice.toDataURL('image/jpeg', 0.92),
      'JPEG',
      0,
      0,
      pageW,
      (h / canvas.width) * pageW,
      undefined,
      'FAST',
    )
    if ((h / canvas.width) * pageW > pageH + 1) {
      // Shouldn't happen — the slice is cut to the page ratio — but never
      // let a rounding error push content off the page silently.
      console.warn('PDF page slice taller than the page')
    }
  }

  return doc.output('blob')
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^\w\s.-]+/g, ' ').replace(/\s+/g, ' ').trim()
  const base = (cleaned || 'document').slice(0, 80)
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`
}

/** True when this device can share actual files (iPad/Android share sheet). */
export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare || !navigator.share) return false
  try {
    return navigator.canShare({ files: [new File(['test'], 'test.pdf', { type: 'application/pdf' })] })
  } catch {
    return false
  }
}

/** Save the document to the device (iPad: share sheet → Save to Files). */
export async function saveDocumentPdf(html: string, fileName: string): Promise<void> {
  const blob = await htmlToPdfBlob(html)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeFileName(fileName)
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoked late so the download has definitely started on slower devices.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Hand the document to the device's share sheet with the PDF attached, so
 * the user can pick WhatsApp (then the chat), Files, Mail, etc.
 * Returns false when the device can't share files — caller should save
 * instead. A share the user cancels is not an error.
 */
export async function shareDocumentPdf(
  html: string,
  fileName: string,
  opts?: { title?: string; text?: string },
): Promise<boolean> {
  if (!canShareFiles()) return false
  const blob = await htmlToPdfBlob(html)
  const file = new File([blob], safeFileName(fileName), { type: 'application/pdf' })
  if (!navigator.canShare({ files: [file] })) return false
  try {
    await navigator.share({ files: [file], title: opts?.title, text: opts?.text })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return true // user closed the sheet
    throw err
  }
  return true
}

/**
 * Publish the document behind a share link and return its URL. The link
 * needs no login — it is how a parent, who has no account, opens what staff
 * sent them — so it is only ever handed to the person staff choose.
 */
export async function createDocumentLink(
  html: string,
  fileName: string,
  opts?: { title?: string; patientId?: string },
): Promise<string> {
  const { authFetch } = await import('@/lib/api-client')
  const blob = await htmlToPdfBlob(html)
  const form = new FormData()
  form.append('file', new File([blob], safeFileName(fileName), { type: 'application/pdf' }))
  form.append('fileName', safeFileName(fileName))
  if (opts?.title) form.append('title', opts.title)
  if (opts?.patientId) form.append('patientId', opts.patientId)

  const res = await authFetch('/api/documents/share', { method: 'POST', body: form })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Could not create the share link')
  return json.url as string
}

/** WhatsApp chat link for a number, with the message prefilled. */
export function whatsappUrl(phone: string | undefined, message: string): string {
  const digits = (phone || '').replace(/\D/g, '')
  // 10-digit Indian numbers need the country code for wa.me to resolve them.
  const to = digits.length === 10 ? `91${digits}` : digits
  const text = encodeURIComponent(message)
  return to ? `https://wa.me/${to}?text=${text}` : `https://wa.me/?text=${text}`
}
