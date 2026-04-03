import { createAdminClient } from '@/lib/supabase/admin'
import { inngest } from '@/inngest/client'
import { isVideoMimeType } from '@/lib/audio-processing'
import { runAnalysis, upsertEntities, extractVoiceProfile, mergeVoiceProfile } from '@/lib/video-analysis'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import { presignDownloadUrl, uploadBuffer } from '@/lib/storage/r2'
import Replicate from 'replicate'

// Replicate SDK v1.4 returns FileOutput objects (not strings) and sometimes arrays.
// This helper safely extracts the URL from any output shape.
function extractReplicateUrl(output: unknown): string | null {
  const value = Array.isArray(output) ? output[0] : output
  if (!value) return null
  const url = typeof value === 'string' ? value : String(value)
  return url.startsWith('http') ? url : null
}


export const processUpload = inngest.createFunction(
  {
    id: 'process-upload',
    concurrency: {
      limit: 2,
      key: 'event.data.user_id',  // two uploads at a time per user
    },
    onFailure: async ({ event, error }) => {
      // When Inngest gives up after all retries, mark the upload as error
      // so the UI shows the Retry button instead of leaving it stuck at 'transcribing'
      const admin = createAdminClient()
      if (!admin) return
      const { video_upload_id } = event.data.event.data
      if (!video_upload_id) return

      // Surface readable error — strip raw JSON blobs from API errors
      let msg = error.message || 'Processing failed'
      if (msg.includes('credit balance is too low')) {
        msg = 'AI API credit balance too low — top up at console.anthropic.com or platform.openai.com'
      } else if (msg.includes('invalid_api_key') || msg.includes('Incorrect API key')) {
        msg = 'Invalid AI API key — update it in Settings → API Keys'
      } else if (msg.length > 200) {
        msg = msg.slice(0, 200) + '…'
      }

      await admin.from('video_uploads').update({
        status: 'error',
        error_message: msg,
        updated_at: new Date().toISOString(),
      }).eq('id', video_upload_id)
    },
  },
  { event: 'video-upload/process' },
  async ({ event, step }) => {
    const { video_upload_id, user_id } = event.data
    const admin = createAdminClient()

    if (!admin) {
      console.error('Failed to create admin client')
      return { status: 'error', error: 'admin_client_failed' }
    }

    // Pre-flight

    // ── Step 1: Fetch context ──
    const context = await step.run('fetch-context', async () => {

      const { data: upload, error } = await admin
        .from('video_uploads')
        .select('*')
        .eq('id', video_upload_id)
        .eq('user_id', user_id)
        .single()

      if (error || !upload) {
        throw new Error('Upload not found')
      }

      if (upload.status === 'processed') {
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
        throw new Error(msg)
      }

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

    // Heartbeat helper to keep UI updated and prevent "stale" detection
    const heartbeat = async (phase: string) => {
      await admin.from('video_uploads').update({
        status: phase,
        updated_at: new Date().toISOString(),
      }).eq('id', video_upload_id)
    }

    // Immediate feedback for the UI
    await heartbeat('starting')

    // ── Step 2: Extract audio & Archive Voice Signal ──
    const audioPath = await step.run('extract-audio', async () => {
      const { upload } = activeContext
      
      await heartbeat('extracting-audio')

      if (!isVideoMimeType(upload.mime_type) && !upload.mime_type.startsWith('audio/')) {
        return { path: upload.storage_path, extracted: false }
      }


      const replicateToken = process.env.REPLICATE_API_TOKEN
      if (!replicateToken) {
        return { path: upload.storage_path, extracted: false }
      }

      const storageSignedUrl = await presignDownloadUrl(upload.storage_path, 3600).catch(() => null)
      if (!storageSignedUrl) return { path: upload.storage_path, extracted: false }

      try {
        const replicate = new Replicate({ auth: replicateToken })
        // fofr/toolkit correct API: task + input_file (no ffmpeg_command parameter)
        const output = await replicate.run(
          'fofr/toolkit',
          {
            input: {
              task: 'extract_video_audio_as_mp3',
              input_file: storageSignedUrl,
            },
          },
        )

        const audioUrl = extractReplicateUrl(output)
        if (!audioUrl) return { path: upload.storage_path, extracted: false, isDirectUrl: false }

        // Return the direct Replicate MP3 URL — transcribe step uses it without re-signing
        return { path: audioUrl, extracted: true, isDirectUrl: true }
      } catch (err: any) {
        return { path: upload.storage_path, extracted: false, isDirectUrl: false }
      }
    })

    // ── Step 2b: Extract Metadata (exhaustive backdating check) ──
    const metadata = await step.run('extract-metadata', async () => {
      const { upload } = activeContext

      // CRITICAL: Always prioritize what was sent from the browser/frontend
      if (upload.recorded_at) {
        return { 
          recorded_at: upload.recorded_at,
          raw_metadata_diagnostic: (upload.meta as any)?.raw_metadata_diagnostic || null,
          found_key: 'pre-extracted'
        }
      }

      if (!isVideoMimeType(upload.mime_type) && !upload.mime_type.startsWith('audio/')) {
        return { 
          recorded_at: (upload as any).created_at,
          raw_metadata_diagnostic: null,
          found_key: 'mime-mismatch'
        }
      }

      try {
        const metaSignedUrl = await presignDownloadUrl(upload.storage_path, 600).catch(() => null)

        if (metaSignedUrl) {

          const replicateToken = process.env.REPLICATE_API_TOKEN
          if (!replicateToken) {
            return { 
              recorded_at: (upload as any).recorded_at || (upload as any).created_at,
              raw_metadata_diagnostic: null,
              found_key: 'config-error'
            }
          }

          const replicate = new Replicate({ auth: replicateToken })
          // Use fofr/toolkit to run ffprobe and get JSON
          const output = await replicate.run(
            "fofr/toolkit",
            {
              input: {
                input_file: metaSignedUrl,
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
          } else {
          }

          return { 
            recorded_at: foundDate || (upload as any).recorded_at || (upload as any).created_at,
            raw_metadata_diagnostic: allTags,
            found_key: foundKey || 'not-found'
          }
        }
      } catch (err: any) {
      }

      return { 
        recorded_at: (upload as any).recorded_at || (upload as any).created_at,
        raw_metadata_diagnostic: (upload.meta as any)?.raw_metadata_diagnostic || null,
        found_key: 'fallback'
      }
    })

    // ── Update: Metadata Pulled ──
    await step.run('heartbeat-metadata', async () => {
      await heartbeat('metadata-extracted')
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

    // ── Step 2c: Transcode to H.264 for browser-compatible playback ──
    // NOTE: This now runs BEFORE thumbnail extraction so we can use the H.264
    // output for frame extraction — critical for vertical DJI HEVC videos which
    // have rotation metadata that causes fofr/toolkit to fail on the original file.
    const playbackStoragePath = await step.run('transcode-playback', async () => {
      const { upload } = activeContext
      if (!isVideoMimeType(upload.mime_type)) return null


      const replicateToken = process.env.REPLICATE_API_TOKEN
      if (!replicateToken) return null

      const transcodeSignedUrl = await presignDownloadUrl(upload.storage_path, 7200).catch(() => null)
      if (!transcodeSignedUrl) return null

      try {
        const replicate = new Replicate({ auth: replicateToken })
        const output = await replicate.run('fofr/toolkit', {
          input: { task: 'convert_input_to_mp4', input_file: transcodeSignedUrl },
        }) as any

        const outputUrl = extractReplicateUrl(output)
        if (!outputUrl) return null

        const mp4Buf = Buffer.from(await (await fetch(outputUrl)).arrayBuffer())
        const path = `${user_id}/playback/${video_upload_id}.mp4`

        await uploadBuffer(path, mp4Buf, 'video/mp4').catch((uploadErr: any) => {
          console.error('[transcode-playback] R2 upload failed:', uploadErr?.message)
          throw uploadErr
        })

        await admin.from('video_uploads').update({ playback_path: path }).eq('id', video_upload_id)
        return path
      } catch (err: any) {
        return null
      }
    })

    // ── Update: Transcode Done ──
    await step.run('heartbeat-transcode', async () => {
      await heartbeat('transcribed-media')
    })


    // ── Step 2d: Thumbnail Fallback (Server-side) ──
    // If client-side thumbnailing failed, we attempt to extract a frame at 1s mark
    await step.run('thumbnail-fallback', async () => {
      const { upload } = activeContext
      const mode = event.data.mode || 'full'
      
      // Overwrite if missing OR if it's just a placeholder SVG from the browser
      // OR if we are explicitly in 'thumbnail' fix mode
      const isPlaceholder = !upload.thumbnail_url || upload.thumbnail_url.startsWith('data:image/svg') || (upload as any).thumbnail_url?.includes('_placeholder')
      if (!isPlaceholder && mode !== 'thumbnail') return

      const replicateToken = process.env.REPLICATE_API_TOKEN
      if (!replicateToken) return

      // Prefer the transcode output for thumbnailing as it's guaranteed H.264
      const sourcePath = playbackStoragePath || upload.storage_path
      const signedUrl = await presignDownloadUrl(sourcePath, 3600).catch(() => null)
      if (!signedUrl) return

      try {
        const replicate = new Replicate({ auth: replicateToken })
        const output = await replicate.run('fofr/toolkit', {
          input: { 
            task: 'ffmpeg_command', 
            input_file: signedUrl,
            ffmpeg_command: "-ss 00:00:01 -i {input_file} -vframes 1 -q:v 2 {output_file}.jpg"
          },
        }) as any

        const outputUrl = extractReplicateUrl(output)
        if (!outputUrl) return

        const imgBuf = Buffer.from(await (await fetch(outputUrl)).arrayBuffer())
        const path = `${user_id}/thumbnails/${video_upload_id}_fallback.jpg`

        await uploadBuffer(path, imgBuf, 'image/jpeg')
        await admin.from('video_uploads').update({ thumbnail_url: path }).eq('id', video_upload_id)
      } catch (err: any) {
        console.error('[thumbnail-fallback] Failed:', err?.message)
      }
    })


    // ── Step 3: Transcribe ──
    const transcription = await step.run('transcribe', async () => {
      const mode = event.data.mode || 'full'
      const { upload } = activeContext

      // Smart Skip: If we just need a thumbnail and already have a transcript, don't re-run Whisper
      if (mode === 'thumbnail' && upload.transcript) {
        console.log(`[Inngest] Skipping transcription for ${video_upload_id} (thumbnail mode)`)
        return { 
          text: upload.transcript, 
          language: upload.analysis?.language || 'en', 
          segments: upload.transcript_segments || [],
          skipped: true 
        }
      }

      if (activeContext.upload.mime_type === 'text/plain') {
        const fileRes = await fetch(await presignDownloadUrl(audioPath.path, 600)).catch(() => null)
        const text = fileRes?.ok ? await fileRes.text() : ''
        return { text, language: 'en', segments: [] }
      }

      const replicateToken = process.env.REPLICATE_API_TOKEN
      if (!replicateToken) throw new Error('REPLICATE_API_TOKEN missing')

      // If audio extraction succeeded, audioPath.path is a direct URL; otherwise sign the storage path
      let whisperAudioUrl: string
      if ((audioPath as any).isDirectUrl && audioPath.path.startsWith('http')) {
        whisperAudioUrl = audioPath.path
      } else {
        const whisperSignedUrl = await presignDownloadUrl(audioPath.path, 3600).catch(() => null)
        if (!whisperSignedUrl) throw new Error('Failed to sign audio URL for Whisper')
        whisperAudioUrl = whisperSignedUrl
      }

      const replicate = new Replicate({ auth: replicateToken })
      await heartbeat('transcribing')

      const output = await replicate.run(
        'openai/whisper:8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e',
        {
          input: {
            audio: whisperAudioUrl,
            model: 'large-v3',
            transcription: 'plain text',
            language: 'auto',
            word_timestamps: true,
          },
        }
      ) as any

      const text = output?.transcription || ''
      const segments = (output?.segments || []).map((s: any) => ({
        start: s.start,
        end: s.end,
        text: s.text,
      }))

      // Extract word-level data if available
      const words: Array<{ word: string; start: number; end: number; probability: number }> = []
      for (const seg of (output?.segments || [])) {
        if (Array.isArray(seg.words)) {
          for (const w of seg.words) {
            if (w.word && typeof w.start === 'number' && typeof w.end === 'number') {
              words.push({
                word: w.word.trim(),
                start: w.start,
                end: w.end,
                probability: w.probability ?? 1,
              })
            }
          }
        }
      }

      return { text, language: output?.detected_language || 'en', segments, words }
    })

    // ── Step 3b: Store word-level transcript ──
    if (transcription && 'words' in transcription && transcription.words && transcription.words.length > 0) {
      await step.run('store-transcript-words', async () => {
        // Delete any existing words for this upload (idempotent)
        await admin.from('transcript_words').delete().eq('video_upload_id', video_upload_id)

        // Insert in batches of 500
        const rows = (transcription as any).words.map((w: any, i: number) => ({
          video_upload_id,
          user_id,
          word: w.word,
          start_time: w.start,
          end_time: w.end,
          confidence: w.probability,
          is_cut: false,
          word_index: i,
        }))

        for (let i = 0; i < rows.length; i += 500) {
          await admin.from('transcript_words').insert(rows.slice(i, i + 500))
        }

      })
    }

    // ── Step 4: Analyze ──
    const analysisResult = await step.run('analyze', async () => {
      const mode = event.data.mode || 'full'
      const { upload } = activeContext

      // Smart Skip: If we already have analysis and just need a thumbnail
      if (mode === 'thumbnail' && (upload as any).analysis) {
        console.log(`[Inngest] Skipping analysis for ${video_upload_id} (thumbnail mode)`)
        
        // CRITICAL: Ensure we still mark as processed in the database
        await admin.from('video_uploads').update({
          status: 'processed',
          processed_at: (upload as any).processed_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', video_upload_id)

        return { 
          analysis: (upload as any).analysis, 
          modelUsed: (upload as any).analysis_model || 'skipped',
          tags: (upload as any).tags || [],
          clips: (upload as any).generated_clips || [],
          posts: (upload as any).generated_posts || [],
          skipped: true 
        }
      }

      await admin.from('video_uploads').update({
        transcript: transcription.text,
        transcript_segments: transcription.segments,
        status: 'analyzing',
        updated_at: new Date().toISOString(),
      }).eq('id', video_upload_id)

      await heartbeat('analyzing')

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

      return { ...result, tags, clips, posts, skipped: false }
    })

    // ── Step 4a: Upsert entities into knowledge graph ──
    await step.run('upsert-entities', async () => {
      await upsertEntities(admin, user_id, { videoUploadId: video_upload_id }, analysisResult.analysis)
    })

    // ── Step 4a-ii: Extract voice profile and accumulate on user's profile ──
    await step.run('extract-voice-profile', async () => {
      const transcript = transcription.text
      if (!transcript || transcript.length < 300) return

      const freshProfile = await extractVoiceProfile(
        transcript,
        activeContext.openaiKey,
        activeContext.anthropicKey,
      )
      if (!freshProfile) return

      const { data: profileRow } = await admin
        .from('profiles')
        .select('voice_profile')
        .eq('id', user_id)
        .single()

      const merged = mergeVoiceProfile(
        (profileRow?.voice_profile as Record<string, any> | null) ?? null,
        freshProfile,
      )

      await admin.from('profiles').update({ voice_profile: merged }).eq('id', user_id)
    })

    // ── Step 4a-iii: Fire develop-idea for strong content seeds ──
    // Each strong_opinion and high-confidence idea gets expanded into a
    // full verbatim script in the background by the develop-idea function.
    await step.run('trigger-content-development', async () => {
      const analysis = analysisResult.analysis
      const seeds: Array<{ text: string; type: string }> = []

      // Strong opinions are essay-ready by definition
      for (const opinion of (analysis.strong_opinions || []).slice(0, 3)) {
        if (opinion) seeds.push({ text: opinion, type: 'strong_opinion' })
      }

      // High-confidence ideas (0.88+)
      for (const idea of (analysis.ideas || [])) {
        if (typeof idea === 'object' && idea.confidence >= 0.88 && idea.text) {
          seeds.push({ text: idea.text, type: 'idea' })
        }
      }

      // key_win if it's substantive (more than just a task done)
      if (analysis.key_win && analysis.key_win.length > 40) {
        seeds.push({ text: analysis.key_win, type: 'key_win' })
      }

      if (seeds.length === 0) return

      const { inngest: ig } = await import('@/inngest/client')
      await Promise.all(
        seeds.map(seed =>
          ig.send({
            name: 'neolog/develop-idea',
            data: {
              user_id,
              source_text: seed.text,
              source_type: seed.type,
              source_upload_ids: [video_upload_id],
              format: 'video_essay',
            },
          })
        )
      )

    })

    // ── Step 4a-iv: Auto-update living documents for any projects mentioned ──
    // Fire synthesize-project for each project entity found in this recording.
    // This keeps project docs current without requiring manual "Regenerate" clicks.
    if (analysisResult.analysis?.projects?.length > 0) {
      await step.run('update-project-documents', async () => {
        const projectNames: string[] = analysisResult.analysis.projects
          .map((p: { name: string }) => p.name)
          .filter(Boolean)

        if (projectNames.length === 0) return

        // Look up entity IDs for these projects
        const slugify = (t: string) =>
          t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 80)

        const slugs = projectNames.map(slugify)
        const { data: entities } = await admin
          .from('entities')
          .select('id')
          .eq('user_id', user_id)
          .eq('type', 'project')
          .in('slug', slugs)

        if (!entities?.length) return

        // Fire a synthesize event for each project (Inngest dedupes within a short window)
        const { inngest } = await import('@/inngest/client')
        await Promise.all(
          entities.map((e: { id: string }) =>
            inngest.send({ name: 'app/project.synthesize', data: { entity_id: e.id, user_id } })
          )
        )

      })
    }

    // ── Step 4b: Pre-populate word cuts from clip suggestions ──
    // Words OUTSIDE any generated clip window are marked is_cut=true by default
    if (transcription && 'words' in transcription && transcription.words && transcription.words.length > 0 && analysisResult.clips?.length > 0) {
      await step.run('apply-clip-cuts', async () => {
        const clips = analysisResult.clips as Array<{ start: number; end: number }>

        // Words inside at least one clip window = keep (is_cut=false)
        // Words outside all clip windows = cut (is_cut=true)
        const cutWordIndices: number[] = (transcription as any).words
          .map((w: any, i: number) => {
            const inWindow = clips.some(c => w.start >= c.start && w.end <= c.end)
            return inWindow ? -1 : i
          })
          .filter((i: number) => i >= 0)

        if (cutWordIndices.length > 0) {
          // Batch update in chunks
          for (let i = 0; i < cutWordIndices.length; i += 200) {
            const batch = cutWordIndices.slice(i, i + 200)
            await admin
              .from('transcript_words')
              .update({ is_cut: true })
              .eq('video_upload_id', video_upload_id)
              .in('word_index', batch)
          }
        }

      })
    }

    // ── Step 5: Create rich Timeline Entry ──
    await step.run('create-log-entry', async () => {
      await heartbeat('saving-results')
      const analysis = analysisResult.analysis
      const recordedAt = metadata.recorded_at
      
      const { data: existing } = await admin.from('log_entries').select('id').eq('source_upload_id', video_upload_id).maybeSingle()
      if (existing) {
        return
      }

      // ── Build log entry body ──────────────────────────────────────────────
      // Lead with key_win (the session pull-quote), then first-person summary
      const bodyParts: string[] = []

      if (analysis.key_win) {
        bodyParts.push(`**${analysis.key_win}**`)
      }

      bodyParts.push(analysis.summary_first_person || analysis.summary || '')

      if (analysis.emotional_arc) {
        bodyParts.push(`_${analysis.emotional_arc}_`)
      }

      if (analysis.mood || analysis.energy_level) {
        bodyParts.push(`Mood: ${analysis.mood || 'N/A'} | Energy: ${analysis.energy_level || 'N/A'}`)
      }

      if (analysis.action_items?.length > 0) {
        const items = analysis.action_items.map((a: any) => {
          if (typeof a === 'string') return `- ${a}`
          const urgencyTag = a.urgency && a.urgency !== 'someday' ? ` _(${a.urgency})_` : ''
          return `- ${a.task}${urgencyTag}`
        })
        bodyParts.push(`**Action items:**\n${items.join('\n')}`)
      }

      if (analysis.lessons_learned?.length > 0) {
        bodyParts.push(`**What I learned:**\n` + analysis.lessons_learned.map((l: string) => `- ${l}`).join('\n'))
      }

      if (analysis.questions?.length > 0) {
        bodyParts.push(`**Open questions:**\n` + analysis.questions.map((q: string) => `- ${q}`).join('\n'))
      }

      const richBody = bodyParts.filter(Boolean).join('\n\n')

      // Prefer AI-generated title; fall back to file name then date
      const aiTitle = analysis.title
      const fileTitle = (() => {
        const raw = (activeContext.upload as any).file_name || ''
        const clean = raw.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ').trim()
        return clean || new Date(metadata.recorded_at || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      })()

      await admin.from('log_entries').insert({
        user_id,
        entry_type: 'session',
        title: aiTitle || fileTitle,
        body: richBody,
        logged_at: metadata.recorded_at,
        source_upload_id: video_upload_id,
        is_public: true,
        thumbnail_url: (activeContext.upload as any).thumbnail_url,
        meta: {
          title: aiTitle || fileTitle,
          key_win: analysis.key_win || null,
          model: analysisResult.modelUsed,
          categories: analysisResult.tags,
          mood: analysis.mood,
          energy: analysis.energy_level,
          emotional_arc: analysis.emotional_arc || null,
          reflections: analysis.reflections,
          questions: analysis.questions
        }
      })

    })

    // ── Step 5b: Passive health log from video analysis ──
    await step.run('health-log-from-analysis', async () => {
      const analysis = analysisResult.analysis
      const health = analysis.health_mentions
      if (!health) return

      const hasData = health.sleep || health.energy || health.workout || health.body_notes
      if (!hasData) return

      // Parse sleep hours from text (e.g. "6 hours", "7.5", "slept great" → null)
      let sleep_hours: number | null = null
      if (health.sleep) {
        const match = String(health.sleep).match(/(\d+(?:\.\d+)?)/)
        if (match) sleep_hours = parseFloat(match[1])
      }

      // Parse energy level (should be 1-10 or null)
      let energy_level: number | null = null
      if (health.energy) {
        const parsed = parseInt(String(health.energy))
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) energy_level = parsed
      }

      const hasUsefulData = sleep_hours !== null || energy_level !== null || health.workout || health.body_notes
      if (!hasUsefulData) return

      await admin.from('health_logs').insert({
        user_id,
        logged_at: metadata?.recorded_at || new Date().toISOString(),
        sleep_hours,
        energy_level,
        workout_done: !!health.workout,
        workout_notes: health.workout || null,
        notes: health.body_notes || null,
        mood: analysis.mood || null,
        source: 'video_analysis',
        source_upload_id: video_upload_id,
      })

    })

    // ── Step 6: Check manifest training thresholds ──
    const manifestTriggers = await step.run('check-manifest-thresholds', async () => {
      const { checkManifestThresholds } = await import('@/lib/manifest-thresholds')
      return checkManifestThresholds(user_id, admin)
    })

    if (manifestTriggers.triggerVoiceClone) {
      await step.sendEvent('trigger-voice-clone', {
        name: 'manifest/voice-threshold-met',
        data: { user_id },
      })
    }
    if (manifestTriggers.triggerLoraTraining) {
      await step.sendEvent('trigger-lora-training', {
        name: 'manifest/face-threshold-met',
        data: { user_id },
      })
    }

    // ── Step 7: Auto-trigger cross-corpus synthesis every 10th upload ──
    const shouldTriggerSynthesis = await step.run('check-synthesis-milestone', async () => {
      const { count } = await admin
        .from('video_uploads')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user_id)
        .eq('status', 'processed')

      return !!(count && count >= 3 && count % 10 === 0)
    })

    if (shouldTriggerSynthesis) {
      await step.sendEvent('trigger-synthesis', {
        name: 'neolog/synthesize-graph',
        data: { user_id },
      })
    }

    return { status: 'success', video_upload_id }
  }
)

/**
 * Score face frame fidelity from JPEG buffer dimensions.
 * Higher resolution = higher potential quality.
 * Returns a 0–1 score based on resolution percentile.
 */
function scoreFrameFidelity(buffer: Buffer): number {
  try {
    // Parse JPEG dimensions from SOF0/SOF2 marker (0xFF 0xC0 or 0xFF 0xC2)
    let offset = 2 // skip SOI marker
    while (offset < buffer.length - 9) {
      if (buffer[offset] !== 0xFF) break
      const marker = buffer[offset + 1]
      const length = buffer.readUInt16BE(offset + 2)

      // SOF markers contain image dimensions
      if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
        const height = buffer.readUInt16BE(offset + 5)
        const width = buffer.readUInt16BE(offset + 7)
        const pixels = width * height

        // Score based on resolution:
        // >= 3840×2160 (4K)   → 1.0
        // >= 1920×1080 (1080p) → 0.85
        // >= 1280×720 (720p)  → 0.7
        // >= 854×480 (480p)   → 0.5
        // below 480p          → 0.3
        if (pixels >= 3840 * 2160) return 1.0
        if (pixels >= 1920 * 1080) return 0.85
        if (pixels >= 1280 * 720) return 0.7
        if (pixels >= 854 * 480) return 0.5
        return 0.3
      }

      offset += 2 + length
    }
  } catch { /* fall through */ }

  // Default if we can't parse dimensions
  return 0.6
}
