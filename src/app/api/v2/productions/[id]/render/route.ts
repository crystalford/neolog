/**
 * POST /api/v2/productions/[id]/render
 *
 * Render final MP4 for a video_essay production. Combines the
 * stitched voiceover MP3 (output_r2_key when output_metadata.kind ===
 * 'voiceover') with N b-roll vlog clips in order. Final clip trims
 * to whichever ends first (voiceover or concatenated b-roll).
 *
 * Body: { broll_vlog_ids: string[] }
 * Response: { url, r2_key, bytes }
 *
 * Requires:
 *   - production_type === 'video_essay'
 *   - output_r2_key set to a voiceover MP3 (call /voiceover first)
 *   - broll_vlog_ids: array of vlog ids the operator owns
 *
 * Saves the rendered MP4 to {operator}/renders/{production_id}.mp4
 * and replaces output_r2_key + output_metadata.kind='final_render'
 * (the voiceover stays in R2 at its old key, just unreferenced from
 * the production row — re-stitch to recover it).
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
import { presignGetUrl, putObject, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  FFMPEG?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const body = await req.json().catch(() => ({})) as { broll_vlog_ids?: string[] }
  const brollIds = (body.broll_vlog_ids || []).filter(Boolean)
  if (brollIds.length === 0) {
    return NextResponse.json({ error: 'broll_vlog_ids (non-empty array) required' }, { status: 400 })
  }
  if (brollIds.length > 30) {
    return NextResponse.json({ error: 'Cap is 30 broll clips per render' }, { status: 400 })
  }

  const db = getDb(env)
  const prod = await findOne<{
    id: string; production_type: string; output_r2_key: string | null; output_metadata: string | null
  }>(
    db,
    `SELECT id, production_type, output_r2_key, output_metadata
       FROM productions
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!prod) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (prod.production_type !== 'video_essay') {
    return NextResponse.json({ error: 'Render only applies to video_essay productions' }, { status: 400 })
  }
  if (!prod.output_r2_key) {
    return NextResponse.json({ error: 'No voiceover yet. Stitch one first via /voiceover.' }, { status: 400 })
  }

  let isVoiceover = false
  try {
    const meta = JSON.parse(prod.output_metadata || '{}')
    isVoiceover = meta?.kind === 'voiceover'
  } catch {}
  if (!isVoiceover) {
    return NextResponse.json({ error: 'output_r2_key is not a voiceover. Re-stitch the voiceover before rendering.' }, { status: 400 })
  }
  const voiceoverKey = prod.output_r2_key

  // Validate operator owns each b-roll vlog + collect playback keys.
  const placeholders = brollIds.map(() => '?').join(',')
  const brollRows = await findMany<{ id: string; r2_key: string; transcoded_r2_key: string | null }>(
    db,
    `SELECT id, r2_key, transcoded_r2_key
       FROM vlogs
      WHERE id IN (${placeholders}) AND operator_id = ? AND deleted_at IS NULL`,
    ...brollIds, operator.id,
  )
  if (brollRows.length !== brollIds.length) {
    return NextResponse.json({
      error: `Found ${brollRows.length}/${brollIds.length} of the requested b-roll vlogs. Some may be deleted or not yours.`,
    }, { status: 400 })
  }
  // Preserve operator's specified order.
  const byId = new Map(brollRows.map(r => [r.id, r]))
  const ordered = brollIds.map(id => byId.get(id)!).filter(Boolean)

  if (!env.FFMPEG) {
    return NextResponse.json({ error: 'FFmpeg binding not available' }, { status: 503 })
  }

  // Presign everything for the FFmpeg worker.
  let voiceoverUrl: string
  try { voiceoverUrl = await presignGetUrl(env, voiceoverKey, 1800) }
  catch (err: any) { return NextResponse.json({ error: `Voiceover presign failed: ${err?.message}` }, { status: 500 }) }

  const brollUrls: string[] = []
  for (const b of ordered) {
    const key = b.transcoded_r2_key || b.r2_key
    try { brollUrls.push(await presignGetUrl(env, key, 1800)) }
    catch (err: any) {
      return NextResponse.json({ error: `Broll presign failed for ${b.id}: ${err?.message}` }, { status: 500 })
    }
  }

  let renderedBytes: Uint8Array
  try {
    const ffResp = await env.FFMPEG.fetch('https://ffmpeg.neolog.internal/render-video-essay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voiceover_url: voiceoverUrl, broll_urls: brollUrls }),
    })
    if (!ffResp.ok) {
      const txt = (await ffResp.text()).slice(0, 500)
      return NextResponse.json({ error: `FFmpeg render failed: ${txt}` }, { status: 502 })
    }
    renderedBytes = new Uint8Array(await ffResp.arrayBuffer())
  } catch (err: any) {
    return NextResponse.json({ error: `FFmpeg call failed: ${err?.message || String(err)}` }, { status: 502 })
  }

  const r2Key = `${operator.id}/renders/${params.id}.mp4`
  try {
    await putObject(env, r2Key, renderedBytes, { httpMetadata: { contentType: 'video/mp4' } })
  } catch (err: any) {
    return NextResponse.json({ error: `R2 upload failed: ${err?.message || String(err)}` }, { status: 500 })
  }

  const meta = JSON.stringify({
    kind: 'final_render',
    voiceover_r2_key: voiceoverKey,
    broll_vlog_ids: brollIds,
    mime: 'video/mp4',
    rendered_at: new Date().toISOString(),
  })
  await db.prepare(
    `UPDATE productions
        SET output_r2_key = ?, output_metadata = ?,
            state = 'produced', state_changed_at = CURRENT_TIMESTAMP,
            produced_at = COALESCE(produced_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ?`,
  ).bind(r2Key, meta, params.id, operator.id).run()

  const url = await presignGetUrl(env, r2Key, 4 * 3600)
  return NextResponse.json({
    url, r2_key: r2Key, bytes: renderedBytes.length, broll_count: brollIds.length,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
