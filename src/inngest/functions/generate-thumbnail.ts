import { createAdminClient } from '@/lib/supabase/admin'
import { inngest } from '@/inngest/client'
import Replicate from 'replicate'

function extractUrl(output: unknown): string | null {
  const value = Array.isArray(output) ? output[0] : output
  if (!value) return null
  const url = typeof value === 'string' ? value : String(value)
  return url.startsWith('http') ? url : null
}

/**
 * Standalone thumbnail generator.
 *
 * Strategy:
 *   1. Try extract_frames_from_input directly on the original file (fast).
 *   2. If that produces no frames (e.g. HEVC on a codec-limited host), transcode
 *      to H.264 first via convert_input_to_mp4, then extract frames from the
 *      resulting MP4 (always works — FFmpeg handles H.264 natively).
 *
 * Fires when 'video-upload/generate-thumbnail' is received.
 */
export const generateThumbnail = inngest.createFunction(
  { id: 'generate-thumbnail' },
  { event: 'video-upload/generate-thumbnail' },
  async ({ event, step }) => {
    const { video_upload_id, user_id } = event.data
    const admin = createAdminClient()
    if (!admin) return { status: 'error', error: 'admin_client_failed' }

    const replicateToken = process.env.REPLICATE_API_TOKEN
    if (!replicateToken) return { status: 'error', error: 'no_replicate_token' }

    // ── Step 1: Fetch upload ──
    const upload = await step.run('fetch-upload', async () => {
      const { data, error } = await admin
        .from('video_uploads')
        .select('id, storage_path, mime_type, thumbnail_url')
        .eq('id', video_upload_id)
        .eq('user_id', user_id)
        .single()
      if (error || !data) throw new Error('Upload not found')
      return data
    })

    if (!upload.mime_type?.startsWith('video/')) {
      return { status: 'skipped', reason: 'not_video' }
    }

    // ── Step 2: Create signed URL ──
    const signedUrl = await step.run('sign-url', async () => {
      const { data } = await admin.storage
        .from('videos')
        .createSignedUrl(upload.storage_path, 7200)
      if (!data?.signedUrl) throw new Error('Could not sign storage URL')
      return data.signedUrl
    })

    // ── Step 3: Try direct frame extraction (works for H.264, may fail for HEVC) ──
    const directFrameUrl = await step.run('extract-frames-direct', async () => {
      try {
        const replicate = new Replicate({ auth: replicateToken })
        const output = await replicate.run('fofr/toolkit', {
          input: {
            task: 'extract_frames_from_input',
            input_file: signedUrl,
            fps: 1,
          },
        }) as unknown

        const frames = Array.isArray(output) ? output : (output ? [output] : [])
        if (frames.length === 0) return null

        const idx = Math.min(3, frames.length - 1)
        const url = typeof frames[idx] === 'string' ? frames[idx] : String(frames[idx])
        return url.startsWith('http') ? url : null
      } catch {
        return null
      }
    })

    // ── Step 4: If direct failed, transcode to H.264 first, then extract ──
    const frameUrl = directFrameUrl ?? await step.run('transcode-then-extract', async () => {
      try {
        const replicate = new Replicate({ auth: replicateToken })

        // Re-sign since step 3 may have used most of the 7200s window
        const { data: reSign } = await admin.storage
          .from('videos')
          .createSignedUrl(upload.storage_path, 7200)
        const freshSignedUrl = reSign?.signedUrl
        if (!freshSignedUrl) return null

        // Transcode HEVC → H.264
        const transOutput = await replicate.run('fofr/toolkit', {
          input: {
            task: 'convert_input_to_mp4',
            input_file: freshSignedUrl,
          },
        }) as unknown

        const mp4Url = extractUrl(transOutput)
        if (!mp4Url) return null

        // Extract frames from the H.264 version (always decodable)
        const framesOutput = await replicate.run('fofr/toolkit', {
          input: {
            task: 'extract_frames_from_input',
            input_file: mp4Url,
            fps: 1,
          },
        }) as unknown

        const frames = Array.isArray(framesOutput) ? framesOutput : (framesOutput ? [framesOutput] : [])
        if (frames.length === 0) return null

        const idx = Math.min(3, frames.length - 1)
        const url = typeof frames[idx] === 'string' ? frames[idx] : String(frames[idx])
        return url.startsWith('http') ? url : null
      } catch {
        return null
      }
    })

    if (!frameUrl) {
      return { status: 'error', error: 'no_frame_extracted' }
    }

    // ── Step 5: Download frame and store as base64 in DB ──
    await step.run('store-thumbnail', async () => {
      const res = await fetch(frameUrl)
      if (!res.ok) throw new Error(`Failed to fetch frame: ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 500) throw new Error('Frame too small — likely corrupt')

      // Detect MIME from first bytes
      const isPng = buf[0] === 0x89 && buf[1] === 0x50
      const mime = isPng ? 'image/png' : 'image/jpeg'
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`

      await admin
        .from('video_uploads')
        .update({ thumbnail_url: dataUrl, updated_at: new Date().toISOString() })
        .eq('id', video_upload_id)
    })

    return { status: 'success', video_upload_id }
  },
)
