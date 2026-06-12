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

  const body = await req.json().catch(() => ({})) as {
    broll_vlog_ids?: string[]
    use_ai_broll?: boolean
  }
  const useAiBroll = body.use_ai_broll === true
  const brollIds = (body.broll_vlog_ids || []).filter(Boolean)
  if (!useAiBroll && brollIds.length === 0) {
    return NextResponse.json({ error: 'either use_ai_broll=true or broll_vlog_ids (non-empty) required' }, { status: 400 })
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

  // Source the b-roll keys either from the operator's vlog archive (legacy
  // path) or from the per-beat AI clips written by /broll (new path).
  type BrollSource = { key: string; label: string }
  let ordered: BrollSource[] = []
  if (useAiBroll) {
    const beatRows = await findMany<{ beat_index: number; broll_video_r2_key: string | null }>(
      db,
      `SELECT beat_index, broll_video_r2_key
         FROM production_beats
        WHERE production_id = ?
        ORDER BY beat_index ASC`,
      params.id,
    )
    const haveVideo = beatRows.filter(b => !!b.broll_video_r2_key)
    if (haveVideo.length === 0) {
      return NextResponse.json({
        error: 'No AI b-roll clips yet. POST /api/v2/productions/[id]/broll first.',
      }, { status: 400 })
    }
    ordered = haveVideo.map(b => ({ key: b.broll_video_r2_key!, label: `beat ${b.beat_index}` }))
  } else {
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
    const byId = new Map(brollRows.map(r => [r.id, r]))
    ordered = brollIds.map(id => {
      const r = byId.get(id)!
      return { key: r.transcoded_r2_key || r.r2_key, label: id }
    }).filter(Boolean)
  }

  if (!env.FFMPEG) {
    return NextResponse.json({ error: 'FFmpeg binding not available' }, { status: 503 })
  }

  // Render heartbeat: write substep status to productions.render_status so
  // the page poll can show "Presigning → FFmpeg → Uploading" instead of a
  // five-minute silent spinner. Best-effort writes; never fail the render
  // for a heartbeat write.
  const setStatus = async (status: string) => {
    try {
      await db.prepare(
        `UPDATE productions SET render_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND operator_id = ?`,
      ).bind(status, params.id, operator.id).run()
    } catch {}
  }
  try {
    await db.prepare(
      `UPDATE productions SET render_started_at = CURRENT_TIMESTAMP WHERE id = ? AND operator_id = ?`,
    ).bind(params.id, operator.id).run()
  } catch {}

  await setStatus(`presigning · ${ordered.length} clips`)
  let voiceoverUrl: string
  try { voiceoverUrl = await presignGetUrl(env, voiceoverKey, 1800) }
  catch (err: any) {
    await setStatus(`failed: voiceover presign — ${err?.message || err}`)
    return NextResponse.json({ error: `Voiceover presign failed: ${err?.message}` }, { status: 500 })
  }

  const brollUrls: string[] = []
  for (const b of ordered) {
    try { brollUrls.push(await presignGetUrl(env, b.key, 1800)) }
    catch (err: any) {
      await setStatus(`failed: broll presign — ${err?.message || err}`)
      return NextResponse.json({ error: `Broll presign failed for ${b.label}: ${err?.message}` }, { status: 500 })
    }
  }

  await setStatus(`ffmpeg rendering · ${ordered.length} clips + voiceover`)
  let renderedBytes: Uint8Array
  try {
    const ffResp = await env.FFMPEG.fetch('https://ffmpeg.neolog.internal/render-video-essay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voiceover_url: voiceoverUrl, broll_urls: brollUrls }),
    })
    if (!ffResp.ok) {
      const txt = (await ffResp.text()).slice(0, 500)
      await setStatus(`failed: ffmpeg ${ffResp.status}`)
      return NextResponse.json({ error: `FFmpeg render failed: ${txt}` }, { status: 502 })
    }
    renderedBytes = new Uint8Array(await ffResp.arrayBuffer())
  } catch (err: any) {
    await setStatus(`failed: ffmpeg — ${err?.message || err}`)
    return NextResponse.json({ error: `FFmpeg call failed: ${err?.message || String(err)}` }, { status: 502 })
  }

  await setStatus(`uploading · ${(renderedBytes.byteLength / 1_000_000).toFixed(1)} MB`)
  const r2Key = `${operator.id}/renders/${params.id}.mp4`
  try {
    await putObject(env, r2Key, renderedBytes, { httpMetadata: { contentType: 'video/mp4' } })
  } catch (err: any) {
    await setStatus(`failed: r2 upload — ${err?.message || err}`)
    return NextResponse.json({ error: `R2 upload failed: ${err?.message || String(err)}` }, { status: 500 })
  }
  await setStatus(`done · ${(renderedBytes.byteLength / 1_000_000).toFixed(1)} MB`)

  const meta = JSON.stringify({
    kind: 'final_render',
    voiceover_r2_key: voiceoverKey,
    broll_source: useAiBroll ? 'ai_broll' : 'vlog_archive',
    broll_vlog_ids: useAiBroll ? [] : brollIds,
    broll_count: ordered.length,
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
