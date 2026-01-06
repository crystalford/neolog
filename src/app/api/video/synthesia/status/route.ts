import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

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
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({} as any))
    const briefId = typeof (body as any).briefId === 'string' ? (body as any).briefId : ''

    finalMeta = { user_id: session.user.id, brief_id: briefId || null }
    try {
      const run = await startJobRun('video.synthesia.status', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!briefId) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'bad_request' }
      return NextResponse.json({ error: 'briefId is required.' }, { status: 400 })
    }

  const { data: brief } = await supabase
    .from('video_briefs')
    .select('id, author_id, provider_job_id')
    .eq('id', briefId)
    .eq('author_id', session.user.id)
    .maybeSingle()

    if (!brief) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'not_found' }
      return NextResponse.json({ error: 'Video brief not found.' }, { status: 404 })
    }

    if (!brief.provider_job_id) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'missing_provider_job_id' }
      return NextResponse.json({ error: 'No Synthesia video id found for this brief.' }, { status: 400 })
    }
    finalMeta = {
      ...finalMeta,
      provider_job_id_len: brief.provider_job_id.length,
    }

    const key = await resolveProviderKeyWithClient(supabase, session.user.id, 'synthesia')
    if (!key?.key) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'missing_key' }
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
      finalErrorMessage = 'Failed to fetch Synthesia status.'
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

    finalStatus = 'success'
    finalMeta = {
      ...finalMeta,
      result: 'success',
      normalized_status: normalized,
      has_video_url: Boolean(videoUrl),
      provider_status_len: providerStatus.length,
      updated_brief_id: updated?.id || null,
    }
    return NextResponse.json({ brief: updated })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Failed to fetch Synthesia status.'
    return NextResponse.json({ error: 'Failed to fetch Synthesia status.' }, { status: 500 })
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
