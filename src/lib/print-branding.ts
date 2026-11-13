import { authFetch } from '@/lib/api-client'

// How a document is printed. Every image comes from the clinic's own uploads
// (Settings → Print Branding) — never a file bundled in /public, so one
// clinic's artwork can never appear on another clinic's prints.
//   header_footer — uploaded header band on top, footer band at the end
//   letterhead    — uploaded full-page letterhead as the page background
//   plain         — no header, footer or letterhead at all
export type PrintMode = 'header_footer' | 'letterhead' | 'plain'

export interface PrintAssets {
  printHeader?: string | null
  printFooter?: string | null
  letterhead?: string | null
}

export interface PrintBranding extends PrintAssets {
  centerName?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  gstNumber?: string | null
  logo?: string | null
  signature?: string | null
  paymentQr?: string | null
  bankName?: string | null
  bankBranch?: string | null
  bankAccountName?: string | null
  bankAccountNumber?: string | null
  bankIfsc?: string | null
  upiId?: string | null
}

// Fetched per print (no cache) so a Settings change shows up on the very
// next print. A failed fetch prints plain rather than blocking the print.
export async function fetchPrintBranding(): Promise<PrintBranding> {
  try {
    const res = await authFetch('/api/settings/branding')
    if (res.ok) return (await res.json()) as PrintBranding
  } catch { /* fall through */ }
  return {}
}

export function isModeAvailable(mode: PrintMode, assets: PrintAssets): boolean {
  if (mode === 'header_footer') return !!(assets.printHeader || assets.printFooter)
  if (mode === 'letterhead') return !!assets.letterhead
  return true
}

// Degrade to plain when the asset a mode needs was never uploaded.
export function resolvePrintMode(mode: PrintMode | undefined, assets: PrintAssets | undefined): PrintMode {
  if (!mode || !assets) return 'plain'
  return isModeAvailable(mode, assets) ? mode : 'plain'
}

// Relative paths must be made absolute: print documents are written into an
// about:blank iframe/window that cannot resolve them.
export function absoluteAssetUrl(src?: string | null): string {
  if (!src) return ''
  if (/^(data:|https?:)/.test(src)) return src
  if (typeof window !== 'undefined' && src.startsWith('/')) return window.location.origin + src
  return src
}
