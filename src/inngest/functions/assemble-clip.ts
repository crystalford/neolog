/**
 * Inngest function: assemble-edit-plan
 *
 * Triggered when the user approves an edit plan and requests the actual video.
 * Uses Replicate FFmpeg to cut each segment from its source video and concatenate
 * them into a finished MP4 with hard cuts.
 */

import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import Replicate from 'replicate'
import type { EditPlan, EditDecision } from '@/types/database'

type AssembleClipEvent = {
  name: 'clip-session/assemble'
  data: {
    session_id: string
    edit_plan_id: string
    user_id: string
  }
}

export const assembleClip = inngest.createFunction(
  {
    id: 'assemble-edit-plan',
    name: 'Assemble Edit Plan',
    retries: 1,
    timeouts: {
      finish: '30m', // video assembly can take a while
    },
  },
  { event: 'clip-session/assemble' },
  async ({ event, step }) => {
    const { session_id, edit_plan_id, user_id } = event.data

    const admin = createAdminClient()
    if (!admin) throw new Error('Admin client not available')

    const replicateToken = process.env.REPLICATE_API_TOKEN
    if (!replicateToken) throw new Error('REPLICATE_API_TOKEN not set')

    // ── Step 1: Load session + edit plan + source videos ──
    const context = await step.run('load-context', async () => {
      const { data: session, error } = await admin
        .from('clip_sessions')
        .select('id, edit_plans')
        .eq('id', session_id)
        .eq('user_id', user_id)
        .single()

      if (error || !session) throw new Error('Session not found')

      const editPlans = (session.edit_plans as EditPlan[]) || []
      const plan = editPlans.find(p => p.id === edit_plan_id)
      if (!plan) throw new Error('Edit plan not found')

      // Fetch all source uploads needed for this plan
      const uploadIds = [...new Set(plan.segments.map(s => s.source_upload_id))]
      const { data: uploads, error: uploadsError } = await admin
        .from('video_uploads')
        .select('id, storage_path, mime_type, file_name')
        .in('id', uploadIds)
        .eq('user_id', user_id)

      if (uploadsError || !uploads) throw new Error('Failed to load source uploads')

      type UploadRecord = { id: string; storage_path: string; mime_type: string; file_name: string }
      const uploadMap = Object.fromEntries(uploads.map(u => [u.id, u])) as Record<string, UploadRecord>

      return { plan, uploadMap }
    })

    // ── Step 2: Generate signed URLs for all source videos ──
    const signedUrls = await step.run('generate-signed-urls', async () => {
      const { uploadMap } = context
      const urlMap: Record<string, string> = {}

      for (const [uploadId, upload] of Object.entries(uploadMap)) {
        const { data, error } = await admin.storage
          .from('videos')
          .createSignedUrl(upload.storage_path, 7200) // 2hr expiry

        if (error || !data?.signedUrl) {
          throw new Error(`Failed to generate signed URL for ${upload.file_name}`)
        }
        urlMap[uploadId] = data.signedUrl
      }

      return urlMap
    })

    // ── Step 3: Cut and assemble via Replicate FFmpeg ──
    // Strategy: cut each segment individually, then concatenate all segments.
    // This is the most reliable approach — one FFmpeg call per segment cut,
    // then a final concat call.
    const assembledPath = await step.run('assemble-video', async () => {
      const { plan } = context
      const replicate = new Replicate({ auth: replicateToken })

      // Cut each segment from its source video
      const segmentUrls: string[] = []

      for (const segment of plan.segments) {
        const sourceUrl = signedUrls[segment.source_upload_id]
        if (!sourceUrl) throw new Error(`No signed URL for upload ${segment.source_upload_id}`)

        const duration = segment.end - segment.start

        // Use FFmpeg to cut the segment: seek to start, take `duration` seconds
        const output = await replicate.run(
          'fofr/video-to-video:latest' as any,
          {
            input: {
              video_url: sourceUrl,
              ffmpeg_command: `-ss ${segment.start} -t ${duration} -c:v copy -c:a copy`,
            },
          },
        )

        if (!output || typeof output !== 'string') {
          throw new Error(`Segment cut failed for ${segment.source_upload_id} at ${segment.start}`)
        }

        segmentUrls.push(output as string)
      }

      // Concatenate all segments into the final video
      // Build an FFmpeg concat filter from the segment URLs
      const inputFlags = segmentUrls.map(url => `-i "${url}"`).join(' ')
      const filterInputs = segmentUrls.map((_, i) => `[${i}:v][${i}:a]`).join('')
      const concatFilter = `${filterInputs}concat=n=${segmentUrls.length}:v=1:a=1[v][a]`
      const ffmpegCmd = `${inputFlags} -filter_complex "${concatFilter}" -map "[v]" -map "[a]" -c:v libx264 -c:a aac -movflags +faststart`

      const assembled = await replicate.run(
        'fofr/video-to-video:latest' as any,
        {
          input: {
            ffmpeg_command: ffmpegCmd,
          },
        },
      )

      if (!assembled || typeof assembled !== 'string') {
        throw new Error('Final assembly failed')
      }

      // Download assembled video and upload to Supabase Storage
      const videoResponse = await fetch(assembled as string)
      const videoBuffer = Buffer.from(await videoResponse.arrayBuffer())

      const timestamp = Date.now()
      const safeTitle = plan.title.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 50)
      const storagePath = `${user_id}/assembled/${timestamp}_${safeTitle}.mp4`

      const { error: uploadError } = await admin.storage
        .from('videos')
        .upload(storagePath, videoBuffer, {
          contentType: 'video/mp4',
          cacheControl: '86400',
        })

      if (uploadError) throw new Error(`Failed to upload assembled video: ${uploadError.message}`)

      return storagePath
    })

    // ── Step 4: Save assembled path back to edit plan ──
    await step.run('save-result', async () => {
      const { data: session } = await admin
        .from('clip_sessions')
        .select('edit_plans')
        .eq('id', session_id)
        .single()

      const editPlans = ((session?.edit_plans as EditPlan[]) || []).map(plan =>
        plan.id === edit_plan_id
          ? { ...plan, assembled_storage_path: assembledPath }
          : plan,
      )

      await admin.from('clip_sessions').update({
        edit_plans: editPlans,
        updated_at: new Date().toISOString(),
      }).eq('id', session_id)
    })

    return { status: 'assembled', session_id, edit_plan_id, storage_path: assembledPath }
  },
)
