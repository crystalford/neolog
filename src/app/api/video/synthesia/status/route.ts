import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'

const normalizeSynthesiaStatus = (status: string) => {
  const s = (status || '').toLowerCase()
  if (s === 'complete' || s === 'completed') return 'ready'
  if (s === 'failed' || s === 'error') return 'error'
  return 'processing'
}

const extractDownloadUrl = (payload: any): string | null => {
  const download = payload?.download
  const candidates = [
    download?.mp4,
    download?.video,
    download?.url,
    payload?.download_url,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }
  return null
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
    return NextResponse.json({ error: 'No Synthesia video id found for this brief.' }, { status: 400 })
  }

  const key = await resolveProviderKeyWithClient(supabase, session.user.id, 'synthesia')
  if (!key?.key) {
    return NextResponse.json({
      error: 'Synthesia API key not configured. Add it in Settings → AI Vault (BYOK).',
    }, { status: 400 })
  }

  const response = await fetch(`https://api.synthesia.io/v2/videos/${encodeURIComponent(brief.provider_job_id)}`, {
    headers: {
      accept: 'application/json',
      Authorization: key.key,
    },
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to fetch Synthesia status.', details: data }, { status: 502 })
  }

  const providerStatus = String(data?.status || '')
  const normalized = normalizeSynthesiaStatus(providerStatus)
  const videoUrl = normalized === 'ready' ? extractDownloadUrl(data) : null
  const errorMessage = normalized === 'error' ? 'Synthesia video failed.' : null

  const { data: updated } = await supabase
    .from('video_briefs')
    .update({
      status: normalized,
      video_url: videoUrl,
      provider_response: data,
      error_message: errorMessage,
    })
    .eq('id', briefId)
    .eq('author_id', session.user.id)
    .select()
    .single()

  return NextResponse.json({ brief: updated })
}
