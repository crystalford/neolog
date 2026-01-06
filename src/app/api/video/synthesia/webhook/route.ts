import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

const extractVideoId = (payload: any): string | null => {
  const candidates = [
    payload?.video_id,
    payload?.videoId,
    payload?.data?.video_id,
    payload?.data?.videoId,
    payload?.video?.id,
    payload?.data?.video?.id,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }
  return null
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const secret = process.env.SYNTHESIA_WEBHOOK_SECRET || ''
  if (secret) {
    const provided = request.headers.get('x-webhook-secret') || ''
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const payload = await request.json().catch(() => null)
    const videoId = extractVideoId(payload)
    const statusRaw = String(payload?.status || payload?.data?.status || '').toLowerCase()
    const status = statusRaw === 'complete' || statusRaw === 'completed'
      ? 'ready'
      : statusRaw === 'failed' || statusRaw === 'error'
        ? 'error'
        : 'processing'

    finalMeta = {
      has_webhook_secret: Boolean(secret),
      has_video_id: Boolean(videoId),
      video_id_len: typeof videoId === 'string' ? videoId.length : 0,
      status_raw_len: statusRaw.length,
      normalized_status: status,
    }
    try {
      const run = await startJobRun('video.synthesia.webhook', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!videoId) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'missing_video_id' }
      return NextResponse.json({ error: 'Missing video id.' }, { status: 400 })
    }

    const supabase = createClient()
    const { data: updated, error } = await supabase
      .from('video_briefs')
      .update({
        status,
        provider_response: payload,
        error_message: status === 'error' ? 'Synthesia video failed.' : null,
      })
      .eq('provider', 'synthesia')
      .eq('provider_job_id', videoId)
      .select('id')
      .maybeSingle()

    if (error) {
      finalErrorMessage = 'Failed to update brief.'
      return NextResponse.json({ error: 'Failed to update brief.' }, { status: 500 })
    }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', updated_brief_id: updated?.id || null }
    return NextResponse.json({ ok: true, updated: updated?.id || null })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Synthesia webhook failed.'
    return NextResponse.json({ error: 'Synthesia webhook failed.' }, { status: 500 })
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
