/**
 * POST /api/upload/initiate
 *
 * Starts an R2 multipart upload and returns presigned PUT URLs for every part.
 * All URLs are generated in one request — client uploads directly to R2, no proxying.
 *
 * Body: { fileName: string, fileSize: number, mimeType: string }
 * Returns: { uploadId, key, partUrls: string[], totalParts: number, partSize: number }
 */
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { initiateMultipartUpload, PART_SIZE } from '@/lib/storage/r2'

const VALID_TYPES = [
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/x-m4a',
  'text/plain',
]

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { fileName, fileSize, mimeType } = body

  if (!fileName || !fileSize || !mimeType) {
    return NextResponse.json({ error: 'fileName, fileSize, mimeType required' }, { status: 400 })
  }
  if (!VALID_TYPES.includes(mimeType)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }
  if (fileSize > 10 * 1024 * 1024 * 1024) { // 10GB hard cap
    return NextResponse.json({ error: 'File too large (max 10GB)' }, { status: 400 })
  }

  const timestamp = Date.now()
  const sanitized = (fileName as string).replace(/[^a-zA-Z0-9._-]/g, '_')
  const key = `${session.user.id}/videos/${timestamp}_${sanitized}`

  try {
    const result = await initiateMultipartUpload(key, mimeType, fileSize)
    return NextResponse.json({ ...result, partSize: PART_SIZE })
  } catch (err: any) {
    console.error('[upload/initiate]', err.message)
    return NextResponse.json({ error: 'Failed to initiate upload' }, { status: 500 })
  }
}
