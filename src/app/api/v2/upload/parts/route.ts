/**
 * POST /api/v2/upload/parts
 *
 * Presigned PUT URLs for a window of parts in an open multipart upload.
 *
 * ⚠️ 4 Nov — this exists because `/initiate` used to presign every part at
 * once. A 1.2 GB recording is twenty-five URLs, and all twenty-five started
 * their one-hour clock before the first byte moved; on a slow upstream the
 * last parts were already dead when the browser reached them and came back
 * 403 after twenty minutes of successful uploading. The operator saw "some
 * of the bigger files failed" and nothing else.
 *
 * A URL minted eight parts ahead of where the browser is cannot go stale in
 * any plausible upload, however slow. The TTL stops being a number to tune.
 *
 * Body: { key, uploadId, parts: number[] }
 * Returns: { urls: [{ partNumber, url }] }
 *
 * ⚠️ The key is checked against the operator's own prefix before anything is
 * signed. `key` arrives from the browser, and signing whatever it asks for
 * would hand out a write URL for any object in the bucket.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { presignMultipartPartUrl, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

/**
 * How long a part URL is good for.
 *
 * Generous, because it is spent within a part or two of being minted and the
 * cost of it expiring is a retry the browser has to notice. Not unbounded,
 * because a signature that outlives the upload is a write capability sitting
 * in a browser's memory for no reason.
 */
const TTL_SECONDS = 2 * 3600

/** One request may not ask for more than the browser's window. */
const MAX_PER_CALL = 16

interface Env extends R2Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(req: NextRequest) {
  const env = getCloudflareContext().env as unknown as Env

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
    | { key?: string; uploadId?: string; parts?: number[] }
    | null
  if (!body?.key || !body?.uploadId || !Array.isArray(body.parts) || !body.parts.length) {
    return NextResponse.json(
      { error: 'key, uploadId and parts are required' },
      { status: 400 },
    )
  }

  // ⚠️ His own prefix, and nothing else. `/initiate` builds the key as
  // `{operator_id}/uploads/{ulid}/{name}`; anything that does not start that
  // way was not minted here.
  if (!body.key.startsWith(`${operator.id}/uploads/`)) {
    return NextResponse.json({ error: 'not your upload' }, { status: 403 })
  }

  const parts = [...new Set(body.parts)]
    .filter(n => Number.isInteger(n) && n >= 1 && n <= 10_000)
    .slice(0, MAX_PER_CALL)
  if (!parts.length) {
    return NextResponse.json({ error: 'no valid part numbers' }, { status: 400 })
  }

  const urls = await Promise.all(
    parts.map(async partNumber => ({
      partNumber,
      url: await presignMultipartPartUrl(env, body.key!, body.uploadId!, partNumber, TTL_SECONDS),
    })),
  )

  return NextResponse.json({ urls })
}
