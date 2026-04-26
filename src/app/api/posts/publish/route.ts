export const runtime = 'edge'

import { createClient } from '@/lib/supabase/server'

const X_CLIENT_ID = process.env.X_CLIENT_ID
const X_CLIENT_SECRET = process.env.X_CLIENT_SECRET

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { candidate_id, text, platform } = await req.json()
  if (!candidate_id || !text) return Response.json({ error: 'candidate_id and text required' }, { status: 400 })

  if (platform !== 'x') {
    return Response.json({ error: `Platform "${platform}" not yet supported` }, { status: 400 })
  }

  // Get X OAuth tokens
  const { data: integration } = await supabase
    .from('social_integrations')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', session.user.id)
    .eq('platform', 'x')
    .single()

  if (!integration) {
    return Response.json({ error: 'X not connected — connect X in Settings first', code: 'NOT_CONNECTED' }, { status: 422 })
  }

  let accessToken = integration.access_token
  if (new Date(integration.expires_at) < new Date()) {
    // Refresh token
    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: integration.refresh_token,
        client_id: X_CLIENT_ID!,
      }),
    })
    if (!tokenRes.ok) return Response.json({ error: 'Failed to refresh X token' }, { status: 500 })
    const tokens = await tokenRes.json()
    accessToken = tokens.access_token
    await supabase.from('social_integrations').update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    }).eq('user_id', session.user.id).eq('platform', 'x')
  }

  // Post to X
  const xRes = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  const xData = await xRes.json()
  if (!xRes.ok) return Response.json({ error: 'X API error', details: xData }, { status: 500 })

  // Mark candidate as published
  await supabase.from('post_candidates').update({
    status: 'published',
    platform_post_id: xData.data?.id ?? null,
  }).eq('id', candidate_id).eq('user_id', session.user.id)

  return Response.json({ ok: true, tweet_id: xData.data?.id })
}
