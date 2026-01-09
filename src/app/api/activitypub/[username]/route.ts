/**
 * ActivityPub Actor Endpoint
 *
 * Returns ActivityPub Actor (Person) object for a user.
 *
 * GET /api/activitypub/:username
 * Accept: application/activity+json
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createActor } from '@/lib/activitypub'

export async function GET(
  request: NextRequest,
  { params }: { params: { username: string } }
) {
  const { username } = params

  // Check Accept header (ActivityPub clients will send application/activity+json)
  const accept = request.headers.get('accept') || ''
  const isActivityPubRequest =
    accept.includes('application/activity+json') ||
    accept.includes('application/ld+json')

  // If not an ActivityPub request, redirect to profile page
  if (!isActivityPubRequest) {
    return NextResponse.redirect(new URL(`/${username}`, request.url))
  }

  const supabase = createClient()

  // Get profile
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single()

  if (error || !profile) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    )
  }

  // Generate Actor object
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.com'
  const actor = createActor(
    {
      username: profile.username,
      display_name: profile.display_name || undefined,
      bio: profile.bio || undefined,
      avatar_url: profile.avatar_url || undefined,
      website: profile.website || undefined,
      twitter_username: profile.twitter_username || undefined,
      github_username: profile.github_username || undefined,
      linkedin_url: profile.linkedin_url || undefined,
    },
    appUrl
  )

  return NextResponse.json(actor, {
    headers: {
      'Content-Type': 'application/activity+json; charset=utf-8',
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
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
    },
  })
}
