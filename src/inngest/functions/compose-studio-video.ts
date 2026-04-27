import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { presignDownloadUrl, uploadBuffer } from '@/lib/storage/r2'
import Replicate from 'replicate'

// Replicate SDK v1.4 returns FileOutput objects (not strings) and sometimes arrays.
function extractReplicateUrl(output: unknown): string | null {
  const value = Array.isArray(output) ? output[0] : output
  if (!value) return null
  const url = typeof value === 'string' ? value : String(value)
  return url.startsWith('http') ? url : null
}

type ComposeVideoEvent = {
  name: 'studio/compose-video'
  data: {
    production_id: string
    user_id: string
  }
}

export const composeStudioVideo = inngest.createFunction(
  {
    id: 'compose-studio-video',
    name: 'Compose Studio Video',
    retries: 1,
    timeouts: { finish: '30m' },
  },
  { event: 'studio/compose-video' },
  async ({ event, step }) => {
    const { production_id, user_id } = event.data
    const admin = createAdminClient()
    if (!admin) throw new Error('Admin client not available')

    const replicateToken = process.env.REPLICATE_API_TOKEN
    if (!replicateToken) throw new Error('REPLICATE_API_TOKEN not set')

    const markStatus = async (status: string, error?: string) => {
      await admin.from('productions').update({
        status,
        error_message: error ?? null,
        updated_at: new Date().toISOString(),
      }).eq('id', production_id)
    }

    // ── Step 1: Load assets ──
    const assets = await step.run('load-assets', async () => {
      const { data: production, error: prodErr } = await admin
        .from('productions')
        .select('id, voiceover_r2_key')
        .eq('id', production_id)
        .single()

      if (prodErr || !production) throw new Error('Production not found')
      if (!production.voiceover_r2_key) throw new Error('No assembled audio — run audio assembly first')

      const { data: segments, error: segErr } = await admin
        .from('segment_assets')
        .select('id, segment_order, image_r2_key, planned_duration_seconds')
        .eq('production_id', production_id)
        .order('segment_order')

      if (segErr || !segments?.length) throw new Error('No segment assets found')

      const segmentsWithImages = segments.filter((s: any) => s.image_r2_key)
      if (!segmentsWithImages.length) throw new Error('No segment images found — run visual generation first')

      return {
        voiceover_r2_key: production.voiceover_r2_key as string,
        segments: segmentsWithImages,
      }
    })

    // ── Step 2: Get presigned URLs for images and audio ──
    const urls = await step.run('presign-assets', async () => {
      const imageUrls: string[] = []

      for (const seg of assets.segments) {
        const url = await presignDownloadUrl(seg.image_r2_key, 7200)
        imageUrls.push(url)
      }

      const audioUrl = await presignDownloadUrl(assets.voiceover_r2_key, 7200)
      return { imageUrls, audioUrl }
    })

    // ── Step 3: Convert each image to a video clip ──
    // Uses fofr/video-to-video: passes image URL as video_url, loops the single
    // frame to create a still-image video clip of the correct duration.
    const clipUrls = await step.run('create-video-clips', async () => {
      const replicate = new Replicate({ auth: replicateToken })
      const clips: string[] = []

      for (let i = 0; i < assets.segments.length; i++) {
        const seg = assets.segments[i]
        const imageUrl = urls.imageUrls[i]
        const duration = (seg as any).planned_duration_seconds ?? 10

        // FFmpeg: loop the single image frame, set FPS, pad to 1920x1080, cut to duration
        const ffmpegCmd = [
          `-vf "loop=loop=-1:size=1:start=0,fps=24,`,
          `scale=1920:1080:force_original_aspect_ratio=decrease,`,
          `pad=1920:1080:(ow-iw)/2:(oh-ih)/2"`,
          `-t ${duration} -c:v libx264 -pix_fmt yuv420p -an`,
        ].join('')

        const output = await replicate.run(
          'fofr/video-to-video:latest' as `${string}/${string}:${string}`,
          {
            input: {
              video_url: imageUrl,
              ffmpeg_command: ffmpegCmd,
            },
          },
        )

        const clipUrl = extractReplicateUrl(output)
        if (!clipUrl) throw new Error(`Failed to create video clip for segment ${seg.segment_order}`)
        clips.push(clipUrl)
      }

      return clips
    })

    // ── Step 4: Concat all clips + overlay audio ──
    const assembledUrl = await step.run('concat-with-audio', async () => {
      const replicate = new Replicate({ auth: replicateToken })

      if (clipUrls.length === 1) {
        // Single segment: just add audio to the clip
        const output = await replicate.run(
          'fofr/video-to-video:latest' as `${string}/${string}:${string}`,
          {
            input: {
              video_url: clipUrls[0],
              ffmpeg_command: `-i "${urls.audioUrl}" -map 0:v -map 1:a -c:v copy -c:a aac -shortest`,
            },
          },
        )
        const url = extractReplicateUrl(output)
        if (!url) throw new Error('Failed to add audio to single segment')
        return url
      }

      // Multiple segments: concat video clips, overlay audio
      // Input 0 = first clip (via video_url), inputs 1..N-1 = remaining clips, input N = audio
      const additionalInputs = clipUrls
        .slice(1)
        .map(u => `-i "${u}"`)
        .join(' ')

      const filterInputs = clipUrls.map((_, i) => `[${i}:v]`).join('')
      const concatFilter = `${filterInputs}concat=n=${clipUrls.length}:v=1:a=0[v]`
      const audioInput = clipUrls.length // index of the audio input

      const ffmpegCmd = [
        additionalInputs,
        `-i "${urls.audioUrl}"`,
        `-filter_complex "${concatFilter}"`,
        `-map "[v]" -map ${audioInput}:a`,
        `-c:v libx264 -c:a aac -shortest`,
      ].join(' ')

      const output = await replicate.run(
        'fofr/video-to-video:latest' as `${string}/${string}:${string}`,
        {
          input: {
            video_url: clipUrls[0],
            ffmpeg_command: ffmpegCmd,
          },
        },
      )

      const url = extractReplicateUrl(output)
      if (!url) throw new Error('Final video composition failed')
      return url
    })

    // ── Step 5: Download + upload to R2 ──
    const r2Key = await step.run('upload-to-r2', async () => {
      const res = await fetch(assembledUrl)
      if (!res.ok) throw new Error(`Failed to download composed video: ${res.status}`)
      const buffer = Buffer.from(await res.arrayBuffer())

      const key = `${user_id}/video/${production_id}.mp4`
      await uploadBuffer(key, buffer, 'video/mp4')
      return key
    })

    // ── Step 6: Finalize ──
    await step.run('finalize', async () => {
      await admin.from('productions').update({
        final_video_r2_keys: [r2Key],
        status: 'done',
        updated_at: new Date().toISOString(),
      }).eq('id', production_id)
    })

    return {
      status: 'done',
      production_id,
      r2Key,
      segments: assets.segments.length,
    }
  },
)
