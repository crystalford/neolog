import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  const secret = process.env.SYNTHESIA_WEBHOOK_SECRET || ''
  if (secret) {
    const provided = request.headers.get('x-webhook-secret') || ''
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const payload = await request.json().catch(() => null)
  const videoId = extractVideoId(payload)
  if (!videoId) {
    return NextResponse.json({ error: 'Missing video id.' }, { status: 400 })
  }

  const statusRaw = String(payload?.status || payload?.data?.status || '').toLowerCase()
  const status = statusRaw === 'complete' || statusRaw === 'completed'
    ? 'ready'
    : statusRaw === 'failed' || statusRaw === 'error'
      ? 'error'
      : 'processing'

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
    return NextResponse.json({ error: 'Failed to update brief.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, updated: updated?.id || null })
}
