/**
 * Inngest function: assemble-studio-audio
 *
 * Stitches per-segment recorded audio files into a single finished audio track.
 * Triggered after the operator completes recording all script beats.
 * Uses Replicate FFmpeg to concatenate + normalize.
 */

import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadBuffer } from '@/lib/storage/r2'
import Replicate from 'replicate'

type AssembleAudioEvent = {
  name: 'studio/assemble-audio'
  data: {
    production_id: string
    user_id: string
  }
}

export const assembleStudioAudio = inngest.createFunction(
  {
    id: 'assemble-studio-audio',
    name: 'Assemble Studio Audio',
    retries: 2,
    timeouts: { finish: '30m' },
  },
  { event: 'studio/assemble-audio' },
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

    // ── Step 1: Load segment assets ordered by position ──
    const assets = await step.run('load-assets', async () => {
      const { data, error } = await admin
        .from('segment_assets')
        .select('id, segment_order, voiceover_r2_key, status')
        .eq('production_id', production_id)
        .order('segment_order')

      if (error || !data?.length) throw new Error('No segment assets found')

      const missing = data.filter(a => !a.voiceover_r2_key)
      if (missing.length > 0) {
        throw new Error(`${missing.length} segment(s) have no recorded audio`)
      }

      return data
    })

    // ── Step 2: Generate signed URLs for each recording ──
    const signedUrls = await step.run('generate-signed-urls', async () => {
      const urls: Record<string, string> = {}

      for (const asset of assets) {
        const path = asset.voiceover_r2_key as string
        const { data, error } = await admin.storage
          .from('videos')
          .createSignedUrl(path, 7200)

        if (error || !data?.signedUrl) {
          throw new Error(`Failed to get URL for segment ${asset.segment_order}: ${error?.message}`)
        }
        urls[asset.id] = data.signedUrl
      }

      return urls
    })

    // ── Step 3: Concatenate via Replicate FFmpeg ──
    const assembledUrl = await step.run('concatenate-audio', async () => {
      const replicate = new Replicate({ auth: replicateToken })

      if (assets.length === 1) {
        // Single segment — just return the signed URL (no concat needed)
        return signedUrls[assets[0].id]
      }

      // Build concat filter for N audio inputs
      const inputFlags = assets
        .map(a => `-i "${signedUrls[a.id]}"`)
        .join(' ')

      const filterInputs = assets.map((_, i) => `[${i}:a]`).join('')
      const concatFilter = `${filterInputs}concat=n=${assets.length}:v=0:a=1[a]`

      const output = await replicate.run(
        'fofr/video-to-video:latest' as `${string}/${string}:${string}`,
        {
          input: {
            ffmpeg_command: `${inputFlags} -filter_complex "${concatFilter}" -map "[a]" -c:a libopus -b:a 128k`,
          },
        },
      )

      if (!output || typeof output !== 'string') throw new Error('Audio concatenation failed')
      return output as string
    })

    // ── Step 4: Download assembled audio and store in R2 ──
    const r2Key = await step.run('upload-to-r2', async () => {
      const res = await fetch(assembledUrl)
      if (!res.ok) throw new Error(`Failed to download assembled audio: ${res.status}`)
      const buffer = Buffer.from(await res.arrayBuffer())

      const key = `${user_id}/audio/${production_id}.webm`
      await uploadBuffer(key, buffer, 'audio/webm')
      return key
    })

    // ── Step 5: Store audio, kick off visual generation ──
    await step.run('finalize', async () => {
      await admin.from('productions').update({
        voiceover_r2_key: r2Key,
        status: 'generating-visuals',
        updated_at: new Date().toISOString(),
      }).eq('id', production_id)

      await inngest.send({
        name: 'studio/generate-visuals',
        data: { production_id, user_id },
      })
    })

    return { status: 'generating-visuals', production_id, r2Key, segments: assets.length }
  },
)
