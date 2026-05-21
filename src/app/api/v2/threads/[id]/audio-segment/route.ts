/**
 * GET /api/v2/threads/[id]/audio-segment
 *
 * Returns a presigned URL to an MP3 of just the audio in this thread's
 * span (transcript_span_start..transcript_span_end). First request
 * generates the segment via the FFmpeg container's
 * /extract-audio-segment route and uploads to R2; subsequent requests
 * return the cached presigned URL.
 *
 * Cache key: `{operator_id}/audio-segments/{thread_id}.mp3`.
 * Generated lazily on first click. Cap at 600s per segment (FFmpeg
 * server enforces this too).
 *
 * Response:
 *   { url: string, cached: boolean, duration_sec: number, start_sec: number }
 * 404 if the thread has no computed span yet (transcript_span_start
 * is NULL — operator needs to re-extract this vlog).
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
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const db = getDb(env)

  // Load thread + vlog. Need the vlog's audio source — prefer transcoded
  // H.264 r2_key (FFmpeg can also slice audio from it) over the original.
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
            t.vlog_id,
            v.r2_key, v.transcoded_r2_key
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
  const durationSec = Math.max(1, Math.min(600, endSec - startSec))
  const cacheKey = `${operator.id}/audio-segments/${params.id}.mp3`

  // Check cache first
  try {
    const cached = await getObject(env, cacheKey)
    if (cached) {
      const url = await presignGetUrl(env, cacheKey, 4 * 3600)
      return NextResponse.json({
        url, cached: true, duration_sec: durationSec, start_sec: startSec,
      }, { headers: { 'Cache-Control': 'no-store' } })
    }
  } catch {
    // Cache miss or check failed — proceed to generate.
  }

  // Generate: presign a GET for the source audio, call FFmpeg to slice,
  // upload result bytes to R2 at the cache key.
  const sourceKey = row.transcoded_r2_key || row.r2_key
  if (!sourceKey) {
    return NextResponse.json({ error: 'Source audio not available' }, { status: 404 })
  }
  const sourceUrl = await presignGetUrl(env, sourceKey, 1800)

  if (!env.FFMPEG) {
    return NextResponse.json({ error: 'FFmpeg binding not available on this deployment' }, { status: 503 })
  }

  let segmentBytes: Uint8Array
  try {
    const ffResp = await env.FFMPEG.fetch('https://ffmpeg.neolog.internal/extract-audio-segment', {
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
      return NextResponse.json({ error: `FFmpeg segment generation failed: ${errBody}` }, { status: 502 })
    }
    segmentBytes = new Uint8Array(await ffResp.arrayBuffer())
  } catch (err: any) {
    return NextResponse.json({ error: `FFmpeg call failed: ${err?.message || String(err)}` }, { status: 502 })
  }

  // Upload to R2 cache
  try {
    await putObject(env, cacheKey, segmentBytes, { httpMetadata: { contentType: 'audio/mpeg' } })
  } catch (err: any) {
    return NextResponse.json({ error: `R2 cache upload failed: ${err?.message || String(err)}` }, { status: 500 })
  }

  const url = await presignGetUrl(env, cacheKey, 4 * 3600)
  return NextResponse.json({
    url, cached: false, duration_sec: durationSec, start_sec: startSec,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
