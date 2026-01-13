/**
 * ActivityPub Inbox Endpoint
 *
 * Accepts incoming activities (Follow, Like, Announce, etc).
 *
 * POST /api/activitypub/:username/inbox
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyActivityPubRequest } from '@/lib/activitypub-signature'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
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

  // TODO: Persist and process activities.
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
