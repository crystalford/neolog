/**
 * Inngest function: auto-edit
 *
 * Takes a list of (upload_id, start, end) segments picked by AI and assembles
 * them into a single MP4 via Replicate FFmpeg, then stores the result in R2.
 */

import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadBuffer } from '@/lib/storage/r2'
import Replicate from 'replicate'

type AutoEditEvent = {
  name: 'studio/auto-edit'
  data: {
    production_id: string
    user_id: string
    topic: string
    segments: Array<{
      upload_id: string
      start: number
      end: number
      reason: string
    }>
  }
}

export const autoEdit = inngest.createFunction(
  {
    id: 'auto-edit',
    name: 'Auto Edit from Vlogs',
    retries: 1,
    timeouts: { finish: '45m' },
  },
  { event: 'studio/auto-edit' },
  async ({ event, step }) => {
    const { production_id, user_id, topic, segments } = event.data
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

    // ── Step 1: Load source uploads + generate signed URLs ──
    const signedUrls = await step.run('generate-signed-urls', async () => {
      await markStatus('running')
      const uploadIds = [...new Set(segments.map(s => s.upload_id))]
      const urls: Record<string, string> = {}

      for (const uploadId of uploadIds) {
        const { data: upload } = await admin
          .from('video_uploads')
          .select('storage_path, playback_path')
          .eq('id', uploadId)
          .eq('user_id', user_id)
          .single()

        if (!upload) continue

        // Prefer H.264 playback version — original HEVC may cause Replicate issues
        const path = (upload as any).playback_path ?? upload.storage_path
        const { data } = await admin.storage.from('videos').createSignedUrl(path, 7200)
        if (data?.signedUrl) urls[uploadId] = data.signedUrl
      }

      return urls
    })

    // ── Step 2: Cut each segment via Replicate FFmpeg ──
    const cutUrls = await step.run('cut-segments', async () => {
      const replicate = new Replicate({ auth: replicateToken })
      const results: string[] = []

      for (const seg of segments) {
        const sourceUrl = signedUrls[seg.upload_id]
        if (!sourceUrl) throw new Error(`No signed URL for upload ${seg.upload_id}`)

        const duration = Math.max(5, seg.end - seg.start)

        // fofr/video-to-video: accepts video_url + ffmpeg_command, returns processed video URL
        const output = await replicate.run(
          'fofr/video-to-video:latest' as `${string}/${string}:${string}`,
          {
            input: {
              video_url: sourceUrl,
              ffmpeg_command: `-ss ${seg.start} -t ${duration} -c:v libx264 -c:a aac -movflags +faststart`,
            },
          },
        )

        if (!output || typeof output !== 'string') {
          throw new Error(`Segment cut failed: upload=${seg.upload_id} start=${seg.start}`)
        }
        results.push(output as string)
      }

      return results
    })

    // ── Step 3: Concatenate all cuts into one video ──
    const assembledUrl = await step.run('concatenate', async () => {
      if (cutUrls.length === 1) return cutUrls[0]

      const replicate = new Replicate({ auth: replicateToken })
      const inputFlags = cutUrls.map(url => `-i "${url}"`).join(' ')
      const filterInputs = cutUrls.map((_, i) => `[${i}:v][${i}:a]`).join('')
      const concatFilter = `${filterInputs}concat=n=${cutUrls.length}:v=1:a=1[v][a]`

      const output = await replicate.run(
        'fofr/video-to-video:latest' as `${string}/${string}:${string}`,
        {
          input: {
            ffmpeg_command: `${inputFlags} -filter_complex "${concatFilter}" -map "[v]" -map "[a]" -c:v libx264 -c:a aac -movflags +faststart`,
          },
        },
      )

      if (!output || typeof output !== 'string') throw new Error('Concatenation failed')
      return output as string
    })

    // ── Step 4: Download assembled video and store in R2 ──
    const r2Key = await step.run('upload-to-r2', async () => {
      const res = await fetch(assembledUrl)
      if (!res.ok) throw new Error(`Failed to download assembled video: ${res.status}`)
      const buffer = Buffer.from(await res.arrayBuffer())

      const key = `${user_id}/auto-edit/${production_id}.mp4`
      await uploadBuffer(key, buffer, 'video/mp4')
      return key
    })

    // ── Step 5: Finalize ──
    await step.run('finalize', async () => {
      await admin.from('productions').update({
        status: 'done',
        final_video_r2_keys: [r2Key],
        updated_at: new Date().toISOString(),
      }).eq('id', production_id)
    })

    return { status: 'done', production_id, r2Key, segments: segments.length, topic }
  },
)
