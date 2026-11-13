'use client'

// Print Branding (SaaS white-label) — the clinic's OWN letterhead assets and
// bank details used on every printed document (invoices, patient history
// reports, letterhead mode). Previously these were hardcoded files in
// /public (header.png, footer.png, signature.jpeg) and a hardcoded ICICI
// account — unacceptable once multiple clinics share the platform.
//
// Self-contained: fetches /api/settings/branding, saves via PUT /api/settings
// (server accepts these fields for admin/super_admin only).

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Printer, Upload, X, Save, Landmark } from 'lucide-react'
import { authFetch } from '@/lib/api-client'
import { toast } from 'sonner'

const IMAGE_FIELDS = [
  { key: 'printHeader', label: 'Header band', hint: 'Top strip on invoices & reports (wide, ~1054×252)' },
  { key: 'printFooter', label: 'Footer band', hint: 'Bottom strip (wide, ~1054×99)' },
  { key: 'letterhead', label: 'Full-page letterhead', hint: 'A4 background for letterhead-mode prints' },
  { key: 'signature', label: 'Authorized signature', hint: 'Shown in the invoice signature block' },
  { key: 'paymentQr', label: 'Payment QR code', hint: 'Scan-and-pay box on invoices' },
] as const

const BANK_FIELDS = [
  { key: 'bankName', label: 'Bank name', placeholder: 'e.g. HDFC Bank' },
  { key: 'bankBranch', label: 'Branch', placeholder: 'e.g. Kothrud Branch' },
  { key: 'bankAccountName', label: 'Account name', placeholder: 'Account holder name' },
  { key: 'bankAccountNumber', label: 'Account number', placeholder: '' },
  { key: 'bankIfsc', label: 'IFSC', placeholder: 'e.g. HDFC0000123' },
  { key: 'upiId', label: 'UPI ID', placeholder: 'e.g. clinic@upi' },
] as const

type BrandingState = Record<string, string>

const MAX_IMAGE_BYTES = 2 * 1024 * 1024 // 2MB per image (stored as base64 in DB)

export default function PrintBrandingCard() {
  const [branding, setBranding] = useState<BrandingState>({})
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    authFetch('/api/settings/branding')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return
        const next: BrandingState = {}
        for (const { key } of [...IMAGE_FIELDS, ...BANK_FIELDS]) {
          if (data[key]) next[key] = data[key]
        }
        setBranding(next)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const handleImagePick = (key: string, file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('Image must be under 2MB — compress it and try again')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setBranding((b) => ({ ...b, [key]: String(reader.result) }))
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Send every field explicitly — empty string clears it server-side.
      const payload: Record<string, string> = {}
      for (const { key } of [...IMAGE_FIELDS, ...BANK_FIELDS]) {
        payload[key] = branding[key] || ''
      }
      const res = await authFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to save print branding')
        return
      }
      toast.success('Print branding saved — all future prints will use it')
    } catch {
      toast.error('Failed to save print branding')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Printer className="h-4 w-4 mt-1 text-[#0F7A87]" />
            <div>
              <CardTitle className="text-base">Print Branding</CardTitle>
              <CardDescription>
                Header, footer, signature, QR and bank details printed on invoices and reports.
                Documents use a plain text header until you upload your own artwork.
              </CardDescription>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving || !loaded} size="sm" className="gap-2 shrink-0">
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Save Branding'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {IMAGE_FIELDS.map(({ key, label, hint }) => (
            <div key={key} className="space-y-2">
              <Label className="text-sm font-medium">{label}</Label>
              <div
                className="relative h-24 rounded-lg border-2 border-dashed bg-muted/30 flex items-center justify-center cursor-pointer overflow-hidden group"
                onClick={() => inputRefs.current[key]?.click()}
                title={`Upload ${label.toLowerCase()}`}
              >
                {branding[key] ? (
                   
                  <img src={branding[key]} alt={label} className="max-h-full max-w-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center text-muted-foreground">
                    <Upload className="h-4 w-4" />
                    <span className="text-[11px] mt-1">Click to upload</span>
                  </div>
                )}
                {branding[key] && (
                  <button
                    type="button"
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); setBranding((b) => { const n = { ...b }; delete n[key]; return n }) }}
                    title="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>
              <input
                ref={(el) => { inputRefs.current[key] = el }}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => { handleImagePick(key, e.target.files?.[0]); e.target.value = '' }}
              />
            </div>
          ))}
        </div>

        <Separator />

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Landmark className="h-4 w-4 text-[#0F7A87]" />
            <h4 className="text-sm font-semibold">Bank details (Payment Information box on invoices)</h4>
          </div>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {BANK_FIELDS.map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-sm">{label}</Label>
                <Input
                  value={branding[key] || ''}
                  placeholder={placeholder}
                  onChange={(e) => setBranding((b) => ({ ...b, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Only filled fields appear on invoices. Leave everything blank to hide the payment box.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
