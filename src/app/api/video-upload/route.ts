import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'
import { inngest } from '@/inngest/client'

export const runtime = 'edge'

const VALID_TYPES = [
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/x-m4a',
  'text/plain',
]

/**
 * POST /api/video-upload
 */
export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id

    if (!user || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      const run = await startJobRun('video-upload.register', { user_id: userId })
      runId = run.id
    } catch {
      // best-effort
    }

    const body = await request.json()
    const { storage_path, file_name, file_size_bytes, mime_type, session_id, recorded_at, force, thumbnail_url } = body
    console.log(`[API] Received upload registration for ${file_name}. recorded_at: ${recorded_at}`);

    if (!storage_path || !file_name || !file_size_bytes || !mime_type) {
      finalErrorMessage = 'Missing required fields: storage_path, file_name, file_size_bytes, mime_type'
      return NextResponse.json({ error: finalErrorMessage }, { status: 400 })
    }

    if (!VALID_TYPES.includes(mime_type)) {
      finalErrorMessage = 'Invalid file type'
      return NextResponse.json({ error: finalErrorMessage }, { status: 400 })
    }

    // Verify the storage path belongs to this user
    if (!storage_path.startsWith(`${userId}/`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Duplicate detection: check if a file with the same name and size already exists
    // Skip if force=true (user confirmed they want to re-upload)
    if (!force) {
      const { data: existing } = await supabase
        .from('video_uploads')
        .select('id, status, created_at')
        .eq('user_id', userId)
        .eq('file_name', file_name)
        .eq('file_size_bytes', file_size_bytes)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existing) {
        return NextResponse.json({
          duplicate: true,
          existing_id: existing.id,
          existing_status: existing.status,
          message: `"${file_name}" was already uploaded (status: ${existing.status}). Upload it again?`,
        }, { status: 409 })
      }
    }

    finalMeta = { user_id: userId, file_name, file_size_bytes, mime_type }

    const { data: record, error: dbError } = await supabase
      .from('video_uploads')
      .insert({
        user_id: userId,
        file_name,
        file_size_bytes,
        mime_type,
        storage_path,
        storage_provider: 'r2',
        status: 'uploaded',
        recorded_at: recorded_at || null,
        ...(session_id ? { session_id } : {}),
        ...(thumbnail_url ? { thumbnail_url } : {}),
      })
      .select()
      .single()

    if (dbError) {
      console.error('DB insert error:', dbError)
      finalErrorMessage = `Failed to save upload record: ${dbError.message}`
      return NextResponse.json({ error: finalErrorMessage, details: dbError }, { status: 500 })
    }

    // Trigger Inngest processing pipeline
    try {
      await inngest.send({
        name: 'video-upload/process',
        data: { video_upload_id: record.id, user_id: userId },
      })
    } catch (inngestError) {
      console.error('Inngest event failed:', inngestError)
    }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, video_upload_id: record.id }

    return NextResponse.json({
      id: record.id,
      file_name: record.file_name,
      status: record.status,
      created_at: record.created_at,
    })
  } catch (error) {
    console.error('Video register error:', error)
    finalErrorMessage = 'Registration failed'
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  } finally {
    try {
      if (runId) {
        await finishJobRun(
          runId,
          finalStatus,
          { duration_ms: Date.now() - startedAt, ...finalMeta },
          finalErrorMessage,
        )
      }
    } catch {
      // best-effort
    }
  }
}

