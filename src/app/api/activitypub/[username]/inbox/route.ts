/**
 * ActivityPub Inbox Endpoint
 *
 * Accepts incoming activities (Follow, Like, Announce, etc).
 *
 * POST /api/activitypub/:username/inbox
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyActivityPubRequest } from '@/lib/activitypub-signature'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchRemoteActor, sendSignedActivity } from '@/lib/activitypub-outbound'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: { username: string } }
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

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const { username } = params
  if (!username) {
    return NextResponse.json({ error: 'Missing username' }, { status: 400 })
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const activityId = body.id || `${body.type || 'activity'}:${Date.now()}`

  const { error: insertError } = await admin
    .from('activitypub_inbox')
    .insert({
      user_id: profile.id,
      activity_id: activityId,
      activity_type: body.type || 'Unknown',
      actor: body.actor || null,
      object: body.object || null,
      raw: body,
    })

  if (insertError && insertError.code !== '23505') {
    return NextResponse.json({ error: 'Failed to store activity' }, { status: 500 })
  }

  if (body.actor) {
    await admin
      .from('activitypub_followers')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('user_id', profile.id)
      .eq('actor', body.actor)
  }

  if (body.type === 'Undo' && body.actor && body.object) {
    const target = typeof body.object === 'string' ? body.object : body.object?.id
    if (target) {
      await admin
        .from('activitypub_followers')
        .update({ status: 'rejected', last_seen_at: new Date().toISOString() })
        .eq('user_id', profile.id)
        .eq('actor', body.actor)
    }
  }

  if (body.type === 'Follow' && body.actor && body.object) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.com'
    const expectedObject = `${baseUrl}/${username}`
    if (body.object === expectedObject) {
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
        .from('activitypub_followers')
        .upsert(
          {
            user_id: profile.id,
            actor: body.actor,
            inbox_url: remoteActor?.inbox || null,
            shared_inbox: remoteActor?.endpoints?.sharedInbox || null,
            preferred_username: remoteActor?.preferredUsername || null,
            display_name: remoteActor?.name || null,
            domain,
            status: 'accepted',
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,actor' }
        )

      if (inboxUrl) {
        const acceptActivity = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          id: `${expectedObject}#accept-${Date.now()}`,
          type: 'Accept',
          actor: expectedObject,
          object: body,
        }
        await sendSignedActivity(profile.id, username, inboxUrl, acceptActivity)
      }
    }
  }

  return NextResponse.json({ ok: true }, { status: 202 })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, Signature, Date, Digest',
    },
  })
}
