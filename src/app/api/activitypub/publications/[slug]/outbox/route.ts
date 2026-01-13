/**
 * ActivityPub Publication Outbox Endpoint
 *
 * Returns ordered collection of publication's published posts.
 *
 * GET /api/activitypub/publications/:slug/outbox
 * GET /api/activitypub/publications/:slug/outbox?page=1
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createOutboxCollectionForActor, APCreateActivity, APNote } from '@/lib/activitypub'

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { slug } = params
  const searchParams = request.nextUrl.searchParams
  const pageParam = searchParams.get('page')
  const page = pageParam ? parseInt(pageParam, 10) : undefined

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }

  const { data: publication, error: publicationError } = await admin
    .from('publications')
    .select('id, slug, is_active')
    .eq('slug', slug)
    .maybeSingle()

  if (publicationError || !publication || !publication.is_active) {
    return NextResponse.json({ error: 'Publication not found' }, { status: 404 })
  }

  const { data: posts, error: postsError } = await admin
    .from('posts')
    .select('id, title, slug, content, content_html, published_at, author:profiles(username)')
    .eq('publication_id', publication.id)
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  if (postsError) {
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 })
  }

  const apPosts = (posts || []).map((post: any) => ({
    id: post.id,
    title: post.title,
    slug: post.slug,
    content: post.content,
    content_html: post.content_html,
    published_at: post.published_at,
    author_username: post.author?.username || slug,
  }))

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.com'
  const actorUrl = `${appUrl}/api/activitypub/publications/${slug}`
  const outboxUrl = `${appUrl}/api/activitypub/publications/${slug}/outbox`
  const collection = createOutboxCollectionForActor(actorUrl, apPosts, appUrl, outboxUrl, page)

  if ('orderedItems' in collection && Array.isArray(collection.orderedItems)) {
    const notes = collection.orderedItems as APNote[]
    const activities: APCreateActivity[] = notes.map((note) => ({
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `${note.id}#create`,
      type: 'Create',
      actor: actorUrl,
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
