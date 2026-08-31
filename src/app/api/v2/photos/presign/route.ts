/**
 * POST /api/v2/photos/presign
 *
 * Returns a single-shot presigned PUT URL the browser uploads the display
 * JPEG to directly (photos are small — no multipart needed). The client has
 * already converted HEIC→JPEG on a canvas, so the object is always a JPEG.
 *
 * Body: { filename: string }
 * Response: { url, key }
 *
 * Key pattern: {operator}/photos/{ulid}.jpg  (mirrors the vlog uploads prefix
 * so ownership checks in the register step are consistent).
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { presignPutUrl, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { ulid } from '@/lib/ulid'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const key = `${operator.id}/photos/${ulid()}.jpg`
  const url = await presignPutUrl(env, key, 3600)
  return NextResponse.json({ url, key }, { headers: { 'Cache-Control': 'no-store' } })
}
