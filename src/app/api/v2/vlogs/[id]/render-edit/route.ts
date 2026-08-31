/**
 * POST /api/v2/vlogs/[id]/render-edit
 *
 * Renders the operator's saved cut-ranges draft (VlogTranscriptEditor,
 * PATCH .../cut-ranges) into one coherent MP4 (or MP3 for audio-only
 * vlogs) — the raw vlog with the cut spans actually removed, not just
 * marked. No LLM in the loop, same "your own delivery, we just cut it"
 * philosophy as ship-as-short.
 *
 * Computes the complement of the saved cut word-ranges as a list of kept
 * time spans, extracts each kept span via the FFmpeg Container Worker
 * (in parallel, capped at 5 concurrent calls so one container instance
 * doesn't get flooded), then concatenates them (skipped entirely when
 * only one span survives — /concat requires >=2 inputs anyway).
 *
 * The production is created (or reused/updated, if this vlog was already
 * rendered before) as production_type='coherent_edit',
 * source_kind='vlog', source_id=<vlog id>. Idempotency: if the vlog's
 * most recent 'vlog'-sourced production still has a live output_r2_key
 * (i.e. no edit has invalidated it since — see the cut-ranges PATCH
 * route), the cached render is returned instead of re-cutting.
 *
 * Response: { production_id, output_url, duration_sec, cached }
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany, run } from '@/lib/d1'
import { presignGetUrl, putObject, deleteObject, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { ulid } from '@/lib/ulid'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  FFMPEG?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

const PRESIGN_TTL_SEC = 4 * 3600
const SEGMENT_PRESIGN_TTL_SEC = 1800
const CONCURRENCY = 5

async function mapWithConcurrency<T, R>(
  items: T[], limit: number, fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)

  const vlog = await findOne<{
    id: string; mime_type: string; r2_key: string; transcoded_r2_key: string | null
    duration_seconds: number | null; cut_ranges_json: string | null
  }>(
    db,
    `SELECT id, mime_type, r2_key, transcoded_r2_key, duration_seconds, cut_ranges_json
       FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!vlog) return NextResponse.json({ error: 'Vlog not found' }, { status: 404 })

  // Idempotent: an un-invalidated render already exists, serve it.
  const existing = await findOne<{ id: string; output_r2_key: string | null }>(
    db,
    `SELECT id, output_r2_key FROM productions
      WHERE operator_id = ? AND source_kind = 'vlog' AND source_id = ?
        AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    operator.id, vlog.id,
  )
  if (existing?.output_r2_key) {
    let url: string | null = null
    try { url = await presignGetUrl(env, existing.output_r2_key, PRESIGN_TTL_SEC) } catch {}
    return NextResponse.json({
      production_id: existing.id, output_url: url, duration_sec: null, cached: true,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  if (!env.FFMPEG) {
    return NextResponse.json({ error: 'FFmpeg binding not available on this deployment' }, { status: 503 })
  }

  const isAudioOnly = (vlog.mime_type ?? '').startsWith('audio/')
  const ext = isAudioOnly ? 'mp3' : 'mp4'
  const contentType = isAudioOnly ? 'audio/mpeg' : 'video/mp4'
  const extractPath = isAudioOnly ? '/extract-audio-segment' : '/extract-video-segment'
  const concatPath = isAudioOnly ? '/concat-audio' : '/concat'

  // Resolve the source the FFmpeg worker reads from.
  let sourceKey: string | null = null
  if (isAudioOnly) {
    const mp3Key = `${operator.id}/audio/${vlog.id}/mp3.full`
    try { if (await env.VIDEOS.head(mp3Key)) sourceKey = mp3Key } catch {}
    if (!sourceKey) {
      return NextResponse.json({ error: 'Source audio not available for this vlog yet' }, { status: 404 })
    }
  } else {
    sourceKey = vlog.transcoded_r2_key || vlog.r2_key
    if (!sourceKey) return NextResponse.json({ error: 'Source video not available' }, { status: 404 })
  }
  const sourceUrl = await presignGetUrl(env, sourceKey, 1800)

  // Word-index cut ranges -> kept time spans.
  const words = await findMany<{ start_time: number; end_time: number }>(
    db,
    `SELECT start_time, end_time FROM transcript_words WHERE vlog_id = ? ORDER BY word_index ASC`,
    vlog.id,
  )
  const n = words.length
  if (n === 0) {
    return NextResponse.json({ error: 'No word-level transcript available to render from' }, { status: 400 })
  }

  let cutRanges: Array<{ start_word_index: number; end_word_index: number }> = []
  if (vlog.cut_ranges_json) {
    try {
      const parsed = JSON.parse(vlog.cut_ranges_json)
      if (Array.isArray(parsed)) cutRanges = parsed
    } catch {}
  }
  cutRanges = cutRanges
    .map(c => ({
      start_word_index: Math.max(0, Math.min(n - 1, c.start_word_index)),
      end_word_index: Math.max(0, Math.min(n - 1, c.end_word_index)),
    }))
    .sort((a, b) => a.start_word_index - b.start_word_index)

  const kept: Array<{ start_sec: number; end_sec: number }> = []
  let cursor = 0
  for (const c of cutRanges) {
    if (c.start_word_index > cursor) {
      const segEnd = Math.min(c.start_word_index - 1, n - 1)
      if (segEnd >= cursor) kept.push({ start_sec: words[cursor].start_time, end_sec: words[segEnd].end_time })
    }
    cursor = Math.max(cursor, c.end_word_index + 1)
  }
  if (cursor < n) kept.push({ start_sec: words[cursor].start_time, end_sec: words[n - 1].end_time })
  if (kept.length === 0) {
    return NextResponse.json({ error: 'These cuts remove the entire vlog — nothing left to render' }, { status: 400 })
  }

  // Extract each kept span in parallel (capped concurrency — the FFmpeg
  // container does real work per request, an unbounded fan-out risks
  // queuing badly on one instance).
  let segmentBytes: Uint8Array[]
  try {
    segmentBytes = await mapWithConcurrency(kept, CONCURRENCY, async (span) => {
      const ffResp = await env.FFMPEG!.fetch(`https://ffmpeg.neolog.internal${extractPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input_url: sourceUrl,
          start_sec: span.start_sec,
          duration_sec: Math.max(0.1, span.end_sec - span.start_sec),
        }),
      })
      if (!ffResp.ok) {
        const errBody = (await ffResp.text()).slice(0, 500)
        throw new Error(`FFmpeg extract failed: ${errBody}`)
      }
      return new Uint8Array(await ffResp.arrayBuffer())
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 502 })
  }

  let finalBytes: Uint8Array
  if (segmentBytes.length === 1) {
    finalBytes = segmentBytes[0]
  } else {
    // /concat needs R2-hosted URLs (it downloads them itself) — stage
    // each segment in R2 temporarily, concat, then clean up.
    const segmentKeys = segmentBytes.map((_, i) => `${operator.id}/vlog-edit-segments/${vlog.id}/${i}.${ext}`)
    try {
      await Promise.all(segmentBytes.map((b, i) => putObject(env, segmentKeys[i], b, { httpMetadata: { contentType } })))
      const segmentUrls = await Promise.all(segmentKeys.map(k => presignGetUrl(env, k, SEGMENT_PRESIGN_TTL_SEC)))
      const concatResp = await env.FFMPEG.fetch(`https://ffmpeg.neolog.internal${concatPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input_urls: segmentUrls }),
      })
      if (!concatResp.ok) {
        const errBody = (await concatResp.text()).slice(0, 500)
        return NextResponse.json({ error: `FFmpeg concat failed: ${errBody}` }, { status: 502 })
      }
      finalBytes = new Uint8Array(await concatResp.arrayBuffer())
    } finally {
      await Promise.all(segmentKeys.map(k => deleteObject(env, k).catch(() => {})))
    }
  }

  const outputKey = `${operator.id}/vlog-edits/${vlog.id}.${ext}`
  try {
    await putObject(env, outputKey, finalBytes, { httpMetadata: { contentType } })
  } catch (err: any) {
    return NextResponse.json({ error: `R2 upload failed: ${err?.message || String(err)}` }, { status: 500 })
  }

  const durationSec = kept.reduce((sum, s) => sum + (s.end_sec - s.start_sec), 0)
  const cutSecondsTotal = cutRanges.reduce(
    (sum, c) => sum + Math.max(0, words[c.end_word_index].end_time - words[c.start_word_index].start_time), 0,
  )
  const outputMetadata = JSON.stringify({
    kept_ranges: kept,
    cut_ranges: cutRanges,
    cut_count: cutRanges.length,
    cut_seconds_total: cutSecondsTotal,
    source_vlog_id: vlog.id,
    duration_sec: durationSec,
    mime: contentType,
  })

  let productionId: string
  if (existing) {
    productionId = existing.id
    await run(
      db,
      `UPDATE productions SET production_type='coherent_edit', state='produced',
          output_r2_key = ?, output_metadata = ?, produced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      outputKey, outputMetadata, productionId,
    )
  } else {
    productionId = ulid()
    await run(
      db,
      `INSERT INTO productions (
          id, operator_id, production_type, source_kind, source_id, state,
          output_r2_key, output_metadata, prompt_version, tier, produced_at
       ) VALUES (?, ?, 'coherent_edit', 'vlog', ?, 'produced', ?, ?, 'coherent-edit-v1', 'lo_fi', CURRENT_TIMESTAMP)`,
      productionId, operator.id, vlog.id, outputKey, outputMetadata,
    )
  }

  let url: string | null = null
  try { url = await presignGetUrl(env, outputKey, PRESIGN_TTL_SEC) } catch {}

  return NextResponse.json({
    production_id: productionId, output_url: url, duration_sec: durationSec, cached: false,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
