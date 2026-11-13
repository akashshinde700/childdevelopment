import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'

// GET /api/notifications — list the current user's notifications (newest
// first) plus their unread count.
export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: { userId: user.id, organizationId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      db.notification.count({ where: { userId: user.id, isRead: false, organizationId } }),
    ])
    return NextResponse.json({ notifications, unreadCount })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Notifications fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

// PATCH /api/notifications — { id } marks one as read, { markAllRead: true } marks all as read.
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    const body = await request.json()

    if (body.markAllRead) {
      await db.notification.updateMany({ where: { userId: user.id, isRead: false, organizationId }, data: { isRead: true } })
      return NextResponse.json({ success: true })
    }

    if (body.id) {
      const notif = await db.notification.findFirst({ where: { id: body.id, organizationId } })
      if (!notif || notif.userId !== user.id) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      await db.notification.update({ where: { id: body.id }, data: { isRead: true } })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'id or markAllRead is required' }, { status: 400 })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Notifications update error:', error)
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 })
  }
}
