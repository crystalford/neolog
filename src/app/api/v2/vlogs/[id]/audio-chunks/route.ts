/**
 * PUT /api/v2/vlogs/[id]/audio-chunks
 *
 * Persist a browser-extracted audio-chunks manifest onto an existing vlog
 * row and (optionally) re-trigger the post-upload workflow so the
 * transcribe step picks the new chunks up.
 *
 * Body: { audio_chunks_json: [{r2_key, start_sec, end_sec, bytes}], reprocess?: boolean }
 *
 * Used by the /uploads "Extract audio in browser" backfill path. Validates
 * that each chunk's r2_key lives under this operator's prefix (no
 * cross-operator data injection).
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  PROCESS_UPLOAD?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  PIPELINE?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  HEARTBEAT_TOKEN?: string
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try {
    operator = await requireOperator(req, env)
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }

  const { id: vlog_id } = await ctx.params
  if (!vlog_id) {
    return NextResponse.json({ error: 'vlog id required' }, { status: 400 })
  }

  const body = await req.json().catch(() => null) as
    | {
        audio_chunks_json?: Array<{ r2_key: string; start_sec: number; end_sec: number; bytes: number }>
        reprocess?: boolean
      }
    | null

  if (!body || !Array.isArray(body.audio_chunks_json) || body.audio_chunks_json.length === 0) {
    return NextResponse.json({ error: 'audio_chunks_json array required' }, { status: 400 })
  }

  const ok = body.audio_chunks_json.every(c =>
    typeof c?.r2_key === 'string' &&
    c.r2_key.startsWith(`${operator.id}/`) &&
    typeof c.start_sec === 'number' &&
    typeof c.end_sec === 'number' &&
    typeof c.bytes === 'number',
  )
  if (!ok) {
    return NextResponse.json({ error: 'invalid chunk shape or cross-operator key' }, { status: 400 })
  }

  const db = getDb(env)
  const row = await findOne<{ id: string }>(
    db,
    `SELECT id FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    vlog_id, operator.id,
  )
  if (!row) {
    return NextResponse.json({ error: 'vlog not found' }, { status: 404 })
  }

  await run(
    db,
    `UPDATE vlogs SET audio_chunks_json = ?, transcript_text = NULL,
                       transcript_completed_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    JSON.stringify(body.audio_chunks_json),
    vlog_id,
  )

  let dispatched = false
  if (body.reprocess !== false) {
    if (env.PIPELINE && env.HEARTBEAT_TOKEN) {
      try {
        const res = await env.PIPELINE.fetch(`https://internal/start/${vlog_id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Heartbeat-Token': env.HEARTBEAT_TOKEN,
          },
          body: JSON.stringify({ operator_id: operator.id, mode: 'auto' }),
        })
        dispatched = res.ok
      } catch { dispatched = false }
    } else if (env.PROCESS_UPLOAD) {
      try {
        const res = await env.PROCESS_UPLOAD.fetch('https://internal/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vlog_id, operator_id: operator.id }),
        })
        dispatched = res.ok
      } catch { dispatched = false }
    }
  }

  return NextResponse.json({ ok: true, chunks: body.audio_chunks_json.length, dispatched })
}
