import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  const secret = process.env.HEYGEN_WEBHOOK_SECRET || ''
  if (secret) {
    const provided = request.headers.get('x-webhook-secret') || ''
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const payload = await request.json().catch(() => null)
  const videoId = extractVideoId(payload)
  if (!videoId) {
    return NextResponse.json({ error: 'Missing video_id.' }, { status: 400 })
  }

  const providerStatus = String(payload?.data?.status || payload?.status || '').toLowerCase()
  const status = providerStatus === 'completed' ? 'ready' : providerStatus === 'failed' ? 'error' : 'processing'
  const videoUrl = typeof payload?.data?.video_url === 'string' ? payload.data.video_url : null

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
    return NextResponse.json({ error: 'Failed to update brief.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, updated: updated?.id || null })
}
