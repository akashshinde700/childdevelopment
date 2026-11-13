import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

// POST /api/users/me/photo — upload/replace the CALLER's own profile photo.
// Scoped to requireSessionUser's own id only — no arbitrary user id accepted,
// so any authenticated role can manage their own avatar without needing the
// super_admin-only /api/users PUT route.
export async function POST(request: NextRequest) {
  try {
    const sessionUser = await requireSessionUser(request)
    const organizationId = sessionUser.organizationId

    const owned = await db.user.findFirst({ where: { id: sessionUser.id, organizationId } })
    if (!owned) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    const blockedExtensions = ['.exe', '.zip', '.bat', '.cmd', '.sh', '.dll', '.msi', '.svg']
    const fileName = file.name.toLowerCase()

    if (blockedExtensions.some((ext) => fileName.endsWith(ext))) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
    }
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Only JPG, PNG or WebP images are allowed' }, { status: 400 })
    }
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be under 2MB' }, { status: 400 })
    }

    const timestamp = Date.now()
    const ext = path.extname(file.name) || '.png'
    const uniqueName = `avatar-${sessionUser.id}-${timestamp}${ext}`

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadsDir, { recursive: true })
    const filePath = path.join(uploadsDir, uniqueName)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    const avatarUrl = `/uploads/${uniqueName}`
    const updated = await db.user.update({
      where: { id: sessionUser.id },
      data: { avatar: avatarUrl },
      select: { id: true, avatar: true },
    })

    return NextResponse.json(updated)
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Profile photo upload error:', error)
    return NextResponse.json({ error: 'Failed to upload photo' }, { status: 500 })
  }
}

// DELETE /api/users/me/photo — remove the CALLER's own profile photo.
export async function DELETE(request: NextRequest) {
  try {
    const sessionUser = await requireSessionUser(request)
    const organizationId = sessionUser.organizationId

    const owned = await db.user.findFirst({ where: { id: sessionUser.id, organizationId } })
    if (!owned) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    await db.user.update({ where: { id: sessionUser.id }, data: { avatar: null } })
    return NextResponse.json({ success: true })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to remove photo' }, { status: 500 })
  }
}
