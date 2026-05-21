/**
 * PUT /api/v2/productions/[id]/beats/[beatId]/audio
 *
 * Operator records a voiceover take in-browser (MediaRecorder),
 * uploads the resulting webm/mp4 blob here. Server:
 *   1. Validates the beat belongs to an operator-owned production.
 *   2. Writes the audio bytes to R2 at
 *      {operator}/production-beats/{production_id}/{beat_id}_t{N}.webm
 *      where N = take_number after increment.
 *   3. Updates production_beats: audio_r2_key, take_number,
 *      recorded_at, updated_at.
 *
 * Body: raw audio blob (Content-Type: audio/webm or audio/mp4).
 *
 * DELETE clears the recording (sets audio_r2_key=NULL, recorded_at=NULL).
 * The R2 bytes are left in place for now (cheap; retake history).
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { putObject, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; beatId: string } },
) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const db = getDb(env)
  // Verify beat belongs to a production owned by this operator.
  const beat = await findOne<{ id: string; take_number: number }>(
    db,
    `SELECT pb.id, pb.take_number
       FROM production_beats pb
       JOIN productions p ON p.id = pb.production_id
      WHERE pb.id = ? AND pb.production_id = ?
        AND p.operator_id = ? AND p.deleted_at IS NULL`,
    params.beatId, params.id, operator.id,
  )
  if (!beat) return NextResponse.json({ error: 'Beat not found' }, { status: 404 })

  const ct = req.headers.get('content-type') || 'audio/webm'
  const ext = ct.includes('mp4') ? 'mp4' : ct.includes('mpeg') ? 'mp3' : 'webm'
  const bytes = new Uint8Array(await req.arrayBuffer())
  if (bytes.length === 0) return NextResponse.json({ error: 'Empty body' }, { status: 400 })
  if (bytes.length > 200 * 1024 * 1024) return NextResponse.json({ error: 'Audio too large (>200MB)' }, { status: 413 })

  const takeN = beat.take_number + 1
  const r2Key = `${operator.id}/production-beats/${params.id}/${params.beatId}_t${takeN}.${ext}`

  try {
    await putObject(env, r2Key, bytes, { httpMetadata: { contentType: ct } })
  } catch (err: any) {
    return NextResponse.json({ error: `R2 upload failed: ${err?.message || String(err)}` }, { status: 500 })
  }

  await db.prepare(
    `UPDATE production_beats
        SET audio_r2_key = ?, take_number = ?,
            recorded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
  ).bind(r2Key, takeN, params.beatId).run()

  return NextResponse.json({ ok: true, audio_r2_key: r2Key, take_number: takeN })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; beatId: string } },
) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const db = getDb(env)
  const beat = await findOne<{ id: string }>(
    db,
    `SELECT pb.id
       FROM production_beats pb
       JOIN productions p ON p.id = pb.production_id
      WHERE pb.id = ? AND pb.production_id = ?
        AND p.operator_id = ? AND p.deleted_at IS NULL`,
    params.beatId, params.id, operator.id,
  )
  if (!beat) return NextResponse.json({ error: 'Beat not found' }, { status: 404 })

  await db.prepare(
    `UPDATE production_beats
        SET audio_r2_key = NULL, recorded_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
  ).bind(params.beatId).run()

  return NextResponse.json({ ok: true })
}
