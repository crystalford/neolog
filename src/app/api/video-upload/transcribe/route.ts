import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProviderKey } from '@/lib/ai-provider'
import { NextRequest, NextResponse } from 'next/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'
import OpenAI from 'openai'

export const maxDuration = 300 // 5 min timeout for large files

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

    const body = await request.json()
    const { video_upload_id } = body

    if (!video_upload_id) {
      return NextResponse.json({ error: 'video_upload_id is required' }, { status: 400 })
    }

    try {
      const run = await startJobRun('video-upload.transcribe', {
        user_id: session.user.id,
        video_upload_id,
      })
      runId = run.id
    } catch {
      // best-effort
    }

    finalMeta = { user_id: session.user.id, video_upload_id }

    // Verify ownership and get upload record
    const { data: upload, error: fetchError } = await supabase
      .from('video_uploads')
      .select('*')
      .eq('id', video_upload_id)
      .eq('user_id', session.user.id)
      .single()

    if (fetchError || !upload) {
      finalErrorMessage = 'Upload not found'
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    if (upload.transcript) {
      return NextResponse.json({
        id: upload.id,
        status: upload.status,
        transcript: upload.transcript,
        transcript_segments: upload.transcript_segments,
        message: 'Already transcribed',
      })
    }

    // Resolve OpenAI key
    const keyResult = await resolveProviderKey(session.user.id, 'openai')
    if (!keyResult) {
      finalErrorMessage = 'OpenAI API key required for transcription'
      return NextResponse.json({
        error: 'OpenAI API key required for transcription. Add one in Settings > API Keys.',
      }, { status: 402 })
    }

    // Update status to transcribing
    const admin = createAdminClient()
    if (admin) {
      await admin
        .from('video_uploads')
        .update({ status: 'transcribing', updated_at: new Date().toISOString() })
        .eq('id', video_upload_id)
    }

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('videos')
      .download(upload.storage_path)

    if (downloadError || !fileData) {
      finalErrorMessage = 'Failed to download file from storage'
      if (admin) {
        await admin
          .from('video_uploads')
          .update({ status: 'error', error_message: finalErrorMessage, updated_at: new Date().toISOString() })
          .eq('id', video_upload_id)
      }
      return NextResponse.json({ error: finalErrorMessage }, { status: 500 })
    }

    // Whisper API accepts files up to 25MB directly
    // For larger files, we'd need to chunk the audio - but Whisper handles most formats
    const openai = new OpenAI({ apiKey: keyResult.key })

    // Convert Blob to File for OpenAI SDK
    const file = new File([fileData], upload.file_name, { type: upload.mime_type })

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    })

    const transcript = transcription.text
    const segments = (transcription as any).segments?.map((s: any) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    })) || []
    const language = (transcription as any).language || null
    const duration = (transcription as any).duration || null

    // Save transcript
    const updateData: Record<string, any> = {
      transcript,
      transcript_segments: segments,
      transcript_language: language,
      transcript_model: 'whisper-1',
      updated_at: new Date().toISOString(),
    }

    if (duration) {
      updateData.duration_seconds = duration
    }

    if (admin) {
      await admin
        .from('video_uploads')
        .update(updateData)
        .eq('id', video_upload_id)
    }

    finalStatus = 'success'
    finalMeta = {
      ...finalMeta,
      transcript_length: transcript.length,
      segments_count: segments.length,
      language,
      duration,
      key_source: keyResult.source,
    }

    return NextResponse.json({
      id: video_upload_id,
      transcript,
      transcript_segments: segments,
      transcript_language: language,
      duration_seconds: duration,
    })
  } catch (error: any) {
    console.error('Transcription error:', error)
    finalErrorMessage = error.message || 'Transcription failed'

    // Try to update status to error
    try {
      const admin = createAdminClient()
      if (admin) {
        const body = await request.clone().json().catch(() => ({}))
        if (body.video_upload_id) {
          await admin
            .from('video_uploads')
            .update({ status: 'error', error_message: finalErrorMessage, updated_at: new Date().toISOString() })
            .eq('id', body.video_upload_id)
        }
      }
    } catch {
      // best-effort
    }

    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
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
