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
  needsChunking,
  chunkBuffer,
  getAudioExtension,
  isVideoMimeType,
  mergeTranscriptions,
} from '@/lib/audio-processing'
import OpenAI from 'openai'
import Replicate from 'replicate'

type ProcessUploadEvent = {
  name: 'video-upload/process'
  data: {
    video_upload_id: string
    user_id: string
  }
}

export const processUpload = inngest.createFunction(
  {
    id: 'process-video-upload',
    name: 'Process Video Upload',
    retries: 2,
    cancelOn: [{ event: 'video-upload/cancel', match: 'data.video_upload_id' }],
  },
  { event: 'video-upload/process' },
  async ({ event, step }) => {
    const { video_upload_id, user_id } = event.data

    const admin = createAdminClient()
    if (!admin) throw new Error('Admin client not available')

    // ── Step 1: Fetch upload record and resolve API keys ──
    const context = await step.run('fetch-context', async () => {
      const { data: upload, error } = await admin
        .from('video_uploads')
        .select('*')
        .eq('id', video_upload_id)
        .eq('user_id', user_id)
        .single()

      if (error || !upload) throw new Error('Upload not found')
      if (upload.status === 'processed') return { skip: true as const, upload }

      const openaiKey = await resolveProviderKeyWithClient(admin, user_id, 'openai')
      if (!openaiKey) {
        await admin.from('video_uploads').update({
          status: 'error',
          error_message: 'OpenAI API key required for transcription. Add one in Settings > API Keys.',
          updated_at: new Date().toISOString(),
        }).eq('id', video_upload_id)
        throw new Error('OpenAI API key required')
      }

      const anthropicKey = await resolveProviderKeyWithClient(admin, user_id, 'anthropic')

      return {
        skip: false as const,
        upload,
        openaiKey: openaiKey.key,
        anthropicKey: anthropicKey?.key || null,
      }
    })

    if (context.skip) return { status: 'already_processed', video_upload_id }

    // ── Step 2: Extract audio (video files only) ──
    // For large video files, extract just the audio track via Replicate FFmpeg.
    // This converts a 4GB video into a ~30-60MB audio file that fits in serverless memory.
    // Audio files skip this step.
    const audioPath = await step.run('extract-audio', async () => {
      const { upload } = context

      // Audio-only files don't need extraction
      if (!isVideoMimeType(upload.mime_type)) {
        return { path: upload.storage_path, extracted: false }
      }

      await admin.from('video_uploads').update({
        status: 'transcribing',
        updated_at: new Date().toISOString(),
      }).eq('id', video_upload_id)

      const replicateToken = process.env.REPLICATE_API_TOKEN
      if (!replicateToken) {
        // No Replicate token — fall back to downloading the raw video
        // This will work for smaller videos but may OOM for 4GB+
        console.warn('REPLICATE_API_TOKEN not set — falling back to direct download')
        return { path: upload.storage_path, extracted: false }
      }

      // Generate a signed URL for the video (1 hour expiry)
      const { data: signedData, error: signedError } = await admin.storage
        .from('videos')
        .createSignedUrl(upload.storage_path, 3600)

      if (signedError || !signedData?.signedUrl) {
        console.error('Failed to generate signed URL:', signedError)
        return { path: upload.storage_path, extracted: false }
      }

      // Call Replicate FFmpeg to extract audio
      const replicate = new Replicate({ auth: replicateToken })

      const output = await replicate.run(
        'fofr/video-to-audio:bf8b48a8f1c2e3a7f9d7e4b6c5a0d3e2f1b4c7a6e9d2f5c8b1e4a7d0f3c6b9e2' as any,
        {
          input: {
            video_url: signedData.signedUrl,
            sample_rate: 16000,
            channels: 1,       // mono — optimal for Whisper
            format: 'm4a',
          },
        },
      )

      if (!output || typeof output !== 'string') {
        console.warn('Replicate audio extraction failed — falling back to direct download')
        return { path: upload.storage_path, extracted: false }
      }

      // Download the extracted audio and re-upload to storage
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
        console.error('Failed to upload extracted audio:', audioUploadError)
        return { path: upload.storage_path, extracted: false }
      }

      return { path: audioStoragePath, extracted: true }
    })

    // ── Step 3: Transcribe ──
    const transcription = await step.run('transcribe', async () => {
      if (context.upload.status !== 'transcribing') {
        await admin.from('video_uploads').update({
          status: 'transcribing',
          updated_at: new Date().toISOString(),
        }).eq('id', video_upload_id)
      }

      // Download the audio file (extracted audio or original audio)
      const storagePath = audioPath.path
      const mimeType = audioPath.extracted ? 'audio/mp4' : context.upload.mime_type

      const { data: fileData, error: downloadError } = await admin.storage
        .from('videos')
        .download(storagePath)

      if (downloadError || !fileData) throw new Error('Failed to download audio from storage')

      const arrayBuffer = await fileData.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const ext = getAudioExtension(mimeType)
      const openai = new OpenAI({ apiKey: context.openaiKey })

      if (!needsChunking(buffer.length)) {
        const file = new File([buffer.buffer as ArrayBuffer], `audio.${ext}`, { type: mimeType })
        const result = await openai.audio.transcriptions.create({
          file,
          model: 'whisper-1',
          response_format: 'verbose_json',
          timestamp_granularities: ['segment'],
        })

        const segments = (result as any).segments?.map((s: any) => ({
          start: s.start, end: s.end, text: s.text,
        })) || []

        return {
          text: result.text,
          segments,
          language: (result as any).language || null,
          duration: (result as any).duration || null,
        }
      }

      // Large file — chunk and transcribe each piece
      const chunks = chunkBuffer(buffer)
      const results: Array<{
        text: string
        segments?: Array<{ start: number; end: number; text: string }>
        duration?: number
      }> = []

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        const file = new File([chunk.buffer as ArrayBuffer], `chunk_${i}.${ext}`, { type: mimeType })
        const result = await openai.audio.transcriptions.create({
          file,
          model: 'whisper-1',
          response_format: 'verbose_json',
          timestamp_granularities: ['segment'],
        })
        results.push({
          text: result.text,
          segments: (result as any).segments?.map((s: any) => ({
            start: s.start, end: s.end, text: s.text,
          })) || [],
          duration: (result as any).duration || 0,
        })
      }

      const merged = mergeTranscriptions(results)
      return { text: merged.text, segments: merged.segments, language: null, duration: merged.totalDuration }
    })

    // ── Step 4: Save transcript ──
    await step.run('save-transcript', async () => {
      const updateData: Record<string, any> = {
        transcript: transcription.text,
        transcript_segments: transcription.segments,
        transcript_language: transcription.language,
        transcript_model: 'whisper-1',
        updated_at: new Date().toISOString(),
      }
      if (transcription.duration) updateData.duration_seconds = transcription.duration

      await admin.from('video_uploads').update(updateData).eq('id', video_upload_id)

      // Clean up extracted audio file to save storage space
      if (audioPath.extracted) {
        await admin.storage.from('videos').remove([audioPath.path])
      }
    })

    // ── Step 5: AI Analysis ──
    const analysisResult = await step.run('analyze', async () => {
      await admin.from('video_uploads').update({
        status: 'analyzing',
        updated_at: new Date().toISOString(),
      }).eq('id', video_upload_id)

      const { analysis, modelUsed } = await runAnalysis(
        transcription.text,
        context.openaiKey,
        context.anthropicKey,
      )

      return { analysis, modelUsed }
    })

    // ── Step 6: Post-process and save everything ──
    await step.run('save-analysis', async () => {
      const { analysis, modelUsed } = analysisResult

      const scrubbedTranscript = scrubPiiFromTranscript(transcription.text)
      const uniqueTags = extractTags(analysis)
      const generatedClips = generateClipSuggestions(transcription.segments || [], analysis.key_quotes || [])
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

      if (scrubbedTranscript !== transcription.text) {
        updateData.transcript = scrubbedTranscript
      }

      await admin.from('video_uploads').update(updateData).eq('id', video_upload_id)
    })

    // ── Step 7: Extract and accumulate entities ──
    await step.run('upsert-entities', async () => {
      await upsertEntities(admin, user_id, video_upload_id, analysisResult.analysis)
    })

    return { status: 'processed', video_upload_id, model: analysisResult.modelUsed }
  },
)
