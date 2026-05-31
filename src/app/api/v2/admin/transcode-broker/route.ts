/**
 * Transcode broker — lets a GitHub Actions runner do the heavy ffmpeg work
 * itself, bypassing the Cloudflare edge (which 524-times-out on real-sized
 * transcodes), the pipeline DO gate, and the pipeline-worker deploy.
 *
 * The runner is a full Linux box with ffmpeg + 6h budget. Flow per vlog:
 *   1. GET  /api/v2/admin/transcode-broker?vlog_id=X
 *        -> { get_url, put_url, transcoded_key }   (presigned R2 URLs)
 *   2. runner: curl get_url -> in ; ffmpeg -> out ; curl -T out put_url
 *   3. POST /api/v2/admin/transcode-broker  { vlog_id, transcoded_key }
 *        -> heads the R2 object, sets vlogs.transcoded_r2_key
 *
 * Idempotent: GET returns { skip:true } if already transcoded; POST is a
 * no-op if the field is already set.
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

async function auth(req: NextRequest, env: Env) {
  return requireOperator(req, env)
}

// GET ?vlog_id=X -> presigned URLs
export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await auth(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const vlog_id = new URL(req.url).searchParams.get('vlog_id')
  if (!vlog_id) return NextResponse.json({ error: 'vlog_id required' }, { status: 400 })

  const vlog = await findOne<{ id: string; r2_key: string; transcoded_r2_key: string | null; mime_type: string | null }>(
    getDb(env),
    `SELECT id, r2_key, transcoded_r2_key, mime_type FROM vlogs
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    vlog_id, operator.id,
  )
  if (!vlog) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (vlog.transcoded_r2_key) return NextResponse.json({ skip: true, reason: 'already_transcoded' })
  if (!(vlog.mime_type || '').startsWith('video/')) return NextResponse.json({ skip: true, reason: 'not_video' })

  const transcoded_key = `${operator.id}/transcoded/${vlog.id}.mp4`
  const get_url = await presignGetUrl(env, vlog.r2_key, 6 * 3600)
  const put_url = await presignPutUrl(env, transcoded_key, 6 * 3600)

  return NextResponse.json({ vlog_id: vlog.id, get_url, put_url, transcoded_key },
    { headers: { 'Cache-Control': 'no-store' } })
}

// POST { vlog_id, transcoded_key } -> verify + set transcoded_r2_key
export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await auth(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const body = await req.json().catch(() => null) as { vlog_id?: string; transcoded_key?: string } | null
  if (!body?.vlog_id || !body?.transcoded_key) {
    return NextResponse.json({ error: 'vlog_id and transcoded_key required' }, { status: 400 })
  }
  // The key must belong to this operator's transcoded prefix.
  const expectedPrefix = `${operator.id}/transcoded/`
  if (!body.transcoded_key.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: 'key not in operator transcoded prefix' }, { status: 403 })
  }

  // Confirm the uploaded object actually exists and is non-trivial.
  const head = await env.VIDEOS.head(body.transcoded_key)
  if (!head) return NextResponse.json({ error: 'transcoded object not found in R2' }, { status: 404 })
  if (head.size < 1024) return NextResponse.json({ error: `transcoded object too small: ${head.size}B` }, { status: 422 })

  // Set the transcode key AND clear any stale 'transcoding' status left by
  // the earlier (wedged) DO dispatch — these vlogs were already 'complete'
  // (extraction done); only the H.264 was missing. Restore complete/ready so
  // the UI stops showing a misleading "transcoding" label on a now-playable
  // video. Never override a genuinely 'failed' row here.
  await run(
    getDb(env),
    `UPDATE vlogs
        SET transcoded_r2_key = ?,
            pipeline_status = CASE WHEN pipeline_status = 'failed' THEN pipeline_status ELSE 'complete' END,
            state = CASE WHEN state = 'failed' THEN state ELSE 'ready' END,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ?`,
    body.transcoded_key, body.vlog_id, operator.id,
  )

  return NextResponse.json({ ok: true, vlog_id: body.vlog_id, transcoded_key: body.transcoded_key, bytes: head.size })
}
