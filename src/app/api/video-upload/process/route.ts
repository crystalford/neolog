import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProviderKey } from '@/lib/ai-provider'
import { NextRequest, NextResponse } from 'next/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'
import {
  runAnalysis,
  scrubPiiFromTranscript,
  extractTags,
  generateClipSuggestions,
  generatePostSuggestions,
  upsertEntities,
} from '@/lib/video-analysis'
import OpenAI from 'openai'

export const maxDuration = 300

/**
 * POST /api/video-upload/process
 *
 * One-shot pipeline: given a video_upload_id that's been uploaded,
 * runs transcription → analysis → entity extraction → generates outputs.
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

    const body = await request.json()
    const { video_upload_id } = body

    if (!video_upload_id) {
      return NextResponse.json({ error: 'video_upload_id is required' }, { status: 400 })
    }

    try {
      const run = await startJobRun('video-upload.process', {
        user_id: session.user.id,
        video_upload_id,
      })
      runId = run.id
    } catch {
      // best-effort
    }

    finalMeta = { user_id: session.user.id, video_upload_id }

    // Verify ownership
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

    // Resolve keys
    const openaiKey = await resolveProviderKey(session.user.id, 'openai')
    if (!openaiKey) {
      finalErrorMessage = 'OpenAI API key required'
      return NextResponse.json({
        error: 'OpenAI API key required for transcription. Add one in Settings > API Keys.',
      }, { status: 402 })
    }

    const anthropicKey = await resolveProviderKey(session.user.id, 'anthropic')
    const admin = createAdminClient()

    // ========== STEP 1: Transcribe ==========
    let transcript = upload.transcript
    let transcriptSegments = upload.transcript_segments

    if (!transcript) {
      if (admin) {
        await admin
          .from('video_uploads')
          .update({ status: 'transcribing', updated_at: new Date().toISOString() })
          .eq('id', video_upload_id)
      }

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

      const openai = new OpenAI({ apiKey: openaiKey.key })
      const file = new File([fileData], upload.file_name, { type: upload.mime_type })

      const transcription = await openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
      })

      transcript = transcription.text
      transcriptSegments = (transcription as any).segments?.map((s: any) => ({
        start: s.start,
        end: s.end,
        text: s.text,
      })) || []
      const language = (transcription as any).language || null
      const duration = (transcription as any).duration || null

      const transcriptUpdate: Record<string, any> = {
        transcript,
        transcript_segments: transcriptSegments,
        transcript_language: language,
        transcript_model: 'whisper-1',
        updated_at: new Date().toISOString(),
      }
      if (duration) transcriptUpdate.duration_seconds = duration

      if (admin) {
        await admin
          .from('video_uploads')
          .update(transcriptUpdate)
          .eq('id', video_upload_id)
      }

      finalMeta.transcript_length = transcript.length
      finalMeta.segments_count = transcriptSegments.length
    }

    // ========== STEP 2: Analyze ==========
    if (!upload.analysis) {
      if (admin) {
        await admin
          .from('video_uploads')
          .update({ status: 'analyzing', updated_at: new Date().toISOString() })
          .eq('id', video_upload_id)
      }

      const { analysis, modelUsed } = await runAnalysis(
        transcript,
        openaiKey.key,
        anthropicKey?.key || null,
      )

      // PII scrub transcript
      const scrubbedTranscript = scrubPiiFromTranscript(transcript)
      const uniqueTags = extractTags(analysis)
      const generatedClips = generateClipSuggestions(transcriptSegments || [], analysis.key_quotes || [])
      const generatedPosts = generatePostSuggestions(analysis)

      const updateData: Record<string, any> = {
        analysis,
        analysis_model: modelUsed,
        tags: uniqueTags,
        generated_clips: generatedClips,
        generated_posts: generatedPosts,
        status: 'processed',
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (scrubbedTranscript !== transcript) {
        updateData.transcript = scrubbedTranscript
      }

      if (admin) {
        await admin
          .from('video_uploads')
          .update(updateData)
          .eq('id', video_upload_id)

        await upsertEntities(admin, session.user.id, video_upload_id, analysis)
      }

      finalMeta.analysis_model = modelUsed
      finalMeta.tags_count = uniqueTags.length
      finalMeta.clips_count = generatedClips.length
      finalMeta.pii_found = analysis.pii_detected?.length || 0
    } else {
      if (admin) {
        await admin
          .from('video_uploads')
          .update({ status: 'processed', processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', video_upload_id)
      }
    }

    finalStatus = 'success'

    const { data: result } = await supabase
      .from('video_uploads')
      .select('*')
      .eq('id', video_upload_id)
      .single()

    return NextResponse.json({
      id: video_upload_id,
      status: 'processed',
      upload: result,
    })
  } catch (error: any) {
    console.error('Processing pipeline error:', error)
    finalErrorMessage = error.message || 'Processing failed'

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

    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
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
