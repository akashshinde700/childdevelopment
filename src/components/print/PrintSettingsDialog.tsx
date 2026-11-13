'use client'

import React, { useState, useCallback, useRef } from 'react'
import { FileText, Printer, PanelTop, Loader2, Download, Share2, MessageCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { canShareFiles } from '@/lib/document-share'
import {
  fetchPrintBranding,
  isModeAvailable,
  type PrintBranding,
  type PrintMode,
} from '@/lib/print-branding'

export type { PrintMode } from '@/lib/print-branding'

// What to do with the finished document. "share" hands it to the device's
// share sheet (WhatsApp, Files, Mail) and is only offered where the device
// actually supports sharing files — desktop browsers mostly don't.
export type PrintOutput = 'print' | 'save' | 'share' | 'link'

export interface PrintChoice {
  mode: PrintMode
  branding: PrintBranding
  output: PrintOutput
}

const OPTIONS: Array<{ mode: PrintMode; label: string; hint: string; icon: React.ElementType; accent: string }> = [
  { mode: 'header_footer', label: 'Header & Footer', hint: 'Your uploaded header and footer bands', icon: PanelTop, accent: 'teal' },
  { mode: 'letterhead', label: 'Full-page Letterhead', hint: 'Your uploaded letterhead as the page background', icon: Printer, accent: 'indigo' },
  { mode: 'plain', label: 'Without Header/Footer', hint: 'Plain A4 — content only', icon: FileText, accent: 'gray' },
]

const ACCENT: Record<string, string> = {
  teal: 'hover:border-teal-400 hover:bg-teal-50/50',
  indigo: 'hover:border-indigo-400 hover:bg-indigo-50/50',
  gray: 'hover:border-blue-400 hover:bg-blue-50/50',
}

/**
 * Universal print-mode chooser. Every option uses only the clinic's own
 * uploads from Settings → Print Branding; an option whose image was never
 * uploaded is shown disabled.
 *
 * Usage:
 *   const { choosePrintMode, PrintSettingsDialog } = usePrintSettings()
 *   const choice = await choosePrintMode()          // null when cancelled
 *   if (!choice) return
 *   buildDocumentHTML({ ..., mode: choice.mode, branding: choice.branding })
 *
 * `printWithSettings(cb)` is the callback form of the same thing.
 * Pass `{ modes: [...] }` to offer only the modes a document supports.
 */
export function usePrintSettings() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [branding, setBranding] = useState<PrintBranding>({})
  const [modes, setModes] = useState<PrintMode[]>(OPTIONS.map((o) => o.mode))
  const [output, setOutput] = useState<PrintOutput>('print')
  const [shareable, setShareable] = useState(false)
  const resolverRef = useRef<((choice: PrintChoice | null) => void) | null>(null)

  const settle = useCallback((choice: PrintChoice | null) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setDialogOpen(false)
    resolve?.(choice)
  }, [])

  const choosePrintMode = useCallback((opts?: { modes?: PrintMode[]; output?: PrintOutput }): Promise<PrintChoice | null> => {
    // A second request while one is open cancels the first.
    resolverRef.current?.(null)
    setModes(opts?.modes ?? OPTIONS.map((o) => o.mode))
    // "Share" buttons open the same dialog already on the WhatsApp link.
    setOutput(opts?.output ?? 'print')
    setShareable(canShareFiles())
    setBranding({})
    setLoading(true)
    setDialogOpen(true)
    fetchPrintBranding().then((b) => {
      setBranding(b)
      setLoading(false)
    })
    return new Promise((resolve) => { resolverRef.current = resolve })
  }, [])

  const printWithSettings = useCallback(
    (callback: (mode: PrintMode, branding: PrintBranding, output: PrintOutput) => void, opts?: { modes?: PrintMode[] }) => {
      choosePrintMode(opts).then((choice) => {
        if (choice) callback(choice.mode, choice.branding, choice.output)
      })
    },
    [choosePrintMode],
  )

  const visible = OPTIONS.filter((o) => modes.includes(o.mode))

  const PrintSettingsDialog = (
    <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) settle(null) }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Print Settings
          </DialogTitle>
          <DialogDescription>
            {output === 'print' && 'Choose how you want to print this document.'}
            {output === 'save' && 'The document is saved to this device as a PDF.'}
            {output === 'share' && 'Your device’s share sheet opens with the PDF attached — pick WhatsApp, then the chat.'}
            {output === 'link' && 'Opens WhatsApp with a download link to this document. Anyone with the link can open it.'}
          </DialogDescription>
        </DialogHeader>
        {!loading && (
          <div className="flex flex-wrap gap-2 border-b pb-3">
            {([
              { key: 'print', label: 'Print', icon: Printer },
              { key: 'save', label: 'Save PDF', icon: Download },
              { key: 'link', label: 'WhatsApp link', icon: MessageCircle },
              ...(shareable ? [{ key: 'share' as const, label: 'Share sheet', icon: Share2 }] : []),
            ] as Array<{ key: PrintOutput; label: string; icon: React.ElementType }>).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setOutput(key)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  output === key
                    ? 'border-teal-500 bg-teal-50 text-teal-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading print branding…
          </div>
        ) : (
          <div className={`grid grid-cols-1 gap-4 py-4 ${visible.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {visible.map(({ mode, label, hint, icon: Icon, accent }) => {
              const available = isModeAvailable(mode, branding)
              return (
                <button
                  key={mode}
                  type="button"
                  disabled={!available}
                  onClick={() => settle({ mode, branding, output })}
                  className={`flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-gray-200 transition-all duration-200 group ${available ? ACCENT[accent] : 'opacity-50 cursor-not-allowed'}`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                    <Icon className="h-6 w-6 text-gray-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-gray-800">{label}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {available ? hint : 'Not uploaded yet — add it in Settings → Print Branding'}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => settle(null)}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return { choosePrintMode, printWithSettings, PrintSettingsDialog }
}
