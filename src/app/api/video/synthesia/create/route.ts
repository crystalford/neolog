import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

const extractVideoId = (payload: any): string | null => {
  const candidates = [payload?.id, payload?.data?.id, payload?.video_id, payload?.data?.video_id]
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
    const title = typeof (body as any).title === 'string' ? (body as any).title : ''
    const test = typeof (body as any).test === 'boolean' ? (body as any).test : false
    const avatar = typeof (body as any).avatar === 'string' ? (body as any).avatar : ''
    const background = typeof (body as any).background === 'string' ? (body as any).background : ''
    const payloadOverride = body && typeof (body as any).payload === 'object' && (body as any).payload ? (body as any).payload : null

    finalMeta = {
      user_id: session.user.id,
      brief_id: briefId || null,
      title_len: title.length,
      test,
      avatar_len: avatar.length,
      has_background: Boolean(background),
      has_payload_override: Boolean(payloadOverride),
    }
    try {
      const run = await startJobRun('video.synthesia.create', finalMeta)
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
    .select('id, author_id, script')
    .eq('id', briefId)
    .eq('author_id', session.user.id)
    .maybeSingle()

    if (!brief) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'not_found' }
      return NextResponse.json({ error: 'Video brief not found.' }, { status: 404 })
    }

    finalMeta = { ...finalMeta, script_len: typeof brief.script === 'string' ? brief.script.length : 0 }

    const key = await resolveProviderKeyWithClient(supabase, session.user.id, 'synthesia')
    if (!key?.key) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'missing_key' }
      return NextResponse.json({
        error: 'Synthesia API key not configured. Add it in Settings → AI Vault (BYOK).',
      }, { status: 400 })
    }

    if (!payloadOverride && !avatar) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'missing_avatar' }
      return NextResponse.json({
        error: 'avatar is required unless you provide a full payload.',
      }, { status: 400 })
    }

    const payload = payloadOverride || {
      test,
      title: title || 'Neolog video',
      input: [
        {
          scriptText: brief.script,
          avatar,
          ...(background ? { background } : {}),
        },
      ],
    }

    const response = await fetch('https://api.synthesia.io/v2/videos', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      Authorization: key.key,
    },
    body: JSON.stringify(payload),
  })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      finalErrorMessage = 'Synthesia video creation failed.'
      await supabase
        .from('video_briefs')
        .update({
          status: 'error',
          provider_payload: payload,
          provider_response: data,
          error_message: 'Synthesia video creation failed.',
        })
        .eq('id', briefId)
        .eq('author_id', session.user.id)

      return NextResponse.json({ error: 'Synthesia video creation failed.', details: data }, { status: 502 })
    }

    const videoId = extractVideoId(data)
    finalMeta = {
      ...finalMeta,
      has_provider_job_id: Boolean(videoId),
      provider_job_id_len: typeof videoId === 'string' ? videoId.length : 0,
    }

    const { data: updated } = await supabase
      .from('video_briefs')
      .update({
        status: 'processing',
        provider_job_id: videoId,
        provider_payload: payload,
        provider_response: data,
        error_message: null,
      })
      .eq('id', briefId)
      .eq('author_id', session.user.id)
      .select()
      .single()

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', updated_brief_id: updated?.id || null }
    return NextResponse.json({ brief: updated })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Synthesia create failed.'
    return NextResponse.json({ error: 'Synthesia create failed.' }, { status: 500 })
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
