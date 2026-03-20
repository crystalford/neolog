import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'
import { inngest } from '@/inngest/client'

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
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      const run = await startJobRun('video-upload.register', { user_id: session.user.id })
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
    if (!storage_path.startsWith(`${session.user.id}/`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Duplicate detection: check if a file with the same name and size already exists
    // Skip if force=true (user confirmed they want to re-upload)
    if (!force) {
      const { data: existing } = await supabase
        .from('video_uploads')
        .select('id, status, created_at')
        .eq('user_id', session.user.id)
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

    finalMeta = { user_id: session.user.id, file_name, file_size_bytes, mime_type }

    const { data: record, error: dbError } = await supabase
      .from('video_uploads')
      .insert({
        user_id: session.user.id,
        file_name,
        file_size_bytes,
        mime_type,
        storage_path,
        storage_provider: 'supabase',
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

    // Trigger Inngest processing automatically on upload
    try {
      await inngest.send({
        name: 'video-upload/process',
        data: { video_upload_id: record.id, user_id: session.user.id },
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

// GET: List user's video uploads
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '200')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('video_uploads')
      .select('id, file_name, file_size_bytes, mime_type, duration_seconds, status, tags, error_message, source_deleted, processed_at, recorded_at, created_at, updated_at, thumbnail_url, storage_path, playback_path')
      .eq('user_id', session.user.id)
      .order('recorded_at', { ascending: false, nullsFirst: true })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Supabase query error in GET /api/video-upload:', error)
      return NextResponse.json({ error: 'Failed to fetch uploads', details: error.message }, { status: 500 })
    }

    // Generate signed URLs for thumbnails stored as storage paths (skip http and data: URLs)
    const thumbPaths = (data || [])
      .filter((u: any) => u.thumbnail_url && !u.thumbnail_url.startsWith('http') && !u.thumbnail_url.startsWith('data:'))
      .map((u: any) => u.thumbnail_url)

    let signedMap: Record<string, string> = {}
    if (thumbPaths.length > 0) {
      const { data: signed } = await supabase.storage
        .from('videos')
        .createSignedUrls(thumbPaths, 3600)
      if (signed) {
        for (const s of signed) {
          if (s.signedUrl) signedMap[s.path] = s.signedUrl
        }
      }
    }

    // Generate signed video URLs for uploads missing thumbnails (prefer playback_path for H.264)
    const videoPathEntries = (data || [])
      .filter((u: any) => !u.thumbnail_url && u.mime_type?.startsWith('video/') && (u.playback_path || u.storage_path))
      .map((u: any) => ({ id: u.id, path: u.playback_path || u.storage_path }))

    let videoSignedMap: Record<string, string> = {}
    if (videoPathEntries.length > 0) {
      const { data: signedVideos } = await supabase.storage
        .from('videos')
        .createSignedUrls(videoPathEntries.map((e: any) => e.path), 3600)
      if (signedVideos) {
        for (const s of signedVideos) {
          if (s.signedUrl) videoSignedMap[s.path] = s.signedUrl
        }
      }
    }

    const uploads = (data || []).map((u: any) => {
      const videoPath = u.playback_path || u.storage_path
      return {
        ...u,
        thumbnail_url: (u.thumbnail_url?.startsWith('data:') || u.thumbnail_url?.startsWith('http'))
          ? u.thumbnail_url
          : u.thumbnail_url
            ? (signedMap[u.thumbnail_url] || null)
            : null,
        video_url: (!u.thumbnail_url && videoPath)
          ? (videoSignedMap[videoPath] || null)
          : null,
      }
    })

    return NextResponse.json({ uploads })
  } catch (error) {
    console.error('List video uploads error:', error)
    return NextResponse.json({ error: 'Failed to fetch uploads' }, { status: 500 })
  }
}
