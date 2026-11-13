import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/session'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    if (!['admin', 'super_admin', 'therapist_speech', 'therapist_ot', 'therapist_behavioral', 'therapist_remedial', 'psychologist'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
    const blockedExtensions = ['.exe', '.zip', '.bat', '.cmd', '.sh', '.dll', '.msi']
    const fileName = file.name.toLowerCase()

    if (blockedExtensions.some(ext => fileName.endsWith(ext))) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
    }

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Only image files (JPG, PNG, WebP) and PDF are allowed' }, { status: 400 })
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be under 10MB' }, { status: 400 })
    }

    const timestamp = Date.now()
    const ext = path.extname(file.name) || (file.type === 'application/pdf' ? '.pdf' : '.png')
    const baseName = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9.-]/g, '_')
    const uniqueName = `${timestamp}-${baseName}${ext}`

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadsDir, { recursive: true })

    const filePath = path.join(uploadsDir, uniqueName)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    const fileUrl = `/uploads/${uniqueName}`

    return NextResponse.json({ fileUrl, fileName: file.name, fileSize: file.size })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/assessments/upload error:', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}
