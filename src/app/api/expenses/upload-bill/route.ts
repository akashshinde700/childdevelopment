import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/session'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('bill') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
    const blockedExtensions = ['.exe', '.zip', '.bat', '.cmd', '.sh', '.dll', '.msi']
    const fileName = file.name.toLowerCase()

    if (blockedExtensions.some(ext => fileName.endsWith(ext))) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
    }

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Only image files (JPG, PNG, WebP) and PDF are allowed' }, { status: 400 })
    }

    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be under 5MB' }, { status: 400 })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const ext = path.extname(file.name) || (file.type === 'application/pdf' ? '.pdf' : '.png')
    // Strip extension from sanitised name to avoid double extension (e.g. "file.png.png")
    const baseName = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9.-]/g, '_')
    const uniqueName = `${timestamp}-${baseName}${ext}`

    // Save to public/uploads directory
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadsDir, { recursive: true })

    const filePath = path.join(uploadsDir, uniqueName)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    // Return the public URL
    const billUrl = `/uploads/${uniqueName}`

    return NextResponse.json({ billUrl, fileName: file.name })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/expenses/upload-bill error:', error)
    return NextResponse.json({ error: 'Failed to upload bill' }, { status: 500 })
  }
}
