import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'

const X_CLIENT_ID = process.env.X_CLIENT_ID
const X_CLIENT_SECRET = process.env.X_CLIENT_SECRET
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/social/x/callback`

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const cookieStore = cookies()
  const savedState = cookieStore.get('x_oauth_state')?.value
  const codeVerifier = cookieStore.get('x_oauth_verifier')?.value

  if (!code || state !== savedState || !codeVerifier) {
    return NextResponse.json({ error: 'Invalid OAuth state or verifier' }, { status: 400 })
  }

  try {
    // 1. Exchange code for tokens
    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`)}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: X_CLIENT_ID!,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    })

    const tokens = await tokenResponse.json()
    if (!tokenResponse.ok) {
      return NextResponse.json({ error: 'Failed to exchange tokens', details: tokens }, { status: 500 })
    }

    // 2. Get user info
    const meResponse = await fetch('https://api.twitter.com/2/users/me', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    })
    const meData = await meResponse.json()

    // 3. Store in Supabase
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.redirect('/login')

    const { error } = await supabase
      .from('social_integrations')
      .upsert({
        user_id: session.user.id,
        platform: 'x',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        platform_user_id: meData.data.id,
        platform_username: meData.data.username,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id, platform' })

    if (error) {
      return NextResponse.json({ error: 'Failed to store integration', details: error.message }, { status: 500 })
    }

    // Success - redirect back to settings
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/dashboard/settings?success=x_connected`)
  } catch (err: any) {
    return NextResponse.json({ error: 'OAuth callback failed', details: err.message }, { status: 500 })
  }
}
