import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/session'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

// POST /api/print/upload — any authenticated user can upload a custom
// header/footer band image for the Print Center's "Custom Images" mode.
// Any authenticated user (not role-gated) since Print Center itself has no
// role restriction. Images only — these are printed as full-width bands,
// not documents.
export async function POST(request: NextRequest) {
  try {
    await requireSessionUser(request)

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    const blockedExtensions = ['.exe', '.zip', '.bat', '.cmd', '.sh', '.dll', '.msi', '.svg']
    const fileName = file.name.toLowerCase()

    if (blockedExtensions.some(ext => fileName.endsWith(ext))) {
      return NextResponse.json({ error: 'File type not allowed. Blocked: .exe, .zip, .bat, .svg' }, { status: 400 })
    }
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Only image files (JPG, PNG, WebP) are allowed' }, { status: 400 })
    }

    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be under 5MB' }, { status: 400 })
    }

    const timestamp = Date.now()
    const ext = path.extname(file.name) || '.png'
    const baseName = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9.-]/g, '_')
    const uniqueName = `${timestamp}-${baseName}${ext}`

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadsDir, { recursive: true })
    const filePath = path.join(uploadsDir, uniqueName)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    return NextResponse.json({ fileUrl: `/uploads/${uniqueName}`, fileName: file.name })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/print/upload error:', error)
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
  }
}
