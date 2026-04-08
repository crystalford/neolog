export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

const extractVideoId = (payload: any): string | null => {
  const candidates = [
    payload?.data?.video_id,
    payload?.video_id,
    payload?.data?.videoId,
    payload?.videoId,
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

  const secret = process.env.HEYGEN_WEBHOOK_SECRET || ''
  if (secret) {
    const provided = request.headers.get('x-webhook-secret') || ''
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const payload = await request.json().catch(() => null)
    const videoId = extractVideoId(payload)
    const providerStatus = String(payload?.data?.status || payload?.status || '').toLowerCase()
    const status = providerStatus === 'completed' ? 'ready' : providerStatus === 'failed' ? 'error' : 'processing'
    const videoUrl = typeof payload?.data?.video_url === 'string' ? payload.data.video_url : null

    finalMeta = {
      has_webhook_secret: Boolean(secret),
      has_video_id: Boolean(videoId),
      video_id_len: typeof videoId === 'string' ? videoId.length : 0,
      provider_status_len: providerStatus.length,
      normalized_status: status,
      has_video_url: Boolean(videoUrl),
    }
    try {
      const run = await startJobRun('video.heygen.webhook', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!videoId) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'missing_video_id' }
      return NextResponse.json({ error: 'Missing video_id.' }, { status: 400 })
    }

    const supabase = createClient()
    const { data: updated, error } = await supabase
      .from('video_briefs')
      .update({
        status,
        video_url: status === 'ready' ? videoUrl : null,
        provider_response: payload,
        error_message: status === 'error' ? 'HeyGen video failed.' : null,
      })
      .eq('provider', 'heygen')
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
    finalErrorMessage = e?.message || 'HeyGen webhook failed.'
    return NextResponse.json({ error: 'HeyGen webhook failed.' }, { status: 500 })
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
