import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'
import { inngest } from '@/inngest/client'

const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB
const VALID_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/x-matroska',
]
const VALID_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
  'audio/x-m4a',
]
const VALID_TYPES = [...VALID_VIDEO_TYPES, ...VALID_AUDIO_TYPES]

/**
 * POST /api/video-upload
 *
 * Upload a video/audio file. After saving to storage and creating the DB record,
 * fires an Inngest event to process the file asynchronously (transcribe → analyze → entities).
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
      const run = await startJobRun('video-upload.upload', { user_id: session.user.id })
      runId = run.id
    } catch {
      // best-effort
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      finalErrorMessage = 'No file provided'
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    finalMeta = {
      user_id: session.user.id,
      file_type: file.type,
      file_size: file.size,
      file_name: file.name,
    }

    // Validate file type
    if (!VALID_TYPES.includes(file.type)) {
      finalErrorMessage = 'Invalid file type. Supported: MP4, MOV, WebM, AVI, MKV, MP3, M4A, WAV, OGG'
      return NextResponse.json({ error: finalErrorMessage }, { status: 400 })
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      finalErrorMessage = 'File too large (max 500MB)'
      return NextResponse.json({ error: finalErrorMessage }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Generate storage path
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${session.user.id}/videos/${timestamp}_${sanitizedName}`

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('videos')
      .upload(storagePath, buffer, {
        contentType: file.type,
        cacheControl: '86400',
      })

    if (uploadError) {
      console.error('Video upload error:', uploadError)
      finalErrorMessage = 'Upload failed'
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    // Record in database
    const { data: record, error: dbError } = await supabase
      .from('video_uploads')
      .insert({
        user_id: session.user.id,
        file_name: file.name,
        file_size_bytes: file.size,
        mime_type: file.type,
        storage_path: storagePath,
        storage_provider: 'supabase',
        status: 'uploaded',
      })
      .select()
      .single()

    if (dbError) {
      console.error('DB insert error:', dbError)
      await supabase.storage.from('videos').remove([storagePath])
      finalErrorMessage = 'Failed to save upload record'
      return NextResponse.json({ error: finalErrorMessage }, { status: 500 })
    }

    // Fire Inngest event to process asynchronously
    try {
      await inngest.send({
        name: 'video-upload/process',
        data: {
          video_upload_id: record.id,
          user_id: session.user.id,
        },
      })
    } catch (inngestError) {
      console.error('Inngest event failed, falling back to manual processing:', inngestError)
      // Don't fail the upload — user can trigger processing manually via /process endpoint
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
    console.error('Video upload error:', error)
    finalErrorMessage = 'Upload failed'
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
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
      .select('id, file_name, file_size_bytes, mime_type, duration_seconds, status, tags, error_message, source_deleted, processed_at, created_at, updated_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch uploads' }, { status: 500 })
    }

    return NextResponse.json({ uploads: data })
  } catch (error) {
    console.error('List video uploads error:', error)
    return NextResponse.json({ error: 'Failed to fetch uploads' }, { status: 500 })
  }
}
