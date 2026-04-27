import { createAdminClient } from '@/lib/supabase/admin'
import { inngest } from '@/inngest/client'
import { isVideoMimeType } from '@/lib/audio-processing'
import { runAnalysis, upsertEntities, extractVoiceProfile, mergeVoiceProfile } from '@/lib/video-analysis'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import { presignDownloadUrl } from '@/lib/storage/r2'
import Replicate from 'replicate'

export const runtime = 'edge'

// Replicate SDK v1.4 returns FileOutput objects (not strings) and sometimes arrays.
// This helper safely extracts the URL from any output shape.
function extractReplicateUrl(output: unknown): string | null {
  const value = Array.isArray(output) ? output[0] : output
  if (!value) return null
  const url = typeof value === 'string' ? value : String(value)
  return url.startsWith('http') ? url : null
}

/**
 * Async Replicate runner using polling + step.sleep.
 * Instead of blocking a single Vercel invocation for minutes,
 * this creates a prediction then polls every 15s via step.sleep,
 * so each Vercel call lasts only a few seconds.
 * Max wait: ~30 minutes (120 polls x 15s)
 *
 * modelRef format: 'owner/name' (resolves latest version) OR 'owner/name:hash' (pinned version)
 */
async function runReplicateAsync(
  step: any,
  stepId: string,
  replicateToken: string,
  modelRef: string,
  input: Record<string, any>
): Promise<unknown> {
  // Step 1: Create the prediction
  // Community models need a version hash — we extract it from 'model:hash' or resolve latest.
  const predictionId: string = await step.run(`${stepId}-create`, async () => {
    const replicate = new Replicate({ auth: replicateToken })

    let version: string | undefined
    if (modelRef.includes(':')) {
      // Pinned version e.g. 'openai/whisper:8099...'
      version = modelRef.split(':')[1]
    } else {
      // Resolve latest version for community models e.g. 'fofr/toolkit'
      const [owner, name] = modelRef.split('/')
      const modelData = await replicate.models.get(owner, name)
      version = (modelData as any).latest_version?.id
      if (!version) throw new Error(`Could not resolve version for Replicate model: ${modelRef}`)
    }

    const prediction = await replicate.predictions.create({ version, input })
    return prediction.id
  })

  // Step 2: Poll until done (each sleep is a fresh, short Vercel invocation)
  for (let i = 0; i < 120; i++) {
    await step.sleep(`${stepId}-poll-wait-${i}`, '15s')

    const result: { status: string; output: unknown; error: string | null } = await step.run(`${stepId}-poll-${i}`, async () => {
      const replicate = new Replicate({ auth: replicateToken })
      const prediction = await replicate.predictions.get(predictionId)
      return { status: prediction.status, output: prediction.output, error: prediction.error as string | null }
    })

    if (result.status === 'succeeded') return result.output
    if (result.status === 'failed' || result.status === 'canceled') {
      throw new Error(`Replicate prediction ${predictionId} ${result.status}: ${result.error}`)
    }
    // still processing — loop again
  }

  throw new Error(`Replicate prediction ${predictionId} timed out after 30 minutes`)
}


// MP4/MOV atom parser — reads creation_time from mvhd box.
// Works for any MP4/MOV (DJI, iPhone, GoPro, Android) without external services.
const MP4_EPOCH_OFFSET_SEC = 2082844800 // seconds between 1904-01-01 and 1970-01-01

async function readMp4CreationTime(signedUrl: string): Promise<string | null> {
  const res = await fetch(signedUrl, { headers: { Range: 'bytes=0-2097151' } })
  if (!res.ok && res.status !== 206) return null
  const buf = new Uint8Array(await res.arrayBuffer())
  return walkAtoms(buf, 'moov', (moovBuf) => walkAtoms(moovBuf, 'mvhd', readMvhdDate))
}

function walkAtoms(buf: Uint8Array, target: string, onMatch: (inner: Uint8Array) => string | null): string | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let pos = 0
  while (pos + 8 <= buf.length) {
    let size = view.getUint32(pos)
    const type = String.fromCharCode(buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7])
    let headerSize = 8
    if (size === 1 && pos + 16 <= buf.length) {
      size = view.getUint32(pos + 8) * 0x100000000 + view.getUint32(pos + 12)
      headerSize = 16
    }
    if (size < headerSize) break
    if (type === target && pos + size <= buf.length) {
      const result = onMatch(buf.subarray(pos + headerSize, pos + size))
      if (result) return result
    }
    pos += size
  }
  return null
}

