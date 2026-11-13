import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'

// GET /api/settings/branding — print/letterhead branding for the logged-in
// user's organization. Open to EVERY authenticated role (unlike
// /api/settings, which is admin-only) because receptionists and therapists
// print invoices and reports too. Returns only what appears on printed
// documents — no passwords, no historical-entry flags.
export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const settings = await db.centerSettings.findFirst({ where: { organizationId } })
    if (!settings) {
      return NextResponse.json({ centerName: null })
    }
    const s = settings as typeof settings & Record<string, string | null>
    return NextResponse.json({
      centerName: settings.centerName,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      gstNumber: settings.gstNumber,
      logo: settings.logo,
      printHeader: s.printHeader ?? null,
      printFooter: s.printFooter ?? null,
      letterhead: s.letterhead ?? null,
      signature: s.signature ?? null,
      paymentQr: s.paymentQr ?? null,
      bankName: s.bankName ?? null,
      bankBranch: s.bankBranch ?? null,
      bankAccountName: s.bankAccountName ?? null,
      bankAccountNumber: s.bankAccountNumber ?? null,
      bankIfsc: s.bankIfsc ?? null,
      upiId: s.upiId ?? null,
    })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/settings/branding error:', error)
    return NextResponse.json({ error: 'Failed to fetch branding' }, { status: 500 })
  }
}
