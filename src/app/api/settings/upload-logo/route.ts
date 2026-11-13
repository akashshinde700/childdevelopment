import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('logo') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type - images only. SVG is deliberately excluded: it can
    // carry embedded <script>/event-handler payloads, and this is the only
    // upload route in the app that previously allowed it (stored-XSS risk).
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    const blockedExtensions = ['.exe', '.zip', '.bat', '.cmd', '.sh', '.dll', '.msi', '.svg']
    const fileName = file.name.toLowerCase()

    if (blockedExtensions.some(ext => fileName.endsWith(ext))) {
      return NextResponse.json({ error: 'File type not allowed. Blocked: .exe, .zip, .bat, .svg' }, { status: 400 })
    }

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Only image files (JPG, PNG, WebP) are allowed' }, { status: 400 })
    }

    // Max 2MB
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be under 2MB' }, { status: 400 })
    }

    // Convert to base64 for reliable storage (avoids file system issues)
    const buffer = Buffer.from(await file.arrayBuffer())
    const base64Logo = `data:${file.type};base64,${buffer.toString('base64')}`

    // Update settings with logo as base64
    let settings = await db.centerSettings.findFirst({ where: { organizationId } })
    if (!settings) {
      settings = await db.centerSettings.create({
        data: {
          centerName: 'Your Clinic Name',
          logo: base64Logo,
          organizationId,
        },
      })
    } else {
      settings = await db.centerSettings.update({
        where: { id: settings.id },
        data: { logo: base64Logo },
      })
    }

    // Mask the center password in response for security
    const { password: _centerPwd, ...safeSettings } = settings

    return NextResponse.json({ logo: base64Logo, settings: safeSettings, hasCenterPassword: !!settings.password })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/settings/upload-logo error:', error)
    return NextResponse.json({ error: 'Failed to upload logo' }, { status: 500 })
  }
}
