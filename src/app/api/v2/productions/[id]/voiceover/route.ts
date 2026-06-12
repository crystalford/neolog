/**
 * POST /api/v2/productions/[id]/voiceover
 *
 * Stitches all per-beat audio takes (production_beats.audio_r2_key)
 * into a single voiceover MP3 in beat-index order. Calls the FFmpeg
 * /concat-audio route, uploads the result to R2, stores the key on
 * productions.output_r2_key (or a dedicated voiceover_r2_key — for
 * now we reuse output_r2_key since the production_type='video_essay'
 * doesn't otherwise use it until the full render).
 *
 * Body: empty.
 * Response: { url, r2_key, duration_estimate, beat_count }
 *
 * Errors:
 *   - 400 if not a video_essay
 *   - 400 if zero beats have audio
 *   - 502 if FFmpeg or R2 fails
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

  const db = getDb(env)
  const prod = await findOne<{ id: string; production_type: string }>(
    db,
    `SELECT id, production_type FROM productions
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!prod) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (prod.production_type !== 'video_essay') {
    return NextResponse.json({ error: 'Voiceover stitch only applies to video_essay productions' }, { status: 400 })
  }

  const beats = await findMany<{
    id: string; beat_index: number; audio_r2_key: string | null
    synth_audio_r2_key: string | null; beat_text: string
  }>(
    db,
    `SELECT id, beat_index, audio_r2_key, synth_audio_r2_key, beat_text
       FROM production_beats
      WHERE production_id = ?
      ORDER BY beat_index ASC`,
    params.id,
  )
  // For each beat, prefer the operator's recorded take; fall back to the
  // synthesized take. Mixed productions (some recorded, some synthesized)
  // stitch identically. Beats with neither source get skipped from the
  // missing-count below.
  const usable = beats.map(b => ({
    ...b,
    chosen_r2_key: b.audio_r2_key || b.synth_audio_r2_key,
    source: b.audio_r2_key ? 'recorded' : b.synth_audio_r2_key ? 'synth' : null,
  }))
  const ready = usable.filter(b => !!b.chosen_r2_key)
  if (ready.length === 0) {
    return NextResponse.json({
      error: 'No beats have audio yet — record or synthesize at least one before stitching',
    }, { status: 400 })
  }
  if (ready.length < beats.length) {
    const missing = beats.length - ready.length
    return NextResponse.json({
      error: `${missing} beat${missing === 1 ? '' : 's'} ${missing === 1 ? 'has' : 'have'} no audio yet. Record or synthesize them first.`,
    }, { status: 400 })
  }

  if (!env.FFMPEG) {
    return NextResponse.json({ error: 'FFmpeg binding not available' }, { status: 503 })
  }

  // Presign each beat's R2 audio for the FFmpeg container to fetch.
  const inputUrls: string[] = []
  for (const b of ready) {
    try {
      const url = await presignGetUrl(env, b.chosen_r2_key!, 1800)
      inputUrls.push(url)
    } catch (err: any) {
      return NextResponse.json({ error: `Presign failed for beat ${b.beat_index}: ${err?.message || err}` }, { status: 500 })
    }
  }

  let stitchedBytes: Uint8Array
  try {
    const ffResp = await env.FFMPEG.fetch('https://ffmpeg.neolog.internal/concat-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input_urls: inputUrls }),
    })
    if (!ffResp.ok) {
      const txt = (await ffResp.text()).slice(0, 500)
      return NextResponse.json({ error: `FFmpeg concat failed: ${txt}` }, { status: 502 })
    }
    stitchedBytes = new Uint8Array(await ffResp.arrayBuffer())
  } catch (err: any) {
    return NextResponse.json({ error: `FFmpeg call failed: ${err?.message || String(err)}` }, { status: 502 })
  }

  const r2Key = `${operator.id}/voiceovers/${params.id}.mp3`
  try {
    await putObject(env, r2Key, stitchedBytes, { httpMetadata: { contentType: 'audio/mpeg' } })
  } catch (err: any) {
    return NextResponse.json({ error: `R2 upload failed: ${err?.message || String(err)}` }, { status: 500 })
  }

  // Save the key on output_r2_key. output_metadata gets a marker so
  // the production page knows this is a voiceover (vs final render).
  const meta = JSON.stringify({
    kind: 'voiceover',
    beat_count: recorded.length,
    mime: 'audio/mpeg',
    stitched_at: new Date().toISOString(),
  })
  await db.prepare(
    `UPDATE productions
        SET output_r2_key = ?, output_metadata = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ?`,
  ).bind(r2Key, meta, params.id, operator.id).run()

  const url = await presignGetUrl(env, r2Key, 4 * 3600)
  return NextResponse.json({
    url, r2_key: r2Key,
    beat_count: recorded.length,
    bytes: stitchedBytes.length,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
