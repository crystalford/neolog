/**
 * POST /api/v2/upload/initiate
 *
 * Opens an R2 multipart upload and says where it lives. That is all it does.
 *
 * ⚠️ 4 Nov — it used to presign EVERY part here and hand back the lot. For a
 * 1.2 GB recording that is twenty-five URLs whose one-hour clock starts
 * before the first byte moves, so on a slow upstream the later parts come
 * back 403 after twenty minutes of successful uploading. Parts are presigned
 * a window at a time now, by `/api/v2/upload/parts`, just before they are
 * spent.
 *
 * Body: { filename, contentType, size, partSize }
 * Returns: { uploadId, key, partSize, totalParts }
 *
 * Then: the browser PUTs each part to a URL from `/parts`, POSTs the ETags
 * to `/complete`, and registers the row with `POST /api/v2/vlogs`.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createMultipartUpload, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { ulid } from '@/lib/ulid'
import type { D1Database } from '@cloudflare/workers-types'

/** R2's own floor. A smaller part is rejected at complete, not at upload. */
const MIN_PART = 5 * 1024 * 1024
const MAX_PART = 512 * 1024 * 1024
/** R2 allows 10,000; this is the point past which something is wrong. */
const MAX_PARTS = 2000

interface Env extends R2Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() || 'upload'
  return base.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'upload'
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
    | { filename?: string; contentType?: string; size?: number; partSize?: number }
    | null
  if (!body?.filename || !body?.size || !body?.partSize) {
    return NextResponse.json(
      { error: 'filename, size and partSize are required' },
      { status: 400 },
    )
  }

  // ⚠️ A kind, not a list of codecs. The old allowlist named nine exact mime
  // types and a recording the browser labelled anything else — or labelled
  // nothing at all, which happens on a drag from some file managers — was
  // refused at the door with "Unsupported file type". A recording is a
  // recording.
  const contentType = body.contentType || 'application/octet-stream'
  const kind = contentType.split('/')[0]
  if (kind !== 'video' && kind !== 'audio' && contentType !== 'application/octet-stream') {
    return NextResponse.json(
      { error: `This takes video and audio. That one is ${contentType}.` },
      { status: 400 },
    )
  }

  if (body.partSize < MIN_PART || body.partSize > MAX_PART) {
    return NextResponse.json(
      { error: `partSize must be between ${MIN_PART} and ${MAX_PART} bytes` },
      { status: 400 },
    )
  }
  const totalParts = Math.max(1, Math.ceil(body.size / body.partSize))
  if (totalParts > MAX_PARTS) {
    return NextResponse.json(
      { error: 'That file is larger than this takes in one piece.' },
      { status: 400 },
    )
  }

  // {operator_id}/uploads/{ulid}/{safe-filename}
  const key = `${operator.id}/uploads/${ulid()}/${safeFilename(body.filename)}`
  const uploadId = await createMultipartUpload(env, key, {
    httpMetadata: { contentType },
  })

  return NextResponse.json({
    uploadId,
    key,
    partSize: body.partSize,
    totalParts,
  })
}
