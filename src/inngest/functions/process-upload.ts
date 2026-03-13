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

      await plog(admin, video_upload_id, 'fetch-context', 'done', `Context fetched for ${userName}. recorded_at in DB: ${upload.recorded_at}`)
      console.log(`[Inngest] Starting process for ${video_upload_id}. recorded_at in DB: ${upload.recorded_at}`);

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

      // CRITICAL: Always prioritize what was sent from the browser/frontend
      if (upload.recorded_at) {
        await plog(admin!, video_upload_id, 'extract-metadata', 'info', `Using pre-extracted recorded_at: ${upload.recorded_at}`)
        return { 
          recorded_at: upload.recorded_at,
          raw_metadata_diagnostic: (upload.meta as any)?.raw_metadata_diagnostic || null,
          found_key: 'pre-extracted'
        }
      }

      if (!isVideoMimeType(upload.mime_type) && !upload.mime_type.startsWith('audio/')) {
        await plog(admin!, video_upload_id, 'extract-metadata', 'skipped', 'Not audio/video')
        return { 
          recorded_at: (upload as any).created_at,
          raw_metadata_diagnostic: null,
          found_key: 'mime-mismatch'
        }
      }

      try {
        const { data: signedData } = await admin.storage
          .from('videos')
          .createSignedUrl(upload.storage_path, 600)

        if (signedData?.signedUrl) {
          await plog(admin, video_upload_id, 'extract-metadata', 'debug', `Scanning all tags via Replicate ffprobe...`)

          const replicateToken = process.env.REPLICATE_API_TOKEN
          if (!replicateToken) {
            await plog(admin!, video_upload_id, 'extract-metadata', 'error', 'REPLICATE_API_TOKEN missing for metadata extraction')
            return { 
              recorded_at: (upload as any).recorded_at || (upload as any).created_at,
              raw_metadata_diagnostic: null,
              found_key: 'config-error'
            }
          }

          const replicate = new Replicate({ auth: replicateToken })
          // Use fofr/ffmpeg to run ffprobe and get JSON
          const output = await replicate.run(
            "fofr/ffmpeg:83b6a56e7561f2f0b435ff29402e1c08d66938dc814275001ad253818e959ec2",
            {
              input: {
                input_file: signedData.signedUrl,
                ffmpeg_command: "-v quiet -print_format json -show_format -show_streams {input_file}"
              }
            }
          ) as any

          // Replicate fofr/ffmpeg returns a URL to a file if output is large, or the content if small.
          let info: any
          if (typeof output === 'string' && output.startsWith('http')) {
            const res = await fetch(output)
            info = await res.json()
          } else if (typeof output === 'string') {
            try {
              info = JSON.parse(output)
            } catch (e) {
              await plog(admin!, video_upload_id, 'extract-metadata', 'error', `Failed to parse ffprobe output: ${output.substring(0, 100)}`)
              return { 
                recorded_at: (upload as any).recorded_at || (upload as any).created_at,
                raw_metadata_diagnostic: null,
                found_key: 'parse-error'
              }
            }
          } else {
            info = output
          }
          
          if (!info) {
            await plog(admin!, video_upload_id, 'extract-metadata', 'error', 'ffprobe returned empty output')
            return { 
              recorded_at: (upload as any).recorded_at || (upload as any).created_at,
              raw_metadata_diagnostic: null,
              found_key: 'empty-output'
            }
          }

          // 1. Gather all tags from format and streams
          const allTags: Record<string, string> = {
            ...(info.format?.tags || {}),
            ...(info.streams?.reduce((acc: any, s: any) => ({ ...acc, ...(s.tags || {}) }), {}) || {})
          }

          // 2. Priority check for known tags (mostly Apple/QuickTime/MP4/Google)
          const priorityKeys = [
            'com.apple.quicktime.creationdate', // iPhone/Mac standard (highest precision)
            'com.apple.quicktime.creationdate-eng',
            'Keys:CreationDate',                // Google Photos / iPhone standard
            'Keys:CreationDate-eng',
            'QuickTime:CreateDate',
            'MediaCreateDate',
            'creation_time',                    // Common FFmpeg/Android tag
            'creation_time-eng',
            'CreateDate',                       // Windows/Standard MP4
            'creation_date',                    
            'date',                             
            'DateTimeOriginal',                 // Camera standard
            'EncodingTime',                     
            'ContentCreateDate',                
            'encoded_date',
            'tagged_date'
          ]

          let foundDate: string | null = null
          let foundKey: string | null = null

          for (const key of priorityKeys) {
            if (allTags[key]) {
              const d = Date.parse(allTags[key])
              if (!isNaN(d)) {
                foundDate = new Date(d).toISOString()
                foundKey = key
                break
              }
            }
          }

          // 3. Fallback Heuristic: Scan ALL tags for anything that looks like a valid date
          if (!foundDate) {
            const todayStr = new Date().toISOString().split('T')[0]
            let candidates: { key: string, date: string }[] = []

            for (const [key, value] of Object.entries(allTags)) {
              if (typeof value !== 'string' || value.length < 8) continue
              if (/^\d+$/.test(value)) continue 
              
              const d = Date.parse(value)
              if (!isNaN(d)) {
                candidates.push({ key, date: new Date(d).toISOString() })
              }
            }

            const backdatedCandidates = candidates.filter(c => c.date.split('T')[0] < todayStr)
            if (backdatedCandidates.length > 0) {
              backdatedCandidates.sort((a, b) => a.date.localeCompare(b.date))
              foundDate = backdatedCandidates[0].date
              foundKey = backdatedCandidates[0].key
            } else if (candidates.length > 0) {
              candidates.sort((a, b) => a.date.localeCompare(b.date))
              foundDate = candidates[0].date
              foundKey = candidates[0].key
            }
          }

          // 4. Final Safety: Inferred from filename (e.g. PXL_20240128_...)
          if (!foundDate) {
            const dateRegexes = [
              /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/, // 20240128_123456
              /(\d{4})-(\d{2})-(\d{2})/,                    // 2024-01-28
              /(\d{4})(\d{2})(\d{2})/,                       // 20240128
            ];
            for (const regex of dateRegexes) {
              const fileMatch = upload.file_name.match(regex);
              if (fileMatch) {
                const [_, y, m, d, hh, mm, ss] = fileMatch;
                const dStr = hh ? `${y}-${m}-${d}T${hh}:${mm}:${ss}Z` : `${y}-${m}-${d}T12:00:00Z`;
                const inferred = new Date(dStr);
                if (!isNaN(inferred.getTime())) {
                  foundDate = inferred.toISOString();
                  foundKey = 'filename-inference';
                  break;
                }
              }
            }
          }

          if (foundDate) {
            await plog(admin!, video_upload_id, 'extract-metadata', 'done', `Backdated successfully! Used tag '${foundKey}' to set recorded_at to ${foundDate}`)
          } else {
            await plog(admin!, video_upload_id, 'extract-metadata', 'warn', `No recording date found. Full metadata dictionary saved to video_uploads.meta for diagnosis.`)
          }

          return { 
            recorded_at: foundDate || (upload as any).recorded_at || (upload as any).created_at,
            raw_metadata_diagnostic: allTags,
            found_key: foundKey || 'not-found'
          }
        }
      } catch (err: any) {
        await plog(admin!, video_upload_id, 'extract-metadata', 'skipped', `ffprobe failed: ${err?.message}`)
      }

      return { 
        recorded_at: (upload as any).recorded_at || (upload as any).created_at,
        raw_metadata_diagnostic: (upload.meta as any)?.raw_metadata_diagnostic || null,
        found_key: 'fallback'
      }
    })

    // ── Step 2b-bis: Apply Metadata to DB ──
    await step.run('apply-metadata', async () => {
      const { upload } = activeContext
      const updateData: any = {
        meta: {
          ...(upload.meta || {}),
          raw_metadata_diagnostic: metadata.raw_metadata_diagnostic,
          found_key: metadata.found_key
        }
      }
      
      // Only update recorded_at if we have a valid, non-null date to apply
      if (metadata.recorded_at) {
        updateData.recorded_at = metadata.recorded_at
      }

      await admin!.from('video_uploads').update(updateData).eq('id', video_upload_id)
    })

    // ── Step 2c: Extract Thumbnail (video files only) ──
    const thumbnailUrl = await step.run('extract-thumbnail', async () => {
      const { upload } = activeContext
      if (!isVideoMimeType(upload.mime_type)) return null

      await plog(admin, video_upload_id, 'extract-thumbnail', 'running')

      const replicateToken = process.env.REPLICATE_API_TOKEN
      if (!replicateToken) return null

      const { data: signedData } = await admin.storage
        .from('videos')
        .createSignedUrl(upload.storage_path, 3600)

      if (!signedData?.signedUrl) return null

      try {
        const replicate = new Replicate({ auth: replicateToken })
        // Use fofr/ffmpeg to grab a frame at 1s
        const output = await replicate.run(
          "fofr/ffmpeg:83b6a56e7561f2f0b435ff29402e1c08d66938dc814275001ad253818e959ec2",
          {
            input: {
              input_file: signedData.signedUrl,
              ffmpeg_command: "-ss 00:00:01 -i {input_file} -vframes 1 -f image2 pipe:1"
            }
          }
        ) as any

        if (!output || typeof output !== 'string') return null

        // Fetch and upload to Supabase
        const imgResponse = await fetch(output)
        const imgBuffer = Buffer.from(await imgResponse.arrayBuffer())
        const thumbPath = `${user_id}/thumbnails/${video_upload_id}.jpg`

        await admin.storage.from('videos').upload(thumbPath, imgBuffer, {
          contentType: 'image/jpeg',
          upsert: true
        })

        const { data: { publicUrl } } = admin.storage.from('videos').getPublicUrl(thumbPath)
        
        await admin.from('video_uploads').update({ thumbnail_url: publicUrl }).eq('id', video_upload_id)
        await plog(admin, video_upload_id, 'extract-thumbnail', 'done', `Thumbnail created: ${publicUrl}`)
        
        return publicUrl
      } catch (err: any) {
        await plog(admin, video_upload_id, 'extract-thumbnail', 'error', `Replicate error: ${err?.message}`)
        return null
      }
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

      // Generate additional suggestions
      const { extractTags, generateClipSuggestions, generatePostSuggestions } = require('@/lib/video-analysis')
      const tags = extractTags(result.analysis)
      const clips = generateClipSuggestions(transcription.segments, result.analysis.key_quotes || [])
      const posts = generatePostSuggestions(result.analysis, metadata.recorded_at)

      await admin.from('video_uploads').update({
        analysis: result.analysis,
        analysis_model: result.modelUsed,
        tags,
        generated_clips: clips,
        generated_posts: posts,
        status: 'processed',
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', video_upload_id)

      await plog(admin, video_upload_id, 'analyze', 'done', `Analyzed with ${result.modelUsed}. Generated ${clips.length} clips and ${posts.length} posts.`)
      return { ...result, tags, clips, posts }
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
        logged_at: metadata.recorded_at,
        source_upload_id: video_upload_id,
        is_public: true,
        thumbnail_url: thumbnailUrl || (activeContext.upload as any).thumbnail_url,
        meta: {
          model: analysisResult.modelUsed,
          categories: analysisResult.tags, // Using curated tags
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
