/**
 * Thumbnail broker — lets a GitHub Actions runner generate missing thumbnails
 * for vlogs that never got one (HEVC files Chrome couldn't decode on the
 * client, so the upload-time browser capture failed). Mirrors the transcode-
 * broker pattern: presign R2 URLs, runner downloads + ffmpegs a single frame
 * + uploads, then we confirm and set vlogs.thumbnail_r2_key.
 *
 * Key convention follows the rest of the codebase: {operator}/thumbs/{vlog_id}.jpg
 *
 *   GET  /api/v2/admin/thumb-broker?vlog_id=X
 *     -> { get_url, put_url, thumbnail_key }   or  { skip: true, reason }
 *   POST /api/v2/admin/thumb-broker { vlog_id, thumbnail_key }
 *     -> heads the R2 object, sets thumbnail_r2_key
 *
 * Idempotent: GET skips if thumbnail already exists (either key or legacy
 * data URI). POST is a no-op if the key is set already.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { presignGetUrl, presignPutUrl } from '@/lib/r2'
import type { D1Database, R2Bucket } from '@cloudflare/workers-types'

export const runtime = 'edge'

interface Env {
  DB: D1Database
  VIDEOS: R2Bucket
  CLOUDFLARE_ACCOUNT_ID: string
  R2_BUCKET_NAME: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  [k: string]: unknown
}

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const vlog_id = new URL(req.url).searchParams.get('vlog_id')
  if (!vlog_id) return NextResponse.json({ error: 'vlog_id required' }, { status: 400 })

  // Prefer the transcoded H.264 as the source for thumbnail extraction when
  // it exists — it's rotation-clean (the re-encode strips metadata) and
  // browser-decodable. Falls back to the original.
  const vlog = await findOne<{
    id: string; r2_key: string; transcoded_r2_key: string | null;
    thumbnail_r2_key: string | null; thumbnail_url: string | null;
    mime_type: string | null;
  }>(
    getDb(env),
    `SELECT id, r2_key, transcoded_r2_key, thumbnail_r2_key, thumbnail_url, mime_type
       FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    vlog_id, operator.id,
  )
  if (!vlog) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (vlog.thumbnail_r2_key || vlog.thumbnail_url) {
    return NextResponse.json({ skip: true, reason: 'already_has_thumbnail' })
  }
  if (!(vlog.mime_type || '').startsWith('video/')) {
    return NextResponse.json({ skip: true, reason: 'not_video' })
  }

  const source_key = vlog.transcoded_r2_key || vlog.r2_key
  const thumbnail_key = `${operator.id}/thumbs/${vlog.id}.jpg`
  const get_url = await presignGetUrl(env, source_key, 6 * 3600)
  const put_url = await presignPutUrl(env, thumbnail_key, 6 * 3600)

  return NextResponse.json({
    vlog_id: vlog.id, get_url, put_url, thumbnail_key,
    source: vlog.transcoded_r2_key ? 'transcoded' : 'original',
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const body = await req.json().catch(() => null) as { vlog_id?: string; thumbnail_key?: string } | null
  if (!body?.vlog_id || !body?.thumbnail_key) {
    return NextResponse.json({ error: 'vlog_id and thumbnail_key required' }, { status: 400 })
  }
  const expectedPrefix = `${operator.id}/thumbs/`
  if (!body.thumbnail_key.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: 'key not in operator thumbs prefix' }, { status: 403 })
  }

  const head = await env.VIDEOS.head(body.thumbnail_key)
  if (!head) return NextResponse.json({ error: 'thumbnail object not found in R2' }, { status: 404 })
  if (head.size < 512) return NextResponse.json({ error: `thumbnail object too small: ${head.size}B` }, { status: 422 })

  await run(
    getDb(env),
    `UPDATE vlogs SET thumbnail_r2_key = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ?`,
    body.thumbnail_key, body.vlog_id, operator.id,
  )

  return NextResponse.json({ ok: true, vlog_id: body.vlog_id, thumbnail_key: body.thumbnail_key, bytes: head.size })
}
