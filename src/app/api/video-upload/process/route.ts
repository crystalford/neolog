import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'
import { inngest } from '@/inngest/client'

export const maxDuration = 300

/**
 * POST /api/video-upload/process
 *
 * Triggers async processing via Inngest for a given video_upload_id.
 * This is a lightweight endpoint — the real work happens in the Inngest function.
 * Kept as a manual trigger for retry/reprocess scenarios.
 */
export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { video_upload_id } = body

    if (!video_upload_id) {
      return NextResponse.json({ error: 'video_upload_id is required' }, { status: 400 })
    }

    try {
      const run = await startJobRun('video-upload.process', {
        user_id: session.user.id,
        video_upload_id,
      })
      runId = run.id
    } catch {
      // best-effort
    }

    finalMeta = { user_id: session.user.id, video_upload_id }

    // Verify ownership
    const { data: upload, error: fetchError } = await supabase
      .from('video_uploads')
      .select('id, user_id, status')
      .eq('id', video_upload_id)
      .eq('user_id', session.user.id)
      .single()

    if (fetchError || !upload) {
      finalErrorMessage = 'Upload not found'
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    // Send to Inngest for async processing
    await inngest.send({
      name: 'video-upload/process',
      data: {
        video_upload_id,
        user_id: session.user.id,
      },
    })

    finalStatus = 'success'

    return NextResponse.json({
      id: video_upload_id,
      status: 'queued',
      message: 'Processing started. Check back for status updates.',
    })
  } catch (error: any) {
    console.error('Process trigger error:', error)
    finalErrorMessage = error.message || 'Failed to start processing'
    return NextResponse.json({ error: 'Failed to start processing' }, { status: 500 })
  } finally {
    try {
      if (runId) {
        await finishJobRun(
          runId,
          finalStatus,
          { duration_ms: Date.now() - startedAt, ...finalMeta },
          finalErrorMessage,
        )
      }
    } catch {
      // best-effort
    }
  }
}
