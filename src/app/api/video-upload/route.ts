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
 *
 * Registers a video/audio file that has already been uploaded directly to Supabase
 * Storage via TUS resumable upload from the browser. Creates the DB record and fires
 * the Inngest processing event.
 *
 * Body: { storage_path, file_name, file_size_bytes, mime_type, session_id? }
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
    const { storage_path, file_name, file_size_bytes, mime_type, session_id } = body

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
        ...(session_id ? { session_id } : {}),
      })
      .select()
      .single()

    if (dbError) {
      console.error('DB insert error:', dbError)
      finalErrorMessage = `Failed to save upload record: ${dbError.message}`
      return NextResponse.json({ error: finalErrorMessage, details: dbError }, { status: 500 })
    }

    // Update session clip count if provided
    if (session_id) {
      await supabase.rpc('increment_session_clip_count', { session_id })
        .then(() => {}) // best-effort
    }

    // Automatic Inngest trigger disabled - now triggered manually via UI
    /*
    try {
      await inngest.send({
        name: 'video-upload/process',
        data: { video_upload_id: record.id, user_id: session.user.id },
      })
    } catch (inngestError) {
      console.error('Inngest event failed:', inngestError)
    }
    */

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
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('video_uploads')
      .select('id, file_name, file_size_bytes, mime_type, duration_seconds, status, tags, error_message, source_deleted, processed_at, recorded_at, created_at, updated_at')
      .eq('user_id', session.user.id)
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

    return NextResponse.json({ uploads: data })
  } catch (error) {
    console.error('List video uploads error:', error)
    return NextResponse.json({ error: 'Failed to fetch uploads' }, { status: 500 })
  }
}
