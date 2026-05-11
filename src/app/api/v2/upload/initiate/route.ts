/**
 * POST /api/v2/upload/initiate
 *
 * Begins an R2 multipart upload for a new vlog. Returns presigned PUT URLs
 * for each part — the browser uploads chunks directly to R2 without proxying
 * through the Worker.
 *
 * Body: { fileName, fileSize, mimeType }
 * Returns: { uploadId, key, partUrls, totalParts, partSize }
 *
 * Subsequent flow:
 *   1. Browser PUTs each chunk to its presigned URL
 *   2. Browser collects ETag from each part response
 *   3. Browser POSTs { uploadId, key, parts: [...] } to /api/v2/upload/complete
 *   4. Browser POSTs vlog metadata to /api/v2/vlogs to register the row in D1
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import {
  createMultipartUpload,
  presignMultipartPartUrl,
  type R2Env,
} from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { ulid } from '@/lib/ulid'
import type { D1Database } from '@cloudflare/workers-types'

const PART_SIZE = 50 * 1024 * 1024 // 50 MB per part — matches browser-side PART_SIZE
const MAX_PARTS = 200             // 10 GB ceiling per upload
const VALID_MIMES = new Set([
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/x-m4a',
])

interface Env extends R2Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

function safeFilename(name: string): string {
  // Strip directory components, replace whitespace + non-printable, cap length
  const base = name.split(/[\\/]/).pop() || 'upload'
  return base.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'upload'
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
    | { fileName?: string; fileSize?: number; mimeType?: string }
    | null
  if (!body || !body.fileName || !body.fileSize || !body.mimeType) {
    return NextResponse.json({ error: 'fileName, fileSize, mimeType required' }, { status: 400 })
  }
  if (!VALID_MIMES.has(body.mimeType)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }

  const totalParts = Math.ceil(body.fileSize / PART_SIZE)
  if (totalParts > MAX_PARTS) {
    return NextResponse.json({ error: `File too large (>${MAX_PARTS * PART_SIZE} bytes)` }, { status: 400 })
  }

  // R2 key: operator-prefixed for clean isolation per operator.
  // Pattern: {operator_id}/uploads/{ulid}/{safe-filename}
  const uploadUlid = ulid()
  const key = `${operator.id}/uploads/${uploadUlid}/${safeFilename(body.fileName)}`

  const uploadId = await createMultipartUpload(env, key, {
    httpMetadata: { contentType: body.mimeType },
  })

  const partUrls: string[] = []
  for (let part = 1; part <= totalParts; part++) {
    partUrls.push(await presignMultipartPartUrl(env, key, uploadId, part, 3600))
  }

  return NextResponse.json({
    uploadId,
    key,
    partUrls,
    totalParts,
    partSize: PART_SIZE,
  })
}
