'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/store/app-store'
import { authFetch } from '@/lib/api-client'
import { toFileUrl } from '@/hooks/use-file-exists'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Printer, FileText, Upload, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { buildDocumentHTML, printHTMLDocument } from '@/components/print/DocumentLayout'
import { fetchPrintBranding, isModeAvailable, type PrintBranding } from '@/lib/print-branding'

// branding   — header/footer bands uploaded in Settings → Print Branding
// letterhead — full-page letterhead uploaded in Settings → Print Branding
// custom     — one-off images uploaded right here for this print only
// none       — no header/footer at all
type HeaderFooterMode = 'branding' | 'letterhead' | 'custom' | 'none'

export default function PrintPage() {
  const { currentBranch, navigate } = useAppStore()
  const [customText, setCustomText] = useState('')
  const [mode, setMode] = useState<HeaderFooterMode>('none')
  const [customHeaderUrl, setCustomHeaderUrl] = useState<string | null>(null)
  const [customFooterUrl, setCustomFooterUrl] = useState<string | null>(null)
  const [uploadingHeader, setUploadingHeader] = useState(false)
  const [uploadingFooter, setUploadingFooter] = useState(false)
  const [branding, setBranding] = useState<PrintBranding>({})
  useEffect(() => { fetchPrintBranding().then(setBranding) }, [])
  const hasBands = isModeAvailable('header_footer', branding)
  const hasLetterhead = isModeAvailable('letterhead', branding)

  const uploadBandImage = async (file: File, slot: 'header' | 'footer') => {
    const setUploading = slot === 'header' ? setUploadingHeader : setUploadingFooter
    const setUrl = slot === 'header' ? setCustomHeaderUrl : setCustomFooterUrl
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await authFetch('/api/print/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || `Failed to upload ${slot} image`)
        return
      }
      const data = await res.json() as { fileUrl: string }
      setUrl(data.fileUrl)
    } catch {
      toast.error(`Failed to upload ${slot} image`)
    } finally {
      setUploading(false)
    }
  }

  const handlePrint = () => {
    if (!customText.trim()) {
      toast.error('Please enter some content to print')
      return
    }
    if (mode === 'custom' && !customHeaderUrl && !customFooterUrl) {
      toast.error('Upload at least a header or footer image, or pick another option')
      return
    }
    // In-flow bands (once at the very top, once at the very end), not
    // position:fixed — Chrome doesn't reliably repeat fixed elements across a
    // long multi-page print, so fixed bands ended up overlapping mid-page.
    const resolveUrl = (src: string) =>
      typeof window !== 'undefined' && src.startsWith('/') ? window.location.origin + src : src

    const contentHTML = `<div style="white-space: pre-wrap; font-size: 14px; line-height: 1.8; color: #1f2937;">${customText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`

    // Settings uploads: buildDocumentHTML places the bands / letterhead.
    if (mode === 'branding' || mode === 'letterhead') {
      const html = buildDocumentHTML({
        title: 'Custom Document',
        bodyHTML: contentHTML,
        autoPrint: false,
        hideBuiltInTitle: true,
        mode: mode === 'branding' ? 'header_footer' : 'letterhead',
        branding,
      })
      printHTMLDocument(html, () => navigate('print'))
      return
    }

    let headerHTML = ''
    let footerHTML = ''
    if (mode === 'custom') {
      // Custom images keep their own natural aspect ratio (object-fit:
      // contain within a max-height band), since an uploaded image can be
      // any shape.
      if (customHeaderUrl) headerHTML = `<div class="pc-header"><img src="${resolveUrl(toFileUrl(customHeaderUrl) || customHeaderUrl)}" alt="header" /></div>`
      if (customFooterUrl) footerHTML = `<div class="pc-footer"><img src="${resolveUrl(toFileUrl(customFooterUrl) || customFooterUrl)}" alt="footer" /></div>`
    }
    // mode === 'none' → headerHTML/footerHTML stay empty, plain content only.

    const html = buildDocumentHTML({
      title: 'Custom Document',
      bodyHTML: `${headerHTML}${contentHTML}${footerHTML}`,
      autoPrint: false,
      hideBuiltInTitle: true,
      extraCSS: `
        .pc-header { margin: 0 0 16px 0; break-after: avoid; page-break-after: avoid; }
        .pc-header img { width: 100%; height: auto; display: block; max-height: 45mm; object-fit: contain; }
        .pc-footer { margin: 16px 0 0 0; break-before: avoid; page-break-before: avoid; }
        .pc-footer img { width: 100%; height: auto; display: block; max-height: 30mm; object-fit: contain; }
        @media print {
          .pc-header img, .pc-footer img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `,
    })
    // Whether the user hits Save or Cancel in the print dialog, land back on
    // Print Center explicitly — no new tab/window is ever opened by
    // printHTMLDocument, but this removes any doubt after the dialog closes.
    printHTMLDocument(html, () => navigate('print'))
  }

  return (
    <div className="space-y-6">
      <div className="no-print">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Printer className="h-6 w-6" style={{ color: '#0F7A87' }} />
              Print Center
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Type or paste any content and print it — with or without a letterhead
            </p>
          </div>
          {currentBranch && (
            <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 text-xs">
              {currentBranch.name} ({currentBranch.code})
            </Badge>
          )}
        </div>
      </div>

      <Card className="no-print">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-600" />
            Custom Document
          </CardTitle>
          <CardDescription>Type or paste any content below. By default it prints plain — pick a header/footer option below if you want one.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Document Content</Label>
            <textarea
              className="w-full min-h-[400px] p-4 border border-gray-200 rounded-lg text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 resize-y"
              placeholder="Type or paste your document content here...&#10;&#10;You can write letters, certificates, reports, notes, or any text.&#10;Prints plain by default — pick a header/footer option below if you want one."
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
            />
            <p className="text-xs text-gray-400">{customText.length} characters • {customText.split('\n').length} lines</p>
          </div>

          <div className="space-y-3">
            <Label>Header / Footer</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as HeaderFooterMode)} className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="branding" id="hf-branding" disabled={!hasBands} />
                <Label htmlFor="hf-branding" className={`font-normal ${hasBands ? 'cursor-pointer' : 'text-muted-foreground'}`}>Clinic Header &amp; Footer</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="letterhead" id="hf-letterhead" disabled={!hasLetterhead} />
                <Label htmlFor="hf-letterhead" className={`font-normal ${hasLetterhead ? 'cursor-pointer' : 'text-muted-foreground'}`}>Clinic Letterhead (full page)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="custom" id="hf-custom" />
                <Label htmlFor="hf-custom" className="font-normal cursor-pointer">Custom Header/Footer Images</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="none" id="hf-none" />
                <Label htmlFor="hf-none" className="font-normal cursor-pointer">No Header/Footer</Label>
              </div>
            </RadioGroup>

            {(!hasBands || !hasLetterhead) && (
              <p className="text-xs text-muted-foreground">
                {!hasBands && !hasLetterhead
                  ? 'No clinic header/footer or letterhead uploaded yet'
                  : !hasBands ? 'No clinic header/footer uploaded yet' : 'No clinic letterhead uploaded yet'}
                {' '}— add them in Settings → Print Branding.
              </p>
            )}

            {mode === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                {(['header', 'footer'] as const).map((slot) => {
                  const url = slot === 'header' ? customHeaderUrl : customFooterUrl
                  const uploading = slot === 'header' ? uploadingHeader : uploadingFooter
                  const setUrl = slot === 'header' ? setCustomHeaderUrl : setCustomFooterUrl
                  return (
                    <div key={slot} className="border border-gray-200 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-medium text-gray-600 capitalize">{slot} image (optional)</p>
                      {url ? (
                        <div className="relative">
                          <img src={toFileUrl(url) || url} alt={`Custom ${slot}`} className="w-full h-16 object-contain border border-gray-100 rounded bg-gray-50" />
                          <button
                            type="button"
                            onClick={() => setUrl(null)}
                            className="absolute -top-2 -right-2 bg-white border border-gray-300 rounded-full p-0.5 shadow-sm hover:bg-gray-50"
                          >
                            <X className="h-3.5 w-3.5 text-gray-500" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded h-16 cursor-pointer text-xs text-gray-400 hover:border-gray-400 hover:text-gray-500">
                          {uploading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Upload className="h-3.5 w-3.5" />
                              Upload {slot} image
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            disabled={uploading}
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) uploadBandImage(file, slot)
                              e.target.value = ''
                            }}
                          />
                        </label>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handlePrint} disabled={!customText.trim()} className="gap-2">
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button variant="outline" onClick={() => setCustomText('')} disabled={!customText.trim()}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
