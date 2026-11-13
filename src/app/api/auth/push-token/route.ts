import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'

// PUT /api/auth/push-token — self-service, any authenticated user (staff,
// parent, platform admin's tenant session) can register/update the Expo
// push token for the device they're currently signed in on. Called after
// login and whenever expo-notifications reports a token refresh.
export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const { token } = await request.json()
    if (typeof token !== 'string' || !token) {
      return NextResponse.json({ error: 'token is required' }, { status: 400 })
    }
    await db.user.update({ where: { id: user.id }, data: { pushToken: token } })
    return NextResponse.json({ success: true })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('PUT /api/auth/push-token error:', error)
    return NextResponse.json({ error: 'Failed to save push token' }, { status: 500 })
  }
}

// DELETE — called on sign-out so a shared/reset device stops receiving a
// signed-out user's pushes.
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    await db.user.update({ where: { id: user.id }, data: { pushToken: null } })
    return NextResponse.json({ success: true })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to clear push token' }, { status: 500 })
  }
}
