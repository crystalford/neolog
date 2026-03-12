import { createAdminClient } from '@/lib/supabase/admin'
import { inngest } from '@/inngest/client'
import { isVideoMimeType } from '@/lib/audio-processing'
import { runAnalysis } from '@/lib/video-analysis'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import Replicate from 'replicate'

// Helper for logging to processing_logs table
async function plog(supabase: any, uploadId: string, step: string, status: string, message?: string) {
  if (!supabase) return
  await supabase.from('processing_logs').insert({
    video_upload_id: uploadId,
    step,
    status,
    message,
    created_at: new Date().toISOString()
  })
}

export const processUpload = inngest.createFunction(
  { id: 'process-upload' },
  { event: 'video-upload/process' },
  async ({ event, step }) => {
    const { video_upload_id, user_id } = event.data
    const admin = createAdminClient()

    if (!admin) {
      console.error('Failed to create admin client')
      return { status: 'error', error: 'admin_client_failed' }
    }

    // Pre-flight
    await plog(admin, video_upload_id, 'preflight', 'running', 'Inngest function received event')

    // ── Step 1: Fetch context ──
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

      const openaiKeyRes = await resolveProviderKeyWithClient(admin, user_id, 'openai')
      const anthropicKeyRes = await resolveProviderKeyWithClient(admin, user_id, 'anthropic')

      // Fetch user profile for personalization
      const { data: profile } = await admin
        .from('profiles')
        .select('display_name, username')
        .eq('id', user_id)
        .single()

      const userName = profile?.display_name || profile?.username || 'the user'

      if (!openaiKeyRes && !anthropicKeyRes) {
        const msg = 'No AI API key found. Add an Anthropic or OpenAI key in Settings → API Keys.'
        await admin.from('video_uploads').update({
          status: 'error',
          error_message: msg,
          updated_at: new Date().toISOString(),
        }).eq('id', video_upload_id)
        await plog(admin, video_upload_id, 'fetch-context', 'error', msg)
        throw new Error(msg)
      }

      return {
        skip: false as const,
        upload,
        userName,
        openaiKey: openaiKeyRes?.key || null,
        anthropicKey: anthropicKeyRes?.key || null,
      }
    })

    if (context.skip) return { status: 'already_processed', video_upload_id }

    // Use type narrowing or casting since we checked context.skip
    const activeContext = context as Extract<typeof context, { skip: false }>

    // ── Step 2: Extract audio (video files only) ──
    const audioPath = await step.run('extract-audio', async () => {
      const { upload } = activeContext

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

        const audioResponse = await fetch(output as string)
        const audioBuffer = Buffer.from(await audioResponse.arrayBuffer())
        const timestamp = Date.now()
        const audioStoragePath = `${user_id}/audio/${timestamp}_extracted.m4a`

        await admin.storage
          .from('videos')
          .upload(audioStoragePath, audioBuffer, {
            contentType: 'audio/mp4',
            cacheControl: '86400',
          })

        await plog(admin, video_upload_id, 'extract-audio', 'done', `Extracted audio saved: ${audioStoragePath}`)
        return { path: audioStoragePath, extracted: true }
      } catch (err: any) {
        await plog(admin, video_upload_id, 'extract-audio', 'error', `Replicate error: ${err?.message || String(err)}`)
        return { path: upload.storage_path, extracted: false }
      }
    })

    // ── Step 2b: Extract Metadata (exhaustive backdating check) ──
    const metadata = await step.run('extract-metadata', async () => {
      const { upload } = activeContext
      await plog(admin, video_upload_id, 'extract-metadata', 'running')

      if (!isVideoMimeType(upload.mime_type) && !upload.mime_type.startsWith('audio/')) {
        await plog(admin, video_upload_id, 'extract-metadata', 'skipped', 'Not audio/video')
        return { recorded_at: (upload as any).created_at }
      }

      try {
        const { data: signedData } = await admin.storage
          .from('videos')
          .createSignedUrl(upload.storage_path, 600)

        if (signedData?.signedUrl) {
          const ffprobe = require('ffprobe-client')
          const info = await ffprobe(signedData.signedUrl)
          
          // Exhaustive check for creation dates
          const creationDate =
            info.format?.tags?.['com.apple.quicktime.creationdate'] || // Primary for modern iPhone videos
            info.format?.tags?.creation_time ||                        // Standard MP4 meta
            info.streams?.find((s: any) => s.tags?.creation_time)?.tags?.creation_time ||
            info.format?.tags?.['creation_time-eng'] ||
            info.format?.tags?.['date'] ||                             // Common in older formats
            info.format?.tags?.['encoded_date']

          if (creationDate) {
            // Clean up apple format (e.g. 2025-12-29T14:30:00-0500)
            const recordedAt = new Date(creationDate).toISOString()
            await admin.from('video_uploads').update({ recorded_at: recordedAt }).eq('id', video_upload_id)
            await plog(admin, video_upload_id, 'extract-metadata', 'done', `Found recorded_at: ${recordedAt}`)
            return { recorded_at: recordedAt }
          }
        }
        await plog(admin, video_upload_id, 'extract-metadata', 'done', 'No creation_time tags found, defaulting to upload time')
      } catch (err: any) {
        await plog(admin, video_upload_id, 'extract-metadata', 'skipped', `ffprobe failed: ${err?.message}`)
      }

      return { recorded_at: (upload as any).recorded_at || (upload as any).created_at }
    })

    // ── Step 3: Transcribe ──
    const transcription = await step.run('transcribe', async () => {
      await plog(admin, video_upload_id, 'transcribe', 'running')

      if (activeContext.upload.mime_type === 'text/plain') {
        const { data: fileData } = await admin.storage.from('videos').download(audioPath.path)
        const text = fileData ? Buffer.from(await fileData.arrayBuffer()).toString('utf-8') : ''
        return { text, language: 'en' }
      }

      const replicateToken = process.env.REPLICATE_API_TOKEN
      if (!replicateToken) throw new Error('REPLICATE_API_TOKEN missing for transcribing')

      const { data: signedData } = await admin.storage
        .from('videos')
        .createSignedUrl(audioPath.path, 3600)

      const replicate = new Replicate({ auth: replicateToken })
      const result = await replicate.run(
        'openai/whisper:4d4b3d757d540203f19e487da847d8b51d6ed5dd2ac8f1076b66d4f6d49bc788' as any,
        { input: { audio: signedData?.signedUrl, translate: false } }
      ) as any

      const text = result.transcription || result.text || ''
      await admin.from('video_uploads').update({
        transcript: text,
        status: 'analyzing',
        updated_at: new Date().toISOString(),
      }).eq('id', video_upload_id)

      await plog(admin, video_upload_id, 'transcribe', 'done', `Transcription complete (${text.length} chars)`)
      return { text, language: result.language || 'en' }
    })

    // ── Step 4: Analyze ──
    const analysisResult = await step.run('analyze', async () => {
      await plog(admin, video_upload_id, 'analyze', 'running')
      
      // Fix: Position arguments for runAnalysis
      const result = await runAnalysis(
        transcription.text,
        activeContext.openaiKey,
        activeContext.anthropicKey,
        activeContext.userName
      )

      await admin.from('video_uploads').update({
        analysis: result.analysis,
        analysis_model: result.modelUsed,
        status: 'processed',
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', video_upload_id)

      await plog(admin, video_upload_id, 'analyze', 'done', 'AI analysis shared and saved')
      return result
    })

    // ── Step 5: Create rich Timeline Entry ──
    await step.run('create-log-entry', async () => {
      const analysis = analysisResult.analysis
      const recordedAt = metadata.recorded_at
      
      const { data: existing } = await admin.from('log_entries').select('id').eq('source_upload_id', video_upload_id).maybeSingle()
      if (existing) return

      // Construct rich body with summary, mood, and questions
      let richBody = analysis.summary || ''
      if (analysis.mood || analysis.energy_level) {
        richBody += `\n\nMood: ${analysis.mood || 'N/A'} | Energy: ${analysis.energy_level || 'N/A'}`
      }
      if (analysis.questions?.length > 0) {
        richBody += `\n\n**Open Questions:**\n` + analysis.questions.map((q: string) => `- ${q}`).join('\n')
      }

      await admin.from('log_entries').insert({
        user_id,
        entry_type: 'session',
        title: analysis.summary ? (analysis.summary.length > 80 ? analysis.summary.substring(0, 77) + '...' : analysis.summary) : `Video Session`,
        body: richBody,
        logged_at: recordedAt,
        source_upload_id: video_upload_id,
        is_public: true, // Defaulting to public for consistency
        thumbnail_url: (activeContext.upload as any).thumbnail_url,
        meta: {
          model: analysisResult.modelUsed,
          categories: analysis.categories,
          mood: analysis.mood,
          energy: analysis.energy_level,
          reflections: analysis.reflections,
          questions: analysis.questions
        }
      })

      await plog(admin, video_upload_id, 'create-log-entry', 'done', 'Rich timeline entry created (Public)')
    })

    return { status: 'success', video_upload_id }
  }
)
