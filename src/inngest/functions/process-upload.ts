/**
 * Inngest function: process-video-upload
 *
 * Durable, step-based pipeline that runs asynchronously after a video/audio
 * file is uploaded. Each step is a separate serverless invocation with
 * automatic retries, so we never hit Vercel's function timeout.
 *
 * Pipeline:
 *   upload registered
 *   → extract-audio (Replicate FFmpeg: video → small audio file)
 *   → transcribe (chunked Whisper on the audio)
 *   → save-transcript
 *   → analyze (AI analysis of transcript)
 *   → save-analysis
 *   → upsert-entities
 *
 * Each step writes to video_uploads.pipeline_log so you can see exactly
 * where in the chain any failure occurred, in real time.
 */

import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import {
  runAnalysis,
  scrubPiiFromTranscript,
  extractTags,
  generateClipSuggestions,
  generatePostSuggestions,
  upsertEntities,
} from '@/lib/video-analysis'
import {
  isVideoMimeType,
} from '@/lib/audio-processing'
import Replicate from 'replicate'

type ProcessUploadEvent = {
  name: 'video-upload/process'
  data: {
    video_upload_id: string
    user_id: string
  }
}

// ─── Logging helper ───────────────────────────────────────────────────────────
// Writes one entry to video_uploads.pipeline_log via an atomic SQL function.
// Never throws — logging failures must not break the pipeline.

type LogStatus = 'running' | 'done' | 'error' | 'skipped'

async function plog(
  admin: ReturnType<typeof createAdminClient>,
  uploadId: string,
  step: string,
  status: LogStatus,
  detail?: string,
) {
  if (!admin) return
  try {
    await admin.rpc('append_pipeline_log', {
      upload_id: uploadId,
      log_entry: {
        step,
        status,
        ts: new Date().toISOString(),
        ...(detail ? { detail } : {}),
      },
    })
  } catch (err) {
    console.error(`[plog] Failed to write log entry for step "${step}":`, err)
  }
}

// ─── Function ─────────────────────────────────────────────────────────────────

