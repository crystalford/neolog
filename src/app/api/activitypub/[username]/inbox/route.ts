/**
 * ActivityPub Inbox Endpoint
 *
 * Accepts incoming activities (Follow, Like, Announce, etc).
 *
 * POST /api/activitypub/:username/inbox
 */

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)

  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // TODO: Verify HTTP signature and process activities.
  // For now, accept the payload to unblock federation testing.
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
