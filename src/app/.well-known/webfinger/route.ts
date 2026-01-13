/**
 * WebFinger Endpoint
 *
 * RFC 7033: https://tools.ietf.org/html/rfc7033
 *
 * Enables user discovery in the fediverse.
 * Example: GET /.well-known/webfinger?resource=acct:alice@neolog.com
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createWebFingerResource, createWebFingerResourceForActor } from '@/lib/activitypub'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const resource = searchParams.get('resource')

  if (!resource) {
    return NextResponse.json(
      { error: 'Missing resource parameter' },
      { status: 400 }
    )
  }

  // Parse resource (should be acct:username@domain)
  const acctMatch = resource.match(/^acct:([^@]+)@(.+)$/)
  if (!acctMatch) {
    return NextResponse.json(
      { error: 'Invalid resource format. Expected acct:username@domain' },
      { status: 400 }
    )
  }

  const [, username, domain] = acctMatch

  // Verify domain matches
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.com'
  const appDomain = new URL(appUrl).hostname

  if (domain !== appDomain) {
    return NextResponse.json(
      { error: 'Domain mismatch' },
      { status: 404 }
    )
  }

  // Check if user exists
  const supabase = createClient()
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', username)
    .single()

  if (!error && profile) {
    const webFingerResource = createWebFingerResource(username, appDomain, appUrl)
    return NextResponse.json(webFingerResource, {
      headers: {
        'Content-Type': 'application/jrd+json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  const { data: publication } = await supabase
    .from('publications')
    .select('slug, is_active')
    .eq('slug', username)
    .maybeSingle()

  if (!publication || !publication.is_active) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    )
  }

  const actorUrl = `${appUrl}/api/activitypub/publications/${publication.slug}`
  const profileUrl = `${appUrl}/p/${publication.slug}`
  const webFingerResource = createWebFingerResourceForActor(
    `acct:${publication.slug}@${appDomain}`,
    actorUrl,
    profileUrl
  )

  return NextResponse.json(webFingerResource, {
    headers: {
      'Content-Type': 'application/jrd+json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
