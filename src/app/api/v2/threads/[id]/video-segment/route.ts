/**
 * GET /api/v2/threads/[id]/video-segment
 *
 * Returns a presigned URL to an MP4 of just the video+audio in this
 * thread's span (transcript_span_start..transcript_span_end). First
 * request generates the clip via the FFmpeg container's
 * /extract-video-segment route and uploads to R2; subsequent
 * requests return the cached presigned URL.
 *
 * Cache key: `{operator_id}/video-segments/{thread_id}.mp4`.
 * Same lazy-on-first-click + R2-cache pattern as the audio-segment
 * endpoint. Used by:
 *   - the production engine when production_type='clip', to
 *     materialize the actual artifact
 *   - direct fetch from the Thread page's "Watch clip" action
 *     (not built yet)
 *
 * Response:
 *   { url, cached, duration_sec, start_sec }
 * 404 if the thread has no computed span yet.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { presignGetUrl, getObject, putObject, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  FFMPEG?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return generate(req, params)
}

// POST mirrors GET — used internally by /api/v2/productions when
// producing a clip. Same logic, same return shape.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return generate(req, params)
}

async function generate(req: NextRequest, params: { id: string }) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const db = getDb(env)
  const row = await findOne<{
    thread_id: string
    transcript_span_start: number | null
    transcript_span_end: number | null
    vlog_id: string
    r2_key: string | null
    transcoded_r2_key: string | null
  }>(
    db,
    `SELECT t.id AS thread_id,
            t.transcript_span_start, t.transcript_span_end,
            t.vlog_id, v.r2_key, v.transcoded_r2_key
       FROM threads t
       JOIN vlogs v ON v.id = t.vlog_id
      WHERE t.id = ? AND t.operator_id = ? AND t.deleted_at IS NULL
        AND v.operator_id = ? AND v.deleted_at IS NULL`,
    params.id, operator.id, operator.id,
  )
  if (!row) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

  if (row.transcript_span_start == null || row.transcript_span_end == null) {
    return NextResponse.json({
      error: 'No computed span yet for this thread. Re-extract the vlog to populate transcript_span_start/end.',
    }, { status: 404 })
  }

  const startSec = Number(row.transcript_span_start)
  const endSec = Number(row.transcript_span_end)
  if (endSec - startSec < 1) {
    return NextResponse.json({
      error: `Thread span too short (start=${startSec}, end=${endSec}). Re-extract the vlog.`,
    }, { status: 404 })
  }
  const durationSec = Math.min(600, endSec - startSec)
  const cacheKey = `${operator.id}/video-segments/${params.id}.mp4`

  // Cache check
  try {
    const cached = await getObject(env, cacheKey)
    if (cached) {
      const url = await presignGetUrl(env, cacheKey, 4 * 3600)
      return NextResponse.json({
        url, cached: true, r2_key: cacheKey, duration_sec: durationSec, start_sec: startSec,
      }, { headers: { 'Cache-Control': 'no-store' } })
    }
  } catch { /* miss, proceed */ }

  const sourceKey = row.transcoded_r2_key || row.r2_key
  if (!sourceKey) {
    return NextResponse.json({ error: 'Source video not available' }, { status: 404 })
  }
  const sourceUrl = await presignGetUrl(env, sourceKey, 1800)

  if (!env.FFMPEG) {
    return NextResponse.json({ error: 'FFmpeg binding not available on this deployment' }, { status: 503 })
  }

  let segmentBytes: Uint8Array
  try {
    const ffResp = await env.FFMPEG.fetch('https://ffmpeg.neolog.internal/extract-video-segment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input_url: sourceUrl,
        start_sec: startSec,
        duration_sec: durationSec,
      }),
    })
    if (!ffResp.ok) {
      const errBody = (await ffResp.text()).slice(0, 500)
      return NextResponse.json({ error: `FFmpeg video segment failed: ${errBody}` }, { status: 502 })
    }
    segmentBytes = new Uint8Array(await ffResp.arrayBuffer())
  } catch (err: any) {
    return NextResponse.json({ error: `FFmpeg call failed: ${err?.message || String(err)}` }, { status: 502 })
  }

  try {
    await putObject(env, cacheKey, segmentBytes, { httpMetadata: { contentType: 'video/mp4' } })
  } catch (err: any) {
    return NextResponse.json({ error: `R2 cache upload failed: ${err?.message || String(err)}` }, { status: 500 })
  }

  const url = await presignGetUrl(env, cacheKey, 4 * 3600)
  return NextResponse.json({
    url, cached: false, r2_key: cacheKey, duration_sec: durationSec, start_sec: startSec,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
