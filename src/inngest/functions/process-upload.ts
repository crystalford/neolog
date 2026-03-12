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

      await plog(admin, video_upload_id, 'fetch-context', 'done', `Context fetched for ${userName}`)

      return {
        skip: false as const,
        upload,
        userName,
        openaiKey: openaiKeyRes?.key || null,
        anthropicKey: anthropicKeyRes?.key || null,
      }
    })

    if (context.skip) return { status: 'already_processed', video_upload_id }
    const activeContext = context as Extract<typeof context, { skip: false }>

    // ── Step 2: Extract audio (video files only) ──
    const audioPath = await step.run('extract-audio', async () => {
      const { upload } = activeContext
      
      // Ensure we are in a transcribing state
      await admin.from('video_uploads').update({
        status: 'transcribing',
        updated_at: new Date().toISOString(),
      }).eq('id', video_upload_id)

      if (!isVideoMimeType(upload.mime_type)) {
        await plog(admin, video_upload_id, 'extract-audio', 'skipped', `Not a video file (${upload.mime_type})`)
        return { path: upload.storage_path, extracted: false }
      }

      await plog(admin, video_upload_id, 'extract-audio', 'running', 'Starting Replicate FFmpeg audio extraction')

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
          
          // Exhaustive check for creation dates (Media Created / Origin tags)
          const creationDate =
            info.format?.tags?.['com.apple.quicktime.creationdate'] || 
            info.format?.tags?.creation_time ||                        
            info.streams?.find((s: any) => s.tags?.creation_time)?.tags?.creation_time ||
            info.format?.tags?.['creation_time-eng'] ||
            info.format?.tags?.['date'] ||
            info.format?.tags?.['encoded_date'] ||
            info.format?.tags?.['TAG:creation_time'] ||
            info.format?.tags?.['com.apple.quicktime.creationdate']

          if (creationDate) {
            const recordedAt = new Date(creationDate).toISOString()
            await admin.from('video_uploads').update({ recorded_at: recordedAt }).eq('id', video_upload_id)
            await plog(admin, video_upload_id, 'extract-metadata', 'done', `Found recorded_at: ${recordedAt} from tag`)
            return { recorded_at: recordedAt }
          }
        }
        await plog(admin, video_upload_id, 'extract-metadata', 'done', 'No creation_time tags found')
      } catch (err: any) {
        await plog(admin, video_upload_id, 'extract-metadata', 'skipped', `ffprobe failed: ${err?.message}`)
      }

      return { recorded_at: (upload as any).recorded_at || (upload as any).created_at }
    })

    // ── Step 3: Transcribe ──
    const transcription = await step.run('transcribe', async () => {
      await plog(admin, video_upload_id, 'transcribe', 'running', `Audio path: ${audioPath.path}`)

      if (activeContext.upload.mime_type === 'text/plain') {
        const { data: fileData } = await admin.storage.from('videos').download(audioPath.path)
        const text = fileData ? Buffer.from(await fileData.arrayBuffer()).toString('utf-8') : ''
        return { text, language: 'en', segments: [] }
      }

      const replicateToken = process.env.REPLICATE_API_TOKEN
      if (!replicateToken) throw new Error('REPLICATE_API_TOKEN missing')

      const { data: signedData } = await admin.storage
        .from('videos')
        .createSignedUrl(audioPath.path, 3600)

      if (!signedData?.signedUrl) throw new Error('Failed to sign audio URL')

      const replicate = new Replicate({ auth: replicateToken })
      // REVERTED: Using known-good model version and parameters
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

      await plog(admin, video_upload_id, 'transcribe', 'done', `${text.length} chars transcribed`)
      return { text, language: output?.detected_language || 'en', segments }
    })

    // ── Step 4: Analyze ──
    const analysisResult = await step.run('analyze', async () => {
      await plog(admin, video_upload_id, 'analyze', 'running')
      
      await admin.from('video_uploads').update({
        transcript: transcription.text,
        transcript_segments: transcription.segments,
        status: 'analyzing',
        updated_at: new Date().toISOString(),
      }).eq('id', video_upload_id)

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

      await plog(admin, video_upload_id, 'analyze', 'done', `Analyzed with ${result.modelUsed}`)
      return result
    })

    // ── Step 5: Create rich Timeline Entry ──
    await step.run('create-log-entry', async () => {
      const analysis = analysisResult.analysis
      const recordedAt = metadata.recorded_at
      
      const { data: existing } = await admin.from('log_entries').select('id').eq('source_upload_id', video_upload_id).maybeSingle()
      if (existing) {
        await plog(admin, video_upload_id, 'create-log-entry', 'skipped', 'Already exists')
        return
      }

      // Construct rich body with summary, mood, and questions (3rd person)
      let richBody = analysis.summary || ''
      if (analysis.mood || analysis.energy_level) {
        richBody += `\n\nMood: ${analysis.mood || 'N/A'} | Energy: ${analysis.energy_level || 'N/A'}`
      }
      if (analysis.questions?.length > 0) {
        richBody += `\n\n**Open Questions:**\n` + analysis.questions.map((q: string) => `- ${q}`).join('\n')
      }

      const { data: uploadData } = await admin.from('video_uploads').select('thumbnail_url').eq('id', video_upload_id).single()

      await admin.from('log_entries').insert({
        user_id,
        entry_type: 'session',
        title: analysis.summary ? (analysis.summary.length > 80 ? analysis.summary.substring(0, 77) + '...' : analysis.summary) : `${activeContext.userName}'s Video Session`,
        body: richBody,
        logged_at: recordedAt,
        source_upload_id: video_upload_id,
        is_public: true,
        thumbnail_url: uploadData?.thumbnail_url || (activeContext.upload as any).thumbnail_url,
        meta: {
          model: analysisResult.modelUsed,
          categories: analysis.categories,
          mood: analysis.mood,
          energy: analysis.energy_level,
          reflections: analysis.reflections,
          questions: analysis.questions
        }
      })

      await plog(admin, video_upload_id, 'create-log-entry', 'done', 'Timeline entry created')
    })

    return { status: 'success', video_upload_id }
  }
)
