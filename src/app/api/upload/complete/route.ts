/**
 * POST /api/upload/complete
 *
 * Completes an R2 multipart upload, then registers the file in video_uploads
 * and fires the Inngest processing pipeline.
 *
 * Body: {
 *   uploadId, key, parts: [{PartNumber, ETag}],
 *   fileName, fileSizeBytes, mimeType,
 *   recordedAt?: string | null,
 *   thumbnailUrl?: string | null,
 *   sessionId?: string | null,
 *   force?: boolean,
 * }
 */
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { completeMultipartUpload } from '@/lib/storage/r2'
import { inngest } from '@/inngest/client'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const {
    uploadId, key, parts,
    fileName, fileSizeBytes, mimeType,
    recordedAt, thumbnailUrl, sessionId, force,
  } = body

  if (!uploadId || !key || !parts || !fileName || !fileSizeBytes || !mimeType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Verify the key belongs to this user
  if (!key.startsWith(`${session.user.id}/`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Duplicate detection (unless force=true)
  if (!force) {
    const { data: existing } = await supabase
      .from('video_uploads')
      .select('id, status, created_at')
      .eq('user_id', session.user.id)
      .eq('file_name', fileName)
      .eq('file_size_bytes', fileSizeBytes)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({
        duplicate: true,
        existing_id: existing.id,
        existing_status: existing.status,
        message: `"${fileName}" was already uploaded (status: ${existing.status}). Upload it again?`,
      }, { status: 409 })
    }
  }

  try {
    // Complete the R2 multipart upload
    await completeMultipartUpload(key, uploadId, parts)
  } catch (err: any) {
    console.error('[upload/complete] R2 complete failed:', err.message)
    return NextResponse.json({ error: 'Failed to complete upload on storage' }, { status: 500 })
  }

  // Register in database
  const { data: record, error: dbError } = await supabase
    .from('video_uploads')
    .insert({
      user_id: session.user.id,
      file_name: fileName,
      file_size_bytes: fileSizeBytes,
      mime_type: mimeType,
      storage_path: key,
      storage_provider: 'r2',
      status: 'uploaded',
      recorded_at: recordedAt || null,
      ...(sessionId ? { session_id: sessionId } : {}),
      ...(thumbnailUrl ? { thumbnail_url: thumbnailUrl } : {}),
    })
    .select()
    .single()

  if (dbError) {
    console.error('[upload/complete] DB insert failed:', dbError.message)
    return NextResponse.json({ error: `Failed to register upload: ${dbError.message}` }, { status: 500 })
  }

  // Fire Inngest processing pipeline
  try {
    await inngest.send({
      name: 'video-upload/process',
      data: { video_upload_id: record.id, user_id: session.user.id },
    })
  } catch (err: any) {
    console.error('[upload/complete] Inngest send failed:', err.message)
    // Non-fatal: record exists, can be reprocessed manually
  }

  return NextResponse.json({
    id: record.id,
    file_name: record.file_name,
    status: record.status,
    created_at: record.created_at,
  })
}
