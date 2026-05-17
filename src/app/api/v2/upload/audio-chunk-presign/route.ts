/**
 * POST /api/v2/upload/audio-chunk-presign
 *
 * Returns a presigned R2 PUT URL for a single audio chunk extracted by the
 * browser. The browser uploads the WAV blob directly to R2 with no Worker
 * proxying — same pattern as the multipart video upload.
 *
 * Body: { key, chunk_index }
 *   key         — the video's R2 key returned by /upload/initiate (so we
 *                 inherit its operator/ulid prefix and don't trust a
 *                 client-supplied audio path)
 *   chunk_index — 0-based index for this audio chunk; embedded in the
 *                 derived key so duplicate uploads overwrite cleanly
 *
 * Returns: { presigned_url, r2_key }
 *
 * The audio key is always derived as:
 *   {operator_prefix}/uploads/{ulid}/audio/chunk_{idx}.wav
 * This sits alongside the video upload's prefix so cleanup of an abandoned
 * upload removes both video and audio.
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
    | { key?: string; chunk_index?: number }
    | null
  if (!body || typeof body.key !== 'string' || typeof body.chunk_index !== 'number') {
    return NextResponse.json({ error: 'key (string) and chunk_index (number) required' }, { status: 400 })
  }
  if (body.chunk_index < 0 || body.chunk_index > 999) {
    return NextResponse.json({ error: 'chunk_index out of range' }, { status: 400 })
  }

  // Validate the supplied key starts with this operator's prefix.
  // Pattern is `{operator.id}/uploads/{ulid}/...` — derive the audio key
  // by replacing the trailing filename with `audio/chunk_{idx}.wav` while
  // preserving the operator + ulid prefix.
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

  const r2Key = `${expectedPrefix}${uploadUlid}/audio/chunk_${body.chunk_index}.wav`
  const presigned_url = await presignPutUrl(env, r2Key, 3600)

  return NextResponse.json({ presigned_url, r2_key: r2Key })
}
