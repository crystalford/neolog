/**
 * ActivityPub Publication Inbox Endpoint
 *
 * Accepts incoming activities for a publication.
 *
 * POST /api/activitypub/publications/:slug/inbox
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyActivityPubRequest } from '@/lib/activitypub-signature'
import { fetchRemoteActor, sendSignedActivityForPublication } from '@/lib/activitypub-outbound'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const bodyText = await request.text()
  const verification = await verifyActivityPubRequest(request, bodyText)

  if (!verification.ok) {
    return NextResponse.json(
      { error: verification.error || 'Invalid signature' },
      { status: 401 }
    )
  }

  let body: any = null
  try {
    body = JSON.parse(bodyText)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { slug } = params
  if (!slug) {
    return NextResponse.json({ error: 'Missing publication slug' }, { status: 400 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const { data: publication, error: publicationError } = await admin
    .from('publications')
    .select('id, slug, owner_id, is_active')
    .eq('slug', slug)
    .maybeSingle()

  if (publicationError || !publication || !publication.is_active) {
    return NextResponse.json({ error: 'Publication not found' }, { status: 404 })
  }

  const activityId = body.id || `${body.type || 'activity'}:${Date.now()}`

  const { error: insertError } = await admin
    .from('activitypub_publication_inbox')
    .insert({
      publication_id: publication.id,
      activity_id: activityId,
      activity_type: body.type || 'Unknown',
      actor: body.actor || null,
      object: body.object || null,
      raw: body,
    })

  if (insertError && insertError.code !== '23505') {
    return NextResponse.json({ error: 'Failed to store activity' }, { status: 500 })
  }

  if (insertError?.code === '23505') {
    return NextResponse.json({ ok: true, deduped: true }, { status: 202 })
  }

  if (body.actor) {
    await admin
      .from('activitypub_publication_followers')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('publication_id', publication.id)
      .eq('actor', body.actor)
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.com'
  const publicationActorUrl = `${baseUrl}/api/activitypub/publications/${slug}`

  const extractPostSlug = (target: string | null) => {
    if (!target) return null
    try {
      const url = new URL(target.split('#')[0])
      if (url.hostname !== new URL(baseUrl).hostname) {
        return null
      }
      const segments = url.pathname.split('/').filter(Boolean)
      if (segments.length < 2) return null
      return segments[1]
    } catch {
      return null
    }
  }

  const formatActorLabel = (actorUrl: string) => {
    try {
      const url = new URL(actorUrl)
      const parts = url.pathname.split('/').filter(Boolean)
      const handle = parts[parts.length - 1] || url.hostname
      return `@${handle}@${url.hostname}`
    } catch {
      return actorUrl
    }
  }

  if (body.type === 'Undo' && body.actor && body.object) {
    const target = typeof body.object === 'string' ? body.object : body.object?.id
    if (target) {
      await admin
        .from('activitypub_publication_followers')
        .update({ status: 'rejected', last_seen_at: new Date().toISOString() })
        .eq('publication_id', publication.id)
        .eq('actor', body.actor)
    }
  }

  if (body.type === 'Follow' && body.actor && body.object) {
    const profileUrl = `${baseUrl}/p/${slug}`
    if (body.object === publicationActorUrl || body.object === profileUrl) {
      const remoteActor = await fetchRemoteActor(body.actor)
      const inboxUrl = remoteActor?.endpoints?.sharedInbox || remoteActor?.inbox || null

      const domain = (() => {
        try {
          return new URL(body.actor).hostname
        } catch {
          return null
        }
      })()

      await admin
        .from('activitypub_publication_followers')
        .upsert(
          {
            publication_id: publication.id,
            actor: body.actor,
            inbox_url: remoteActor?.inbox || null,
            shared_inbox: remoteActor?.endpoints?.sharedInbox || null,
            preferred_username: remoteActor?.preferredUsername || null,
            display_name: remoteActor?.name || null,
            domain,
            status: 'accepted',
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'publication_id,actor' }
        )

      if (inboxUrl) {
        const acceptActivity = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          id: `${publicationActorUrl}#accept-${Date.now()}`,
          type: 'Accept',
          actor: publicationActorUrl,
          object: body,
        }
        await sendSignedActivityForPublication(publication.id, slug, inboxUrl, acceptActivity)
      }
    }
  }

  if ((body.type === 'Like' || body.type === 'Announce') && body.actor) {
    const target = typeof body.object === 'string' ? body.object : body.object?.id
    const slugValue = extractPostSlug(target || null)
    if (slugValue) {
      const { data: post } = await admin
        .from('posts')
        .select('id, title, slug, author:profiles(username)')
        .eq('publication_id', publication.id)
        .eq('slug', slugValue)
        .maybeSingle()

      if (post) {
        const actorLabel = formatActorLabel(body.actor)
        const type = body.type === 'Like' ? 'fediverse_like' : 'fediverse_boost'
        const authorValue = (post as any).author
        const authorUsername = Array.isArray(authorValue)
          ? authorValue[0]?.username
          : authorValue?.username

        await admin.from('notifications').insert({
          user_id: publication.owner_id,
          type,
          title:
            body.type === 'Like'
              ? `${actorLabel} liked "${post.title}"`
              : `${actorLabel} boosted "${post.title}"`,
          body: target || null,
          url: `/${authorUsername || publication.slug}/${post.slug}`,
          actor_id: null,
          post_id: post.id,
        })
      }
    }
  }

  if (body.type === 'Create' && body.actor && body.object) {
    const inReplyTo = body.object?.inReplyTo || body.object?.in_reply_to
    const target = typeof inReplyTo === 'string' ? inReplyTo : inReplyTo?.id
    const slugValue = extractPostSlug(target || null)
    if (slugValue) {
      const { data: post } = await admin
        .from('posts')
        .select('id, title, slug, author:profiles(username)')
        .eq('publication_id', publication.id)
        .eq('slug', slugValue)
        .maybeSingle()

      if (post) {
        const actorLabel = formatActorLabel(body.actor)
        const authorValue = (post as any).author
        const authorUsername = Array.isArray(authorValue)
          ? authorValue[0]?.username
          : authorValue?.username

        await admin.from('notifications').insert({
          user_id: publication.owner_id,
          type: 'fediverse_reply',
          title: `${actorLabel} replied to "${post.title}"`,
          body: body.object?.content || null,
          url: `/${authorUsername || publication.slug}/${post.slug}`,
          actor_id: null,
          post_id: post.id,
        })
      }
    }
  }

  return NextResponse.json({ ok: true }, { status: 202 })
}
