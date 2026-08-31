/**
 * POST /api/v2/upload/slideshow-frame-presign
 *
 * Mirror of /audio-chunk-presign but for JPEG stills the browser
 * captures for slideshow-mode uploads. Same operator-prefix guard.
 *
 * Body: { key, frame_index }
 * Returns: { presigned_url, r2_key }
 *
 * Derived key shape:
 *   {operator}/uploads/{ulid}/slideshow/frame_{idx}.jpg
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { presignPutUrl, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try {
    operator = await requireOperator(req, env)
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }

  const body = await req.json().catch(() => null) as
    | { key?: string; frame_index?: number }
    | null
  if (!body || typeof body.key !== 'string' || typeof body.frame_index !== 'number') {
    return NextResponse.json({ error: 'key (string) and frame_index (number) required' }, { status: 400 })
  }
  if (body.frame_index < 0 || body.frame_index > 9999) {
    return NextResponse.json({ error: 'frame_index out of range' }, { status: 400 })
  }

  const expectedPrefix = `${operator.id}/uploads/`
  if (!body.key.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: 'key does not belong to this operator' }, { status: 403 })
  }
  const tail = body.key.slice(expectedPrefix.length)
  const slash = tail.indexOf('/')
  if (slash < 0) {
    return NextResponse.json({ error: 'malformed key' }, { status: 400 })
  }
  const uploadUlid = tail.slice(0, slash)
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(uploadUlid)) {
    return NextResponse.json({ error: 'malformed ulid in key' }, { status: 400 })
  }

  const idx = String(body.frame_index).padStart(4, '0')
  const r2Key = `${expectedPrefix}${uploadUlid}/slideshow/frame_${idx}.jpg`
  const presigned_url = await presignPutUrl(env, r2Key, 3600)

  return NextResponse.json({ presigned_url, r2_key: r2Key })
}
