/**
 * ActivityPub Outbox Endpoint
 *
 * Returns ordered collection of user's published posts.
 *
 * GET /api/activitypub/:username/outbox
 * GET /api/activitypub/:username/outbox?page=1
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createOutboxCollection, APCreateActivity, APNote } from '@/lib/activitypub'

export async function GET(
  request: NextRequest,
  { params }: { params: { username: string } }
) {
  const { username } = params
  const searchParams = request.nextUrl.searchParams
  const pageParam = searchParams.get('page')
  const page = pageParam ? parseInt(pageParam, 10) : undefined

  const supabase = createClient()

  // Get profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('username', username)
    .single()

  if (profileError || !profile) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    )
  }

  // Get posts
  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .select('id, title, slug, content, content_html, published_at')
    .eq('author_id', profile.id)
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  if (postsError) {
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    )
  }

  // Format posts for ActivityPub
  const apPosts = (posts || []).map(post => ({
    ...post,
    author_username: profile.username,
  }))

  // Generate collection or page
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.com'
  const collection = createOutboxCollection(username, apPosts, appUrl, page)

  if ('orderedItems' in collection && Array.isArray(collection.orderedItems)) {
    const notes = collection.orderedItems as APNote[]
    const activities: APCreateActivity[] = notes.map((note) => ({
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `${note.id}#create`,
      type: 'Create',
      actor: `${appUrl}/${username}`,
      published: note.published,
      to: note.to,
      cc: note.cc,
      object: note,
    }))
    collection.orderedItems = activities
  }

  return NextResponse.json(collection, {
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
