export const runtime = 'edge'
/**
 * POST /api/upload/complete
 *
 * Finalizes an R2 multipart upload. Registration in video_uploads + Inngest
 * dispatch happens separately via POST /api/video-upload.
 *
 * Body: { uploadId, key, parts: [{PartNumber, ETag}] }
 */
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { completeMultipartUpload } from '@/lib/storage/r2'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { uploadId, key, parts } = body

  if (!uploadId || !key || !parts) {
    return NextResponse.json({ error: 'uploadId, key, parts required' }, { status: 400 })
  }

  if (!key.startsWith(`${session.user.id}/`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    await completeMultipartUpload(key, uploadId, parts)
  } catch (err: any) {
    console.error('[upload/complete] R2 complete failed:', err.message)
    return NextResponse.json({ error: 'Failed to complete upload on storage', detail: err?.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, key })
}
