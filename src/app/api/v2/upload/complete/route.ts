/**
 * POST /api/v2/upload/complete
 *
 * Finalizes a multipart upload after the browser has uploaded all parts.
 * Does NOT register a vlog row — that happens via POST /api/v2/vlogs after
 * this returns successfully, so the browser can also include the
 * client-captured thumbnail + recorded_at from the file.
 *
 * Body: { uploadId, key, parts: [{ partNumber, etag }] }
 * Returns: { ok: true }
 *
 * If the browser bails mid-upload, it should POST /api/v2/upload/abort
 * (also in this file) to release storage holds.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { completeMultipartUpload, abortMultipartUpload, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  try {
    await requireOperator(req, env)
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }

  const body = await req.json().catch(() => null) as
    | { uploadId?: string; key?: string; parts?: { partNumber: number; etag: string }[] }
    | null
  if (!body || !body.uploadId || !body.key || !Array.isArray(body.parts) || body.parts.length === 0) {
    return NextResponse.json({ error: 'uploadId, key, parts[] required' }, { status: 400 })
  }

  // Sort parts and basic validation
  const parts = [...body.parts]
    .map(p => ({ partNumber: Number(p.partNumber), etag: String(p.etag) }))
    .filter(p => Number.isInteger(p.partNumber) && p.partNumber > 0 && p.etag.length > 0)
    .sort((a, b) => a.partNumber - b.partNumber)

  if (parts.length !== body.parts.length) {
    return NextResponse.json({ error: 'Invalid parts payload' }, { status: 400 })
  }

  try {
    await completeMultipartUpload(env, body.key, body.uploadId, parts)
  } catch (err: any) {
    return NextResponse.json({ error: `Complete failed: ${err.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// POST /api/v2/upload/complete is the same path as the abort cleanup —
// the browser passes ?abort=1 when it wants to release the upload.
export async function DELETE(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  try {
    await requireOperator(req, env)
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }

  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')
  const uploadId = searchParams.get('uploadId')
  if (!key || !uploadId) {
    return NextResponse.json({ error: 'key + uploadId query params required' }, { status: 400 })
  }

  try {
    await abortMultipartUpload(env, key, uploadId)
  } catch {
    // best-effort cleanup
  }
  return NextResponse.json({ ok: true })
}
