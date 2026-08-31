/**
 * POST /api/v2/clip-candidates/[id]/ship-as-short
 *
 * One-tap "ship this clip as a short." Takes a clip_candidate row,
 * slices the source vlog at its (start_time..end_time) via FFmpeg,
 * caches the segment in R2, and writes a production row pointing at
 * the cached MP4. Zero LLM in the loop — the clip is your own
 * delivery; we just lift it out of the source vlog.
 *
 * The production is created in `state='produced'` with
 * production_type='clip' and source_kind='clip_candidate'. The
 * /production/[id] page renders it as a playable short the operator
 * can flip to visibility='public' (which serves it at /p/[id]).
 *
 * Idempotency: re-shipping the same clip returns the existing
 * production_id instead of creating a duplicate.
 *
 * Response: { production_id, output_url, duration_sec, cached }
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { presignGetUrl, getObject, putObject, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { ulid } from '@/lib/ulid'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  FFMPEG?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

const MAX_DURATION_SEC = 600  // 10 min cap on any single clip
const PRESIGN_TTL_SEC = 4 * 3600

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)

  const clip = await findOne<{
    id: string
    vlog_id: string
    start_time: number
    end_time: number
    headline: string
    quote: string | null
    r2_key: string | null
    transcoded_r2_key: string | null
  }>(
    db,
    `SELECT cc.id, cc.vlog_id, cc.start_time, cc.end_time,
            cc.headline, cc.quote,
            v.r2_key, v.transcoded_r2_key
       FROM clip_candidates cc
       JOIN vlogs v ON v.id = cc.vlog_id
      WHERE cc.id = ? AND cc.operator_id = ? AND cc.deleted_at IS NULL
        AND v.operator_id = ? AND v.deleted_at IS NULL`,
    params.id, operator.id, operator.id,
  )
  if (!clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 })

  const startSec = Number(clip.start_time)
  const endSec = Number(clip.end_time)
  if (!(endSec > startSec)) {
    return NextResponse.json({ error: `Clip span invalid (start=${startSec}, end=${endSec})` }, { status: 400 })
  }
  const durationSec = Math.min(MAX_DURATION_SEC, endSec - startSec)
  const cacheKey = `${operator.id}/clip-shorts/${clip.id}.mp4`

  // Idempotent: if we already shipped this clip, return the same production.
  const existing = await findOne<{ id: string; output_r2_key: string | null }>(
    db,
    `SELECT id, output_r2_key FROM productions
      WHERE operator_id = ? AND source_kind = 'clip_candidate' AND source_id = ?
        AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    operator.id, clip.id,
  )
  if (existing) {
    let url: string | null = null
    if (existing.output_r2_key) {
      try { url = await presignGetUrl(env, existing.output_r2_key, PRESIGN_TTL_SEC) } catch {}
    }
    return NextResponse.json({
      production_id: existing.id, output_url: url, duration_sec: durationSec, cached: true,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // R2 cache check on the segment itself — if a previous attempt sliced
  // but didn't write the production row, reuse the bytes.
  let segmentExists = false
  try { segmentExists = !!(await getObject(env, cacheKey)) } catch {}

  if (!segmentExists) {
    const sourceKey = clip.transcoded_r2_key || clip.r2_key
    if (!sourceKey) return NextResponse.json({ error: 'Source video not available' }, { status: 404 })
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
        return NextResponse.json({ error: `FFmpeg slice failed: ${errBody}` }, { status: 502 })
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
  }

  // Create the production row.
  const productionId = ulid()
  await run(
    db,
    `INSERT INTO productions (
        id, operator_id, production_type, source_kind, source_id, state,
        script_text, output_r2_key, output_metadata,
        prompt_version, tier, produced_at
     ) VALUES (?, ?, 'clip', 'clip_candidate', ?, 'produced',
               NULL, ?, ?, 'clip-v1·ship-as-short', 'lo_fi', CURRENT_TIMESTAMP)`,
    productionId, operator.id, clip.id, cacheKey,
    JSON.stringify({
      duration_sec: durationSec,
      start_sec: startSec,
      end_sec: startSec + durationSec,
      source_vlog_id: clip.vlog_id,
      headline: clip.headline,
      mime: 'video/mp4',
    }),
  )

  // Flag the clip_candidate row as approved so it stops appearing on
  // the home page (status='approved' is the closest existing value;
  // 'published' is reserved for actually-posted outputs).
  try {
    await run(
      db,
      `UPDATE clip_candidates SET status = 'approved', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND operator_id = ?`,
      clip.id, operator.id,
    )
  } catch (err: any) {
    console.warn(`[ship-as-short] failed to update clip status: ${err?.message || err}`)
  }

  let url: string | null = null
  try { url = await presignGetUrl(env, cacheKey, PRESIGN_TTL_SEC) } catch {}

  return NextResponse.json({
    production_id: productionId, output_url: url, duration_sec: durationSec, cached: segmentExists,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
