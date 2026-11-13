import { NextRequest, NextResponse } from 'next/server'
import { platformAdminDb } from '@/lib/platform-db'
import { hashPassword } from '@/lib/password'

// POST /api/platform/auth/bootstrap — first-run setup ONLY.
// Creates the very first Platform Admin account. Hard-disabled the moment
// one exists: afterwards new platform admins can only be added by an
// existing one (or directly in the DB). This avoids shipping a default
// password (the exact mistake flagged in the security audit: admin123).
export async function POST(request: NextRequest) {
  try {
    const existing = await platformAdminDb.count()
    if (existing > 0) {
      return NextResponse.json({ error: 'Platform is already set up' }, { status: 403 })
    }

    const { email, password, name } = await request.json()
    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Email, password and name are required' }, { status: 400 })
    }
    if (String(password).length < 10) {
      return NextResponse.json({ error: 'Password must be at least 10 characters' }, { status: 400 })
    }

    const admin = await platformAdminDb.create({
      data: { email: String(email).toLowerCase().trim(), password: await hashPassword(password), name },
    })
    return NextResponse.json({ id: admin.id, email: admin.email, name: admin.name }, { status: 201 })
  } catch (error) {
    console.error('Platform bootstrap error:', error)
    return NextResponse.json({ error: 'Bootstrap failed' }, { status: 500 })
  }
}

// GET — lets the login page know whether to show "create first admin".
export async function GET() {
  try {
    const existing = await platformAdminDb.count()
    // When PLATFORM_ADMIN_EMAIL/PASSWORD are set in .env, the first admin is
    // seeded automatically at first login — skip the manual bootstrap form.
    const envSeeded = !!(process.env.PLATFORM_ADMIN_EMAIL && process.env.PLATFORM_ADMIN_PASSWORD)
    return NextResponse.json({ needsBootstrap: existing === 0 && !envSeeded })
  } catch (error) {
    console.error('Platform bootstrap check error:', error)
    return NextResponse.json({ error: 'Check failed' }, { status: 500 })
  }
}
