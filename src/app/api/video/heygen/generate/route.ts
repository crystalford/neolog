import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

const extractVideoId = (payload: any): string | null => {
  const candidates = [
    payload?.data?.video_id,
    payload?.video_id,
    payload?.data?.id,
    payload?.id,
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
    const avatarId = typeof (body as any).avatarId === 'string' ? (body as any).avatarId : ''
    const voiceId = typeof (body as any).voiceId === 'string' ? (body as any).voiceId : ''
    const title = typeof (body as any).title === 'string' ? (body as any).title : ''
    const payloadOverride = body && typeof (body as any).payload === 'object' && (body as any).payload ? (body as any).payload : null

    finalMeta = {
      user_id: session.user.id,
      brief_id: briefId || null,
      has_avatar_id: Boolean(avatarId),
      has_voice_id: Boolean(voiceId),
      title_len: title.length,
      has_payload_override: Boolean(payloadOverride),
    }
    try {
      const run = await startJobRun('video.heygen.generate', finalMeta)
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

    const key = await resolveProviderKeyWithClient(supabase, session.user.id, 'heygen')
    if (!key?.key) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'missing_key' }
      return NextResponse.json({
        error: 'HeyGen API key not configured. Add it in Settings → AI Capture (BYOK).',
      }, { status: 400 })
    }

    if (!payloadOverride && (!avatarId || !voiceId)) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'bad_request_missing_inputs' }
      return NextResponse.json({
        error: 'avatarId and voiceId are required unless you provide a full payload.',
      }, { status: 400 })
    }

  const payload = payloadOverride || {
    title: title || 'Neolog video',
    caption: false,
    dimension: { width: 1280, height: 720 },
    video_inputs: [
      {
        character: {
          type: 'avatar',
          avatar_id: avatarId,
        },
        voice: {
          type: 'text',
          voice_id: voiceId,
          input_text: brief.script,
        },
      },
    ],
  }

    const response = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-api-key': key.key,
    },
    body: JSON.stringify(payload),
  })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
    await supabase
      .from('video_briefs')
      .update({
        status: 'error',
        provider_payload: payload,
        provider_response: data,
        error_message: 'HeyGen video creation failed.',
      })
      .eq('id', briefId)
      .eq('author_id', session.user.id)

    return NextResponse.json({ error: 'HeyGen video creation failed.', details: data }, { status: 502 })
    }

    const videoId = extractVideoId(data)

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
    finalMeta = { ...finalMeta, result: 'success', provider_job_id: videoId || null, updated_brief_id: updated?.id || null }
    return NextResponse.json({ brief: updated })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'HeyGen video creation failed.'
    return NextResponse.json({ error: 'HeyGen video creation failed.' }, { status: 500 })
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
