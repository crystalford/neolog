import { createAdminClient } from '@/lib/supabase/admin'
import { inngest } from '@/inngest/client'
import Replicate from 'replicate'

function extractUrl(output: unknown): string | null {
  const value = Array.isArray(output) ? output[0] : output
  if (!value) return null
  const url = typeof value === 'string' ? value : String(value)
  return url.startsWith('http') ? url : null
}

async function plog(admin: any, uploadId: string, step: string, status: string, message?: string) {
  try {
    await admin.from('processing_logs').insert({
      video_upload_id: uploadId,
      step: `thumb:${step}`,
      status,
      message: message?.slice(0, 1000),
      created_at: new Date().toISOString(),
    })
  } catch { /* non-fatal */ }
}

/**
 * Standalone thumbnail generator — fired by POST /api/video-upload/[id]/thumbnail
 *
 * Strategy (most reliable first):
 *   1. Use playback_path (H.264 version) if it exists — avoids all HEVC/rotation issues.
 *      Vertical DJI Mimo HEVC videos have rotation metadata that causes fofr/toolkit
 *      extract_frames_from_input to return 0 frames on the original file. The H.264
 *      playback version has no such issue.
 *   2. Try extract_frames_from_input directly on the original file (fast, works for H.264).
 *   3. Transcode original → H.264 via convert_input_to_mp4, then extract frames.
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

    // ── Step 1: Fetch upload (include playback_path for H.264 fallback) ──
    const upload = await step.run('fetch-upload', async () => {
      const { data, error } = await admin
        .from('video_uploads')
        .select('id, storage_path, mime_type, thumbnail_url, playback_path')
        .eq('id', video_upload_id)
        .eq('user_id', user_id)
        .single()
      if (error || !data) throw new Error('Upload not found')
      return data
    })

    if (!upload.mime_type?.startsWith('video/')) {
      return { status: 'skipped', reason: 'not_video' }
    }

    // ── Step 2: Resolve best input source ──
    // Prefer the already-transcoded H.264 playback version — it avoids HEVC codec
    // issues and rotation metadata problems that affect vertical DJI Mimo videos.
    const inputSource = await step.run('resolve-input', async () => {
      const playbackPath = (upload as any).playback_path as string | null
      if (playbackPath) {
        const { data } = await admin.storage
          .from('videos')
          .createSignedUrl(playbackPath, 3600)
        if (data?.signedUrl) {
          await plog(admin, video_upload_id, 'resolve-input', 'info', `Using H.264 playback_path: ${playbackPath}`)
          return { url: data.signedUrl, source: 'h264_playback' }
        }
      }

      // Fall back to original file — retry a few times since Supabase Storage may
      // have slight propagation delay after TUS upload completes.
      let lastError: any = null
      for (let attempt = 1; attempt <= 4; attempt++) {
        if (attempt > 1) await new Promise(r => setTimeout(r, attempt * 2000))
        const { data, error } = await admin.storage
          .from('videos')
          .createSignedUrl(upload.storage_path, 7200)
        if (data?.signedUrl) {
          return { url: data.signedUrl, source: 'original' }
        }
        lastError = error
        console.error(`[generate-thumbnail] resolve-input attempt ${attempt} failed — path: ${upload.storage_path} | error:`, JSON.stringify(error))
      }

      throw new Error(`Could not sign storage URL — path: ${upload.storage_path} | supabase_error: ${JSON.stringify(lastError)}`)
    })

    // ── Step 3: Extract frames from resolved source ──
    const directFrameUrl = await step.run('extract-frames', async () => {
      try {
        const replicate = new Replicate({ auth: replicateToken })
        const output = await replicate.run('fofr/toolkit', {
          input: {
            task: 'extract_frames_from_input',
            input_file: inputSource.url,
            fps: 1, // fewer frames = faster + less likely to timeout
          },
        }) as unknown

        await plog(admin, video_upload_id, 'extract-frames', 'info',
          `source=${inputSource.source} isArray=${Array.isArray(output)} sample=${JSON.stringify(output)?.slice(0, 200)}`)

        const frames = Array.isArray(output) ? output : (output ? [output] : [])
        if (frames.length === 0) {
          await plog(admin, video_upload_id, 'extract-frames', 'warn', 'No frames returned')
          return null
        }

        const idx = Math.min(2, frames.length - 1)
        const url = typeof frames[idx] === 'string' ? frames[idx] : String(frames[idx])
        return url.startsWith('http') ? url : null
      } catch (err: any) {
        await plog(admin, video_upload_id, 'extract-frames', 'error', err?.message)
        return null
      }
    })

    // ── Step 4: Inline transcode from original → extract frames (last resort) ──
    // Always attempt this if direct extraction returned nothing — even if we already
    // tried the stored H.264 playback file, it may not actually exist in storage
    // (silent upload failure). A fresh transcode from the original is the final safety net.
    const frameUrl = directFrameUrl ?? await step.run('transcode-then-extract', async () => {
      await plog(admin, video_upload_id, 'transcode-then-extract', 'info',
        `Inline transcode fallback (previous source: ${inputSource.source})`)

      try {
        const replicate = new Replicate({ auth: replicateToken })

        // Fresh signed URL in case the previous one expired
        const { data: reSign } = await admin.storage
          .from('videos')
          .createSignedUrl(upload.storage_path, 7200)
        const freshUrl = reSign?.signedUrl
        if (!freshUrl) return null

        const transOutput = await replicate.run('fofr/toolkit', {
          input: { task: 'convert_input_to_mp4', input_file: freshUrl },
        }) as unknown

        const mp4Url = extractUrl(transOutput)
        await plog(admin, video_upload_id, 'transcode-then-extract', 'info',
          `Transcode result: ${mp4Url?.slice(0, 100) ?? 'null'}`)
        if (!mp4Url) return null

        const framesOutput = await replicate.run('fofr/toolkit', {
          input: { task: 'extract_frames_from_input', input_file: mp4Url, fps: 1 },
        }) as unknown

        const frames = Array.isArray(framesOutput) ? framesOutput : (framesOutput ? [framesOutput] : [])
        await plog(admin, video_upload_id, 'transcode-then-extract', 'info', `Frames from H.264: ${frames.length}`)
        if (frames.length === 0) return null

        const idx = Math.min(2, frames.length - 1)
        const url = typeof frames[idx] === 'string' ? frames[idx] : String(frames[idx])
        return url.startsWith('http') ? url : null
      } catch (err: any) {
        await plog(admin, video_upload_id, 'transcode-then-extract', 'error', err?.message)
        return null
      }
    })

    if (!frameUrl) {
      await plog(admin, video_upload_id, 'store', 'error', 'All extraction attempts failed — no thumbnail stored')
      return { status: 'error', error: 'no_frame_extracted' }
    }

    // ── Step 5: Download and store as base64 ──
    await step.run('store-thumbnail', async () => {
      const res = await fetch(frameUrl)
      if (!res.ok) throw new Error(`Failed to fetch frame: ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 500) throw new Error('Frame too small — likely corrupt')

      const isPng = buf[0] === 0x89 && buf[1] === 0x50
      const mime = isPng ? 'image/png' : 'image/jpeg'
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`

      await admin
        .from('video_uploads')
        .update({ thumbnail_url: dataUrl, updated_at: new Date().toISOString() })
        .eq('id', video_upload_id)

      await plog(admin, video_upload_id, 'store', 'done', `Stored ${buf.length} bytes as ${mime}`)
    })

    return { status: 'success', video_upload_id }
  },
)
