/**
 * POST /api/v2/admin/transcode-backfill
 *
 * Fans a transcode-only re-run out to the pipeline DOs for every vlog that
 * still has no H.264 (transcoded_r2_key IS NULL). Uses the new 'transcode'
 * step added to VlogPipelineDO — /reextract with pointer='transcode' runs
 * ONLY that step, async + durable + retry-backed + concurrency-gated, with
 * no edge-function timeout (unlike the synchronous /transcode-one).
 *
 * Dispatch is fast (just sets DO alarms); the transcodes happen in the
 * background. Watch progress via /api/v2/admin/runtime-state has_transcoded.
 *
 * Body (all optional):
 *   { max_size_mb?: number = 1500,   // skip files larger than this (>4GB can't be whole-fetched by ffmpeg)
 *     limit?: number = 400 }         // cap dispatches this call
 *
 * Idempotent: the transcode step skips vlogs that already have the artifact.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

export const runtime = 'edge'

interface Env {
  DB: D1Database
  HEARTBEAT_TOKEN?: string
  PIPELINE?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  [k: string]: unknown
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }

  if (!env.PIPELINE || !env.HEARTBEAT_TOKEN) {
    return NextResponse.json({ error: 'PIPELINE binding or HEARTBEAT_TOKEN missing' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({})) as { max_size_mb?: number; limit?: number }
  const maxSizeMb = typeof body.max_size_mb === 'number' ? body.max_size_mb : 1500
  const limit = Math.min(Math.max(1, body.limit ?? 400), 400)
  const maxBytes = maxSizeMb * 1_000_000

  const db = getDb(env)
  const rows = await findMany<{ id: string; file_size_bytes: number | null }>(
    db,
    `SELECT id, file_size_bytes
       FROM vlogs
      WHERE operator_id = ?
        AND deleted_at IS NULL
        AND transcoded_r2_key IS NULL
        AND mime_type LIKE 'video/%'
      ORDER BY file_size_bytes ASC
      LIMIT ?`,
    operator.id, limit,
  )

  const PIPELINE = env.PIPELINE
  const HEARTBEAT = env.HEARTBEAT_TOKEN

  const candidates = rows.filter(v => v.file_size_bytes == null || v.file_size_bytes <= maxBytes)
  const oversized = rows.length - candidates.length

  let dispatched = 0
  let failed = 0
  const errors: string[] = []

  // Dispatch in PARALLEL chunks. Each reextract POST returns fast
  // ('scheduled'), but 400 sequential awaits blew the edge timeout (524).
  // Chunks of 25 keep concurrency sane against the DO namespace.
  const CHUNK = 25
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const slice = candidates.slice(i, i + CHUNK)
    const results = await Promise.allSettled(slice.map(v =>
      PIPELINE.fetch(`https://internal/reextract/${v.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Heartbeat-Token': HEARTBEAT },
        body: JSON.stringify({ vlog_id: v.id, operator_id: operator.id, pointer: 'transcode', force: false }),
      }).then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 100)}`)
        return true
      }),
    ))
    for (let j = 0; j < results.length; j++) {
      const r = results[j]
      if (r.status === 'fulfilled') dispatched += 1
      else { failed += 1; if (errors.length < 5) errors.push(`${slice[j].id}: ${r.reason?.message || r.reason}`) }
    }
  }

  return NextResponse.json({
    ok: true,
    matched: rows.length,
    dispatched,
    oversized_skipped: oversized,
    dispatch_failed: failed,
    errors,
    note: 'Transcodes run async in the pipeline DOs. Poll runtime-state.has_transcoded for progress.',
  }, { headers: { 'Cache-Control': 'no-store' } })
}