export const processUpload = inngest.createFunction(
  {
    id: 'process-video-upload',
    name: 'Process Video Upload',
    retries: 2,
    cancelOn: [{ event: 'video-upload/cancel', match: 'data.video_upload_id' }],
    onFailure: async ({ event, error }) => {
      const admin = createAdminClient()
      if (!admin) return
      const { video_upload_id } = event.data.event.data as { video_upload_id: string; user_id: string }
      await admin.from('video_uploads').update({
        status: 'error',
        error_message: error.message || 'Processing failed. Please try again.',
        updated_at: new Date().toISOString(),
      }).eq('id', video_upload_id)
      await plog(admin, video_upload_id, 'pipeline', 'error', error.message)
    },
  },
  { event: 'video-upload/process' },
  async ({ event, step }) => {
    const { video_upload_id, user_id } = event.data

    const admin = createAdminClient()
    if (!admin) throw new Error('Admin client not available')

    // Pre-flight: the very first DB write proves the function was triggered at all.
    // This happens outside any step so it runs immediately on function start.
    await plog(admin, video_upload_id, 'preflight', 'running', 'Inngest function received event')

    // ── Step 1: Fetch upload record and resolve API keys ──
    const context = await step.run('fetch-context', async () => {
      await plog(admin, video_upload_id, 'fetch-context', 'running')

      const { data: upload, error } = await admin
        .from('video_uploads')
        .select('*')
        .eq('id', video_upload_id)
        .eq('user_id', user_id)
        .single()

      if (error || !upload) {
        await plog(admin, video_upload_id, 'fetch-context', 'error', `Upload not found: ${error?.message}`)
        throw new Error('Upload not found')
      }

      if (upload.status === 'processed') {
        await plog(admin, video_upload_id, 'fetch-context', 'skipped', 'Already processed')
        return { skip: true as const, upload }
      }

      const openaiKey = await resolveProviderKeyWithClient(admin, user_id, 'openai')
      const anthropicKey = await resolveProviderKeyWithClient(admin, user_id, 'anthropic')

      // Fetch user profile for personalization
      const { data: profile } = await admin
        .from('profiles')
        .select('display_name, username')
        .eq('id', user_id)
        .single()

      const userName = profile?.display_name || profile?.username || 'the user'

      if (!openaiKey && !anthropicKey) {
        const msg = 'No AI API key found. Add an Anthropic or OpenAI key in Settings → API Keys.'
        await admin.from('video_uploads').update({
          status: 'error',
          error_message: msg,
          updated_at: new Date().toISOString(),
        }).eq('id', video_upload_id)
        await plog(admin, video_upload_id, 'fetch-context', 'error', msg)
        throw new Error(msg)
      }

      const keyInfo = openaiKey ? 'openai' : 'anthropic'
      await plog(admin, video_upload_id, 'fetch-context', 'done', `API key resolved: ${keyInfo}, user: ${userName}`)

      return {
        skip: false as const,
        upload,
        userName,
        openaiKey: openaiKey?.key || null,
        anthropicKey: anthropicKey?.key || null,
      }
    })

    if (context.skip) return { status: 'already_processed', video_upload_id }

    // ── Step 2: Extract audio (video files only) ──
    const audioPath = await step.run('extract-audio', async () => {
      const { upload } = context

      if (!isVideoMimeType(upload.mime_type)) {
        await plog(admin, video_upload_id, 'extract-audio', 'skipped', `Not a video file (${upload.mime_type})`)
        return { path: upload.storage_path, extracted: false }
      }

      await plog(admin, video_upload_id, 'extract-audio', 'running', 'Starting Replicate FFmpeg audio extraction')
      await admin.from('video_uploads').update({
        status: 'transcribing',
        updated_at: new Date().toISOString(),
      }).eq('id', video_upload_id)

      const replicateToken = process.env.REPLICATE_API_TOKEN
      if (!replicateToken) {
        await plog(admin, video_upload_id, 'extract-audio', 'skipped', 'REPLICATE_API_TOKEN not set — using source file directly')
        return { path: upload.storage_path, extracted: false }
      }

      const { data: signedData, error: signedError } = await admin.storage
        .from('videos')
        .createSignedUrl(upload.storage_path, 3600)

      if (signedError || !signedData?.signedUrl) {
        await plog(admin, video_upload_id, 'extract-audio', 'error', `Signed URL failed: ${signedError?.message}`)
        return { path: upload.storage_path, extracted: false }
      }

      await plog(admin, video_upload_id, 'extract-audio', 'running', 'Signed URL created, calling Replicate')

      try {
        const replicate = new Replicate({ auth: replicateToken })
        const output = await replicate.run(
          'fofr/video-to-audio:bf8b48a8f1c2e3a7f9d7e4b6c5a0d3e2f1b4c7a6e9d2f5c8b1e4a7d0f3c6b9e2' as any,
          {
            input: {
              video_url: signedData.signedUrl,
              sample_rate: 16000,
              channels: 1,
              format: 'm4a',
            },
          },
        )

        if (!output || typeof output !== 'string') {
          await plog(admin, video_upload_id, 'extract-audio', 'skipped', 'Replicate returned empty output — using source file')
          return { path: upload.storage_path, extracted: false }
        }

        await plog(admin, video_upload_id, 'extract-audio', 'running', 'Audio extracted, uploading to storage')

        const audioResponse = await fetch(output as string)
        const audioBuffer = Buffer.from(await audioResponse.arrayBuffer())
        const timestamp = Date.now()
        const audioStoragePath = `${user_id}/audio/${timestamp}_extracted.m4a`

        const { error: audioUploadError } = await admin.storage
          .from('videos')
          .upload(audioStoragePath, audioBuffer, {
            contentType: 'audio/mp4',
            cacheControl: '86400',
          })

        if (audioUploadError) {
          await plog(admin, video_upload_id, 'extract-audio', 'error', `Storage upload failed: ${audioUploadError.message}`)
          return { path: upload.storage_path, extracted: false }
        }

        await plog(admin, video_upload_id, 'extract-audio', 'done', `Extracted audio saved: ${audioStoragePath}`)
        return { path: audioStoragePath, extracted: true }
      } catch (err: any) {
        await plog(admin, video_upload_id, 'extract-audio', 'error', `Replicate error: ${err?.message || String(err)}`)
        return { path: upload.storage_path, extracted: false }
      }
    })

    // ── Step 2b: Extract Metadata (recorded_at) ──
    const metadata = await step.run('extract-metadata', async () => {
      const { upload } = context
      await plog(admin, video_upload_id, 'extract-metadata', 'running')

      if (!isVideoMimeType(upload.mime_type) && !upload.mime_type.startsWith('audio/')) {
        await plog(admin, video_upload_id, 'extract-metadata', 'skipped', 'Not audio/video')
        return { recorded_at: upload.created_at }
      }

      try {
        const { data: signedData } = await admin.storage
          .from('videos')
          .createSignedUrl(upload.storage_path, 600)

        if (signedData?.signedUrl) {
          const ffprobe = require('ffprobe-client')
          const info = await ffprobe(signedData.signedUrl)
          
          console.log(`[DEBUG] ffprobe info for ${video_upload_id}:`, JSON.stringify(info.format?.tags || {}, null, 2))

          // Try multiple tag locations for creation_time
          const creationDate =
            info.format?.tags?.creation_time ||
            info.streams?.find((s: any) => s.tags?.creation_time)?.tags?.creation_time ||
            info.format?.tags?.['creation_time-eng'] ||
            info.format?.tags?.['com.apple.quicktime.creationdate']

          if (creationDate) {
            const recordedAt = new Date(creationDate).toISOString()
            await admin.from('video_uploads').update({ recorded_at: recordedAt }).eq('id', video_upload_id)
            await plog(admin, video_upload_id, 'extract-metadata', 'done', `recorded_at: ${recordedAt}`)
            return { recorded_at: recordedAt }
          }
        }
        await plog(admin, video_upload_id, 'extract-metadata', 'done', 'No creation_time tag found, using upload timestamp')
      } catch (err: any) {
        await plog(admin, video_upload_id, 'extract-metadata', 'skipped', `ffprobe failed: ${err?.message}`)
      }

      const defaultDate = upload.recorded_at || upload.created_at
      return { recorded_at: defaultDate }
    })

    // ── Step 3: Transcribe ──
    const transcription = await step.run('transcribe', async () => {
      await plog(admin, video_upload_id, 'transcribe', 'running', `Audio path: ${audioPath.path}`)

      if (context.upload.status !== 'transcribing') {
        await admin.from('video_uploads').update({
          status: 'transcribing',
          updated_at: new Date().toISOString(),
        }).eq('id', video_upload_id)
      }

      // Plain text files — no transcription needed
      if (context.upload.mime_type === 'text/plain') {
        const { data: fileData } = await admin.storage.from('videos').download(audioPath.path)
        const buffer = fileData ? Buffer.from(await fileData.arrayBuffer()) : Buffer.alloc(0)
        const text = buffer.toString('utf-8')
        await plog(admin, video_upload_id, 'transcribe', 'done', `Text file, ${text.length} chars`)
        return { text, segments: [], language: null, duration: null }
      }

      const { data: signedData, error: signedError } = await admin.storage
        .from('videos')
        .createSignedUrl(audioPath.path, 3600)

      if (signedError || !signedData?.signedUrl) {
        await plog(admin, video_upload_id, 'transcribe', 'error', `Signed URL failed: ${signedError?.message}`)
        throw new Error('Failed to generate signed URL for transcription')
      }

      const replicateToken = process.env.REPLICATE_API_TOKEN
      if (!replicateToken) {
        await plog(admin, video_upload_id, 'transcribe', 'error', 'REPLICATE_API_TOKEN not set')
        throw new Error('REPLICATE_API_TOKEN not set')
      }

      await plog(admin, video_upload_id, 'transcribe', 'running', 'Calling Replicate Whisper large-v3')

      const replicate = new Replicate({ auth: replicateToken })
      const output = await replicate.run(
        'openai/whisper:8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e',
        {
          input: {
            audio: signedData.signedUrl,
            model: 'large-v3',
            transcription: 'plain text',
            language: 'auto',
            word_timestamps: false,
          },
        }
      ) as any

      const text = output?.transcription || ''
      const segments = (output?.segments || []).map((s: any) => ({
        start: s.start,
        end: s.end,
        text: s.text,
      }))
      const duration = segments.length > 0 ? segments[segments.length - 1].end : null

      await plog(admin, video_upload_id, 'transcribe', 'done', `${text.length} chars, ${segments.length} segments, lang: ${output?.detected_language || 'unknown'}`)
      return { text, segments, language: output?.detected_language || null, duration }
    })

    // ── Step 4: Save transcript ──
    await step.run('save-transcript', async () => {
      await plog(admin, video_upload_id, 'save-transcript', 'running', `${transcription.text.length} chars`)

      const updateData: Record<string, any> = {
        transcript: transcription.text,
        transcript_segments: transcription.segments,
        transcript_language: transcription.language,
        transcript_model: 'whisper-large-v3',
        updated_at: new Date().toISOString(),
      }
      if (transcription.duration) updateData.duration_seconds = transcription.duration

      await admin.from('video_uploads').update(updateData).eq('id', video_upload_id)

      if (audioPath.extracted) {
        await admin.storage.from('videos').remove([audioPath.path])
      }

      await plog(admin, video_upload_id, 'save-transcript', 'done')
    })

    // ── Step 5: AI Analysis ──
    const analysisResult = await step.run('analyze', async () => {
      await plog(admin, video_upload_id, 'analyze', 'running', `Transcript: ${transcription.text.length} chars`)
      await admin.from('video_uploads').update({
        status: 'analyzing',
        updated_at: new Date().toISOString(),
      }).eq('id', video_upload_id)

      const { analysis, modelUsed } = await runAnalysis(
        transcription.text,
        context.openaiKey,
        context.anthropicKey,
        context.userName,
      )

      await plog(admin, video_upload_id, 'analyze', 'done', `Model: ${modelUsed}`)
      return { analysis, modelUsed }
    })

    // ── Step 6: Post-process and save everything ──
    await step.run('save-analysis', async () => {
      await plog(admin, video_upload_id, 'save-analysis', 'running')
      const { analysis, modelUsed } = analysisResult

      const scrubbedTranscript = scrubPiiFromTranscript(transcription.text)
      const uniqueTags = extractTags(analysis)
      const generatedClips = generateClipSuggestions(transcription.segments || [], analysis.key_quotes || [])
      const generatedPosts = generatePostSuggestions(analysis, metadata?.recorded_at)

      const updateData: Record<string, any> = {
        analysis,
        analysis_model: modelUsed,
        tags: uniqueTags,
        generated_clips: generatedClips,
        generated_posts: generatedPosts,
        status: 'processed',
        recorded_at: metadata?.recorded_at || new Date().toISOString(),
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (scrubbedTranscript !== transcription.text) {
        updateData.transcript = scrubbedTranscript
      }

      await admin.from('video_uploads').update(updateData).eq('id', video_upload_id)
      await plog(admin, video_upload_id, 'save-analysis', 'done', `Tags: ${uniqueTags.join(', ') || 'none'}`)
    })

    // ── Step 7: Extract and accumulate entities ──
    await step.run('upsert-entities', async () => {
      await plog(admin, video_upload_id, 'upsert-entities', 'running')
      await upsertEntities(admin, user_id, { videoUploadId: video_upload_id }, analysisResult.analysis)
      await plog(admin, video_upload_id, 'upsert-entities', 'done')
    })

    // ── Step 8: Create timeline Log Entry ──
    await step.run('create-log-entry', async () => {
      await plog(admin, video_upload_id, 'create-log-entry', 'running')
      const { analysis } = analysisResult
      
      const recordedAt = metadata?.recorded_at || context.upload.created_at

      // Check if entry already exists to avoid duplicates
      const { data: existing } = await admin
        .from('log_entries')
        .select('id')
        .eq('source_upload_id', video_upload_id)
        .maybeSingle()

      if (existing) {
        await plog(admin, video_upload_id, 'create-log-entry', 'skipped', 'Log entry already exists')
        return
      }

      const { error: logError } = await admin
        .from('log_entries')
        .insert({
          user_id,
          entry_type: 'session',
          title: analysis.summary ? (analysis.summary.length > 80 ? analysis.summary.substring(0, 77) + '...' : analysis.summary) : `Video Upload: ${context.upload.file_name}`,
          body: analysis.summary || null,
          logged_at: recordedAt,
          source_upload_id: video_upload_id,
          is_public: false,
          meta: {
            model: analysisResult.modelUsed,
            categories: analysis.categories,
            mood: analysis.mood,
            reflections: analysis.reflections,
          }
        })

      if (logError) {
        await plog(admin, video_upload_id, 'create-log-entry', 'error', `Failed to create log entry: ${logError.message}`)
        console.error('Failed to create log entry:', logError)
      } else {
        await plog(admin, video_upload_id, 'create-log-entry', 'done', 'Timeline entry created ✓')
      }
    })

    return { status: 'processed', video_upload_id, model: analysisResult.modelUsed }
  },
)