// DELETE: Remove a video upload (DB row + R2 storage objects)
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const { data: upload, error: fetchErr } = await supabase
      .from('video_uploads')
      .select('id, user_id, storage_path, playback_path, thumbnail_url, storage_provider')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (fetchErr || !upload) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Best-effort storage cleanup (don't fail the delete if R2 cleanup fails)
    if (upload.storage_provider === 'r2') {
      const { deleteR2Object } = await import('@/lib/storage/r2')
      const keys = [upload.storage_path, upload.playback_path].filter(Boolean) as string[]
      // Only delete thumbnail if it's a stored object key, not a data: URL
      if (upload.thumbnail_url && !upload.thumbnail_url.startsWith('data:') && !upload.thumbnail_url.startsWith('http')) {
        keys.push(upload.thumbnail_url)
      }
      await Promise.all(keys.map(k => deleteR2Object(k).catch(e => console.error('R2 delete failed:', k, e))))
    } else if (upload.storage_provider === 'supabase' && upload.storage_path) {
      await supabase.storage.from('videos').remove([upload.storage_path]).catch(() => null)
    }

    // Delete dependent rows that don't cascade automatically
    await supabase.from('transcript_words').delete().eq('video_upload_id', id).eq('user_id', userId)
    await supabase.from('entity_mentions').delete().eq('video_upload_id', id).eq('user_id', userId)
    await supabase.from('post_candidates').delete().eq('user_id', userId).eq('session_id', id)

    const { error: delErr } = await supabase
      .from('video_uploads')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (delErr) {
      console.error('DB delete error:', delErr)
      return NextResponse.json({ error: 'Delete failed', details: delErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('Delete handler error:', e)
    return NextResponse.json({ error: e?.message || 'Delete failed' }, { status: 500 })
  }
}

// GET: List user's video uploads
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id

    if (!user || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const fileName = searchParams.get('file_name')
    const fileSizeBytes = searchParams.get('file_size_bytes')
    const limit = parseInt(searchParams.get('limit') || '200')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('video_uploads')
      .select('id, file_name, file_size_bytes, mime_type, duration_seconds, status, tags, error_message, source_deleted, processed_at, recorded_at, created_at, updated_at, thumbnail_url, storage_path, playback_path, storage_provider, analysis')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false, nullsFirst: true })
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }
    if (fileName) {
      query = query.eq('file_name', fileName)
    }
    if (fileSizeBytes) {
      query = query.eq('file_size_bytes', parseInt(fileSizeBytes))
    }

    const { data, error } = await query
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Supabase query error in GET /api/video-upload:', error)
      return NextResponse.json({ error: 'Failed to fetch uploads', details: error.message }, { status: 500 })
    }

    // Signed URL Generation Logic
    // Since we now support Supabase and R2, we must split the list and sign accordingly.

    const uploadsWithUrls = await Promise.all((data || []).map(async (u: any) => {
      const isR2 = u.storage_provider === 'r2'
      const videoPath = u.playback_path || u.storage_path
      let thumbUrl = u.thumbnail_url
      let videoUrl = null

      // 1. Resolve Thumbnail
      if (thumbUrl && !thumbUrl.startsWith('http') && !thumbUrl.startsWith('data:')) {
        // It's a storage path
        try {
          if (isR2) {
            const { presignDownloadUrl } = await import('@/lib/storage/r2')
            thumbUrl = await presignDownloadUrl(thumbUrl, 3600)
          } else {
            const { data: signed } = await supabase.storage.from('videos').createSignedUrl(thumbUrl, 3600)
            thumbUrl = signed?.signedUrl || null
          }
        } catch (e) {
          console.error(`[API] Failed to sign thumbnail for ${u.id}:`, e)
          thumbUrl = null
        }
      }

      // 2. Resolve Video Playback (always provide if it exists, so Fix Preview can use it)
      if (videoPath) {
        try {
          if (isR2) {
            const { presignDownloadUrl } = await import('@/lib/storage/r2')
            videoUrl = await presignDownloadUrl(videoPath, 3600)
          } else {
            const { data: signed } = await supabase.storage.from('videos').createSignedUrl(videoPath, 3600)
            videoUrl = signed?.signedUrl || null
          }
        } catch (e) {
          console.error(`[API] Failed to sign video for ${u.id}:`, e)
        }
      }

      return {
        ...u,
        thumbnail_url: thumbUrl,
        video_url: videoUrl,
      }
    }))

    return NextResponse.json({ uploads: uploadsWithUrls })
  } catch (error) {
    console.error('List video uploads error:', error)
    return NextResponse.json({ error: 'Failed to fetch uploads' }, { status: 500 })
  }
}
