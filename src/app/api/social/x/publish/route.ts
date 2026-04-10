import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'

const X_CLIENT_ID = process.env.X_CLIENT_ID
const X_CLIENT_SECRET = process.env.X_CLIENT_SECRET

async function refreshXToken(userId: string, refreshToken: string) {
  const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: X_CLIENT_ID!,
    }),
  })

  const tokens = await tokenResponse.json()
  if (!tokenResponse.ok) {
    throw new Error('Failed to refresh X token')
  }

  const supabase = createClient()
  await supabase
    .from('social_integrations')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('platform', 'x')

  return tokens.access_token
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId } = await request.json()
  if (!postId) return NextResponse.json({ error: 'Post ID required' }, { status: 400 })

  // 1. Get post
  const { data: post, error: postError } = await supabase
    .from('social_queue')
    .select('*')
    .eq('id', postId)
    .single()

  if (postError || !post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  // 2. Get Integration
  const { data: integration, error: intError } = await supabase
    .from('social_integrations')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('platform', 'x')
    .single()

  if (intError || !integration) return NextResponse.json({ error: 'X connection not found' }, { status: 400 })

  let accessToken = integration.access_token
  const isExpired = new Date(integration.expires_at) < new Date()

  if (isExpired) {
    try {
      accessToken = await refreshXToken(session.user.id, integration.refresh_token)
    } catch (err: any) {
      return NextResponse.json({ error: 'Failed to refresh token', details: err.message }, { status: 500 })
    }
  }

  // 3. Post to X
  try {
    const xResponse = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: post.content }),
    })

    const xData = await xResponse.json()
    if (!xResponse.ok) {
      await supabase.from('social_queue').update({ status: 'failed', error_log: JSON.stringify(xData) }).eq('id', postId)
      return NextResponse.json({ error: 'X API error', details: xData }, { status: 500 })
    }

    // 4. Update status
    await supabase.from('social_queue').update({ 
      status: 'posted', 
      posted_at: new Date().toISOString(),
      updated_at: new Date().toISOString() 
    }).eq('id', postId)

    return NextResponse.json({ success: true, tweetId: xData.data.id })
  } catch (err: any) {
    return NextResponse.json({ error: 'Publishing failed', details: err.message }, { status: 500 })
  }
}
