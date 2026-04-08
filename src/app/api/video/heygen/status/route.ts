export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

const normalizeHeyGenStatus = (status: string) => {
  const s = (status || '').toLowerCase()
  if (s === 'completed') return 'ready'
  if (s === 'failed') return 'error'
  return 'processing'
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
      const run = await startJobRun('video.heygen.status', finalMeta)
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
      return NextResponse.json({ error: 'No HeyGen job id found for this brief.' }, { status: 400 })
    }
    finalMeta = { ...finalMeta, provider_job_id: brief.provider_job_id }

    const key = await resolveProviderKeyWithClient(supabase, session.user.id, 'heygen')
    if (!key?.key) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'missing_key' }
      return NextResponse.json({
        error: 'HeyGen API key not configured. Add it in Settings -> AI Capture (BYOK).',
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
      finalErrorMessage = 'Failed to fetch HeyGen status.'
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
    finalErrorMessage = e?.message || 'Failed to fetch HeyGen status.'
    return NextResponse.json({ error: 'Failed to fetch HeyGen status.' }, { status: 500 })
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

