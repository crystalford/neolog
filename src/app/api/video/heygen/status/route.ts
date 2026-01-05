import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'

const normalizeHeyGenStatus = (status: string) => {
  const s = (status || '').toLowerCase()
  if (s === 'completed') return 'ready'
  if (s === 'failed') return 'error'
  return 'processing'
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const briefId = typeof body.briefId === 'string' ? body.briefId : ''

  if (!briefId) {
    return NextResponse.json({ error: 'briefId is required.' }, { status: 400 })
  }

  const { data: brief } = await supabase
    .from('video_briefs')
    .select('id, author_id, provider_job_id')
    .eq('id', briefId)
    .eq('author_id', session.user.id)
    .maybeSingle()

  if (!brief) {
    return NextResponse.json({ error: 'Video brief not found.' }, { status: 404 })
  }

  if (!brief.provider_job_id) {
    return NextResponse.json({ error: 'No HeyGen job id found for this brief.' }, { status: 400 })
  }

  const key = await resolveProviderKeyWithClient(supabase, session.user.id, 'heygen')
  if (!key?.key) {
    return NextResponse.json({
      error: 'HeyGen API key not configured. Add it in Settings → AI Vault (BYOK).',
    }, { status: 400 })
  }

  const statusUrl = new URL('https://api.heygen.com/v1/video_status.get')
  statusUrl.searchParams.set('video_id', brief.provider_job_id)

  const response = await fetch(statusUrl.toString(), {
    headers: {
      accept: 'application/json',
      'x-api-key': key.key,
    },
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to fetch HeyGen status.', details: data }, { status: 502 })
  }

  const providerStatus = String(data?.data?.status || data?.status || '')
  const normalized = normalizeHeyGenStatus(providerStatus)
  const videoUrl = typeof data?.data?.video_url === 'string' ? data.data.video_url : null
  const errorMessage = normalized === 'error' ? 'HeyGen video failed.' : null

  const { data: updated } = await supabase
    .from('video_briefs')
    .update({
      status: normalized,
      video_url: normalized === 'ready' ? videoUrl : null,
      provider_response: data,
      error_message: errorMessage,
    })
    .eq('id', briefId)
    .eq('author_id', session.user.id)
    .select()
    .single()

  return NextResponse.json({ brief: updated })
}
