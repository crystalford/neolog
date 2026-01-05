import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'

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
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const briefId = typeof body.briefId === 'string' ? body.briefId : ''
  const avatarId = typeof body.avatarId === 'string' ? body.avatarId : ''
  const voiceId = typeof body.voiceId === 'string' ? body.voiceId : ''
  const title = typeof body.title === 'string' ? body.title : ''
  const payloadOverride = body && typeof body.payload === 'object' && body.payload ? body.payload : null

  if (!briefId) {
    return NextResponse.json({ error: 'briefId is required.' }, { status: 400 })
  }

  const { data: brief } = await supabase
    .from('video_briefs')
    .select('id, author_id, script')
    .eq('id', briefId)
    .eq('author_id', session.user.id)
    .maybeSingle()

  if (!brief) {
    return NextResponse.json({ error: 'Video brief not found.' }, { status: 404 })
  }

  const key = await resolveProviderKeyWithClient(supabase, session.user.id, 'heygen')
  if (!key?.key) {
    return NextResponse.json({
      error: 'HeyGen API key not configured. Add it in Settings → AI Vault (BYOK).',
    }, { status: 400 })
  }

  if (!payloadOverride && (!avatarId || !voiceId)) {
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

  return NextResponse.json({ brief: updated })
}
