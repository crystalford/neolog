/**
 * POST /api/v2/vlogs/[id]/audio-chunk-presign
 *
 * Presign endpoint for the browser-side audio backfill flow. Differs from
 * /api/v2/upload/audio-chunk-presign in that it's keyed by vlog_id (existing
 * row) rather than a fresh upload ULID. Used to re-extract audio for vlogs
 * uploaded before browser-side audio extraction existed, or to override
 * audio for vlogs whose original transcribe failed.
 *
 * Body: { chunk_index }
 * Returns: { presigned_url, r2_key }
 *
 * Audio key is placed under {operator}/audio/{vlog_id}/chunk_{idx}.wav so
 * we don't conflict with the source video's R2 prefix (which for old
 * Supabase-imported vlogs may not be a ULID we control).
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { presignPutUrl, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
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

  const { id: vlog_id } = await ctx.params
  if (!vlog_id) {
    return NextResponse.json({ error: 'vlog id required' }, { status: 400 })
  }

  const body = await req.json().catch(() => null) as { chunk_index?: number } | null
  if (!body || typeof body.chunk_index !== 'number' || body.chunk_index < 0 || body.chunk_index > 999) {
    return NextResponse.json({ error: 'chunk_index required (0-999)' }, { status: 400 })
  }

  const row = await findOne<{ id: string }>(
    getDb(env),
    `SELECT id FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    vlog_id, operator.id,
  )
  if (!row) {
    return NextResponse.json({ error: 'vlog not found' }, { status: 404 })
  }

  const r2Key = `${operator.id}/audio/${vlog_id}/chunk_${body.chunk_index}.wav`
  const presigned_url = await presignPutUrl(env, r2Key, 3600)
  return NextResponse.json({ presigned_url, r2_key: r2Key })
}