function readMvhdDate(buf: Uint8Array): string | null {
  if (buf.length < 12) return null
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const version = buf[0]
  let creationTimeSec: number
  if (version === 0) {
    creationTimeSec = view.getUint32(4)
  } else {
    creationTimeSec = view.getUint32(4) * 0x100000000 + view.getUint32(8)
  }
  if (creationTimeSec <= 0) return null
  const date = new Date((creationTimeSec - MP4_EPOCH_OFFSET_SEC) * 1000)
  const yr = date.getUTCFullYear()
  if (yr < 1990 || yr > new Date().getUTCFullYear() + 1) return null
  return date.toISOString()
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
      throw new Error('Admin client failed — SUPABASE_SERVICE_ROLE_KEY not configured')
    }

    // Pre-flight

    // ── Step 1: Fetch context ──
    const context = await step.run('fetch-context', async () => {
      console.log(`[${Date.now()}] [fetch-context] Starting for upload: ${video_upload_id}`);

      const { data: upload, error } = await admin
        .from('video_uploads')
        .select('*')
        .eq('id', video_upload_id)
        .eq('user_id', user_id)
        .single()

      if (error || !upload) {
        console.error(`[${Date.now()}] [fetch-context] Error or not found:`, error);
        throw new Error('Upload not found')
      }

      const mode = event.data.mode || 'full'
      if (upload.status === 'processed' && mode !== 'full') {
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

      console.log(`[${Date.now()}] [fetch-context] Success. Mode: ${mode}`);
      return {
        skip: false as const,
        upload,
        userName,
        openaiKey: openaiKeyRes?.key || null,
        anthropicKey: anthropicKeyRes?.key || null,
      }
    })

    if (context.skip) {
      console.log(`[${Date.now()}] [process-upload] Skipping already processed: ${video_upload_id}`);
      return { status: 'already_processed', video_upload_id }
    }
    const activeContext = context as Extract<typeof context, { skip: false }>

    // Status transition helper using deterministic step IDs
    const reportStatus = async (phase: string) => {
      console.log(`[${Date.now()}] [status-update] Transitioning to: ${phase}`);
      await step.run(`status-update-${phase}`, async () => {
        await admin.from('video_uploads').update({
          status: phase,
          updated_at: new Date().toISOString(),
        }).eq('id', video_upload_id)
      })
    }

    await reportStatus('starting')

    // ── Step 2: Extract audio ──
    const { upload } = activeContext
    await reportStatus('extracting-audio')

    let audioPath: { path: string, extracted: boolean, isDirectUrl?: boolean } = { path: upload.storage_path, extracted: false }

    const shouldExtractAudio = isVideoMimeType(upload.mime_type) || upload.mime_type.startsWith('audio/')
    const replicateToken = process.env.REPLICATE_API_TOKEN

    if (shouldExtractAudio && replicateToken) {
      const storageSignedUrl = await step.run('extract-audio-sign-url', async () => {
        console.log(`[${Date.now()}] [extract-audio] Signing download URL...`);
        return presignDownloadUrl(upload.storage_path, 3600).catch(() => null)
      })

      if (storageSignedUrl) {
        try {
          console.log(`[${Date.now()}] [extract-audio] Starting Replicate job...`);
          const output = await runReplicateAsync(
            step,
            'extract-audio',
            replicateToken,
            'fofr/toolkit',
            { task: 'extract_video_audio_as_mp3', input_file: storageSignedUrl }
          )
          const audioUrl = extractReplicateUrl(output)
          if (audioUrl) {
            console.log(`[${Date.now()}] [extract-audio] Success: ${audioUrl}`);
            audioPath = { path: audioUrl, extracted: true, isDirectUrl: true }
          } else {
            console.warn(`[${Date.now()}] [extract-audio] No audio URL in Replicate output`);
          }
        } catch (err: any) {
          console.error(`[${Date.now()}] [extract-audio] Failed:`, err?.message);
        }
      }
    }

    // ── Step 2b: Extract Metadata (recording date) ──
    await reportStatus('extracting-metadata')
    const metadata = await step.run('extract-metadata', async () => {
      const { upload } = activeContext

      // 1. Trust frontend recorded_at if provided (set from camera filename patterns)
      if (upload.recorded_at) {
        return { recorded_at: upload.recorded_at, found_key: 'pre-extracted' }
      }

      // 2. Parse MP4/MOV mvhd atom directly (works for any camera)
      if (isVideoMimeType(upload.mime_type) || upload.mime_type.startsWith('audio/')) {
        try {
          const signedUrl = await presignDownloadUrl(upload.storage_path, 600)
          const mp4Date = await readMp4CreationTime(signedUrl)
          if (mp4Date) {
            return { recorded_at: mp4Date, found_key: 'mp4-mvhd' }
          }
        } catch (err: any) {
          console.error('[extract-metadata] MP4 parse failed:', err?.message)
        }
      }

      // 3. Filename inference (PXL_20240128_..., etc.)
      const dateRegexes = [
        /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/,
        /(\d{4})-(\d{2})-(\d{2})/,
        /(\d{4})(\d{2})(\d{2})/,
      ]
      for (const regex of dateRegexes) {
        const m = upload.file_name.match(regex)
        if (m) {
          const [, y, mo, d, hh, mm, ss] = m
          const dStr = hh ? `${y}-${mo}-${d}T${hh}:${mm}:${ss}Z` : `${y}-${mo}-${d}T00:00:00Z`
          const date = new Date(dStr)
          if (!isNaN(date.getTime())) {
            return { recorded_at: date.toISOString(), found_key: 'filename-inference' }
          }
        }
      }

      // 4. Fallback: created_at (upload time)
      return {
        recorded_at: (upload as any).created_at,
        found_key: 'fallback-created-at',
      }
    })

    // ── Update: Metadata Pulled ──
    await reportStatus('metadata-extracted')

    // ── Step 2b-bis: Apply Metadata to DB ──
    await step.run('apply-metadata', async () => {
      console.log(`[${Date.now()}] [apply-metadata] Applying to database...`);
      const { upload } = activeContext
      const updateData: any = {
        meta: {
          ...(upload.meta || {}),
          recorded_at_source: metadata.found_key,
        }
      }
      
      // Only update recorded_at if we have a valid, non-null date to apply
      if (metadata.recorded_at) {
        updateData.recorded_at = metadata.recorded_at
      }

      await admin!.from('video_uploads').update(updateData).eq('id', video_upload_id)
      console.log(`[${Date.now()}] [apply-metadata] Success`);
    })

    // ── Step 2c: Thumbnail ──
    // Thumbnails are captured client-side (canvas) at upload time and stored as data: URLs.
    // For videos where the browser couldn't capture a frame (HEVC on Chrome, audio files),
    // thumbnail_url will be null — no server-side fallback since fofr/toolkit does not support
    // frame extraction in a way compatible with its accepted input schema.
    const mode = event.data.mode || 'full'
    const hasThumbnail = upload.thumbnail_url && !upload.thumbnail_url.startsWith('data:image/svg')

    if (!hasThumbnail) {
      console.log(`[${Date.now()}] [thumbnail] No client thumbnail available for ${video_upload_id} — leaving null`)
    }


    // ── Step 2d: Transcode to H.264 for browser-compatible playback ──
    let playbackStoragePath: string | null = null
    const shouldTranscode = isVideoMimeType(upload.mime_type) && upload.mime_type !== 'video/mp4' && mode !== 'thumbnail' && replicateToken

    if (shouldTranscode) {
      await reportStatus('transcoding-video')

      const transcodeSignedUrl = await step.run('transcode-sign-url', async () => {
        console.log(`[${Date.now()}] [transcode-playback] Signing download URL...`);
        return presignDownloadUrl(upload.storage_path, 7200).catch(() => null)
      })

      if (transcodeSignedUrl) {
        try {
          console.log(`[${Date.now()}] [transcode-playback] Starting Replicate job...`);
          const output = await runReplicateAsync(
            step,
            'transcode-playback',
            replicateToken,
            'fofr/toolkit',
            { task: 'convert_input_to_mp4', input_file: transcodeSignedUrl }
          )

          const outputUrl = extractReplicateUrl(output)
          if (outputUrl) {
            playbackStoragePath = await step.run('transcode-upload', async () => {
              console.log(`[${Date.now()}] [transcode-playback] Fetching stream...`);
              const response = await fetch(outputUrl)
              if (!response.body) throw new Error('Failed to start fetch stream.')

              const path = `${user_id}/playback/${video_upload_id}.mp4`
              console.log(`[${Date.now()}] [transcode-playback] Streaming directly to R2...`);

              const { uploadStream } = await import('@/lib/storage/r2')
              await uploadStream(path, response.body, 'video/mp4').catch((uploadErr: any) => {
                console.error(`[${Date.now()}] [transcode-playback] R2 streaming failed:`, uploadErr?.message)
                throw uploadErr
              })
              await admin.from('video_uploads').update({ playback_path: path }).eq('id', video_upload_id)
              console.log(`[${Date.now()}] [transcode-playback] Success: ${path}`);
              return path
            })
          }
        } catch (err: any) {
          console.error(`[${Date.now()}] [transcode-playback] Failed:`, err?.message);
        }
      }
    }

    // ── Update: Transcode Done ──
    await reportStatus('transcribed-media')

    // ── Step 3: Transcribe ──
    let transcription: any = null

    if (mode === 'thumbnail' && upload.transcript) {
      console.log(`[${Date.now()}] [transcribe] Skipping (thumbnail mode and already exists)`);
      transcription = { text: upload.transcript, language: upload.analysis?.language || 'en', segments: (upload as any).transcript_segments || [], skipped: true }
    } else if (upload.mime_type === 'text/plain') {
      const fileRes = await step.run('transcribe-text-read', async () => {
        console.log(`[${Date.now()}] [transcribe] Reading plain text file...`);
        const r = await fetch(await presignDownloadUrl(audioPath.path, 600)).catch(() => null)
        return r?.ok ? r.text() : ''
      })
      transcription = { text: fileRes, language: 'en', segments: [] }
    } else if (replicateToken) {
      const whisperAudioUrl: string = await step.run('transcribe-sign-url', async () => {
        console.log(`[${Date.now()}] [transcribe] Signing audio URL...`);
        if ((audioPath as any).isDirectUrl && audioPath.path.startsWith('http')) return audioPath.path
        const signed = await presignDownloadUrl(audioPath.path, 3600).catch(() => null)
        if (!signed) throw new Error('Failed to sign audio URL for Whisper')
        return signed
      })

      await reportStatus('transcribing')

      console.log(`[${Date.now()}] [transcribe] Starting Replicate Whisper job...`);
      const output = await runReplicateAsync(
        step,
        'transcribe',
        replicateToken,
        'openai/whisper:8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e',
        {
          audio: whisperAudioUrl,
          model: 'large-v3',
          transcription: 'plain text',
          language: 'auto',
          word_timestamps: true,
        }
      ) as any

      console.log(`[${Date.now()}] [transcribe] Extraction segment data...`);
      const text = output?.transcription || ''
      const segments = (output?.segments || []).map((s: any) => ({ start: s.start, end: s.end, text: s.text }))
      const words: Array<{ word: string; start: number; end: number; probability: number }> = []
      for (const seg of (output?.segments || [])) {
        if (Array.isArray(seg.words)) {
          for (const w of seg.words) {
            if (w.word && typeof w.start === 'number' && typeof w.end === 'number') {
              words.push({ word: w.word.trim(), start: w.start, end: w.end, probability: w.probability ?? 1 })
            }
          }
        }
      }
      console.log(`[${Date.now()}] [transcribe] Success. Text length: ${text.length}`);
      transcription = { text, language: output?.detected_language || 'en', segments, words }
    }

    // ── Step 3b: Store word-level transcript ──
    if (transcription && 'words' in transcription && transcription.words && transcription.words.length > 0) {
      await step.run('store-transcript-words', async () => {
        console.log(`[${Date.now()}] [store-transcript-words] Starting for ${transcription.words.length} words...`);
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
        console.log(`[${Date.now()}] [store-transcript-words] Success`);
      })
    }

    // ── Step 4: Analyze ──
    await reportStatus('analyzing-media')
    let analysisResult: any = null

    // Smart Skip: If we already have analysis and just need a thumbnail
    if (mode === 'thumbnail' && (upload as any).analysis) {
      console.log(`[${Date.now()}] [analyze] Skipping (thumbnail mode and already exists)`);
      
      // CRITICAL: Ensure we still mark as processed in the database
      await step.run('finalize-thumbnail-mode', async () => {
        await admin.from('video_uploads').update({
          status: 'processed',
          processed_at: (upload as any).processed_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', video_upload_id)
      })

      analysisResult = { 
        analysis: (upload as any).analysis, 
        modelUsed: (upload as any).analysis_model || 'skipped',
        tags: (upload as any).tags || [],
        clips: (upload as any).generated_clips || [],
        posts: (upload as any).generated_posts || [],
        skipped: true 
      }
    } else if (transcription) {
      // ── Step 4: Run Analysis ──
      console.log(`[${Date.now()}] [analyze] Running runAnalysis...`);
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

      await step.run('apply-analysis-results', async () => {
        console.log(`[${Date.now()}] [analyze] Saving results to DB...`);
        await admin.from('video_uploads').update({
          transcript: transcription.text,
          transcript_segments: transcription.segments,
          analysis: result.analysis,
          analysis_model: result.modelUsed,
          tags,
          generated_clips: clips,
          generated_posts: posts,
          status: 'processed',
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', video_upload_id)
        console.log(`[${Date.now()}] [analyze] DB update success`);
      })

      analysisResult = { ...result, tags, clips, posts, skipped: false }
    }

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
    await reportStatus('saving-results')
    await step.run('create-log-entry', async () => {
      console.log(`[${Date.now()}] [create-log-entry] Starting...`);
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

    // ── Step 7: Surface post candidates from analysis ──
    await step.run('create-post-candidates', async () => {
      const analysis = analysisResult.analysis
      const sessionId = String(video_upload_id)
      const rows: Array<{
        user_id: string
        session_id: string
        source_type: string
        raw_content: string
        generated_versions: any[]
        status: string
      }> = []

      for (const quote of (analysis.key_quotes ?? []) as string[]) {
        if (quote?.trim()) {
          rows.push({ user_id, session_id: sessionId, source_type: 'quote', raw_content: quote.trim(), generated_versions: [], status: 'ready' })
        }
      }
      for (const op of (analysis.strong_opinions ?? []) as string[]) {
        if (op?.trim()) {
          rows.push({ user_id, session_id: sessionId, source_type: 'strong_opinion', raw_content: op.trim(), generated_versions: [], status: 'ready' })
        }
      }
      for (const idea of (analysis.content_ideas ?? []) as Array<{ topic: string; format: string }>) {
        const text = typeof idea === 'object' ? idea.topic : String(idea)
        if (text?.trim()) {
          rows.push({ user_id, session_id: sessionId, source_type: 'observation', raw_content: text.trim(), generated_versions: [], status: 'ready' })
        }
      }

      if (rows.length > 0) {
        await admin.from('post_candidates').insert(rows)
      }
    })

    // ── Step: Populate marinating_ideas for recurring ideas ──
    await step.run('populate-marinating-ideas', async () => {
      const ideas: Array<{ text: string; format: string }> = []
      for (const idea of (analysisResult?.content_ideas ?? []).slice(0, 10)) {
        const text = typeof idea === 'object' ? (idea as any).topic : String(idea)
        const format = typeof idea === 'object' ? ((idea as any).format ?? 'content') : 'content'
        if (text) ideas.push({ text, format })
      }
      if (ideas.length === 0) return

      // Check which ideas have appeared in other uploads (entity_mentions for idea-type entities)
      for (const idea of ideas) {
        const { data: existing } = await admin
          .from('marinating_ideas')
          .select('id, mention_count')
          .eq('user_id', userId)
          .ilike('idea', idea.text.slice(0, 60) + '%')
          .limit(1)

        if (existing && existing.length > 0) {
          // Already exists — increment mention count
          await admin
            .from('marinating_ideas')
            .update({
              mention_count: (existing[0].mention_count ?? 1) + 1,
              last_seen_at: new Date().toISOString(),
              last_upload_id: video_upload_id,
            })
            .eq('id', existing[0].id)
        } else {
          // New marinating idea
          await admin.from('marinating_ideas').insert({
            user_id: userId,
            idea: idea.text,
            format: idea.format,
            source_upload_id: video_upload_id,
            last_upload_id: video_upload_id,
            mention_count: 1,
            last_seen_at: new Date().toISOString(),
            status: 'marinating',
          }).then(() => {})
        }
      }
    })

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
