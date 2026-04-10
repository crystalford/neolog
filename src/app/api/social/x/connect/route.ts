import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const runtime = 'edge'

const X_CLIENT_ID = process.env.X_CLIENT_ID
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/social/x/callback`

export async function GET(request: NextRequest) {
  if (!X_CLIENT_ID) {
    return NextResponse.json({ error: 'X_CLIENT_ID not configured' }, { status: 500 })
  }

  // PKCE Generation
  const state = Math.random().toString(36).substring(2, 15)
  const codeVerifier = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  
  // In a real app we'd SHA256 the verifier, but for simplicity in this edge environment 
  // if we don't have a crypto lib handy, we'll use a simple approach or a known helper.
  // Actually, Web Crypto API is available in Edge.
  
  const encoder = new TextEncoder()
  const data = encoder.encode(codeVerifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const xAuthUrl = new URL('https://twitter.com/i/oauth2/authorize')
  xAuthUrl.searchParams.set('response_type', 'code')
  xAuthUrl.searchParams.set('client_id', X_CLIENT_ID)
  xAuthUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  xAuthUrl.searchParams.set('scope', 'tweet.read tweet.write users.read offline.access')
  xAuthUrl.searchParams.set('state', state)
  xAuthUrl.searchParams.set('code_challenge', codeChallenge)
  xAuthUrl.searchParams.set('code_challenge_method', 'S256')

  // Store PKCE in cookies
  const cookieStore = cookies()
  cookieStore.set('x_oauth_state', state, { maxAge: 600, httpOnly: true, secure: true })
  cookieStore.set('x_oauth_verifier', codeVerifier, { maxAge: 600, httpOnly: true, secure: true })

  return NextResponse.redirect(xAuthUrl.toString())
}
