/**
 * GET /api/v2/admin/runtime-state
 *
 * The single source of truth for "what's actually happening in the system."
 * Reads pipeline_events (full untruncated error text), recent extraction_runs,
 * recent vlog status, and FFmpeg container health. Everything in one shot.
 *
 * Read-only. No mutations. Polling-safe. Designed so a debugger (operator or
 * Claude) can answer "what just failed and why" in one request, without
 * writing a new diagnostic endpoint each time.
 *
 * Query params:
 *   - limit_events: default 100, max 500
 *   - status: filter pipeline_events by status (started|ok|failed|skipped)
 *   - step: filter pipeline_events by step name (substring match)
 *   - vlog_id: scope everything to one vlog
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database, Fetcher } from '@cloudflare/workers-types'

export const runtime = 'edge'

interface Env {
  DB: D1Database
  FFMPEG: Fetcher
  [k: string]: unknown
}

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit_events') || '100', 10) || 100, 500)
  const statusFilter = url.searchParams.get('status')
  const stepFilter = url.searchParams.get('step')
  const vlogFilter = url.searchParams.get('vlog_id')

  const db = getDb(env)

  // ── Recent pipeline_events with FULL untruncated error text ────────────
  const eventWhere: string[] = ['operator_id = ?']
  const eventBinds: unknown[] = [operator.id]
  if (statusFilter) { eventWhere.push('status = ?'); eventBinds.push(statusFilter) }
  if (stepFilter)   { eventWhere.push("step LIKE ?"); eventBinds.push(`%${stepFilter}%`) }
  if (vlogFilter)   { eventWhere.push('vlog_id = ?'); eventBinds.push(vlogFilter) }
  eventBinds.push(limit)

  const events = await findMany<{
    id: string
    vlog_id: string
    step: string
    sub_step: string | null
    status: string
    runtime: string | null
    worker_version: string | null
    request_id: string | null
    started_at: string
    completed_at: string | null
    duration_ms: number | null
    error_full_text: string | null
    detail_json: string | null
    attempt: number
  }>(
    db,
    `SELECT id, vlog_id, step, sub_step, status, runtime, worker_version,
            request_id, started_at, completed_at, duration_ms,
            error_full_text, detail_json, attempt
       FROM pipeline_events
      WHERE ${eventWhere.join(' AND ')}
      ORDER BY started_at DESC
      LIMIT ?`,
    ...eventBinds,
  )

  // ── Aggregate: events by step + status (last 24h) ──────────────────────
  const byStepStatus = await findMany<{ step: string; status: string; n: number }>(
    db,
    `SELECT step, status, COUNT(*) AS n
       FROM pipeline_events
      WHERE operator_id = ?
        AND started_at >= datetime('now', '-24 hours')
      GROUP BY step, status
      ORDER BY step ASC, status ASC`,
    operator.id,
  )

  // ── Aggregate: vlogs by pipeline_status, transcode/thumb coverage ──────
  const vlogAgg = await findOne<{
    total: number
    complete: number
    failed: number
    processing: number
    archived: number
    has_transcoded: number
    has_thumb: number
  }>(
    db,
    `SELECT
       COUNT(*)                                                 AS total,
       SUM(CASE WHEN pipeline_status = 'complete' THEN 1 ELSE 0 END) AS complete,
       SUM(CASE WHEN pipeline_status = 'failed'   THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN pipeline_status NOT IN ('complete','failed','archived') THEN 1 ELSE 0 END) AS processing,
       SUM(CASE WHEN pipeline_status = 'archived' THEN 1 ELSE 0 END) AS archived,
       SUM(CASE WHEN transcoded_r2_key IS NOT NULL THEN 1 ELSE 0 END) AS has_transcoded,
       SUM(CASE WHEN thumbnail_r2_key IS NOT NULL OR thumbnail_url IS NOT NULL THEN 1 ELSE 0 END) AS has_thumb
     FROM vlogs
    WHERE operator_id = ? AND deleted_at IS NULL`,
    operator.id,
  )

  // ── Recent failed vlogs with their last error ──────────────────────────
  const recentFailures = await findMany<{
    vlog_id: string
    original_filename: string | null
    step: string
    error_full_text: string | null
    started_at: string
  }>(
    db,
    `SELECT pe.vlog_id, v.original_filename, pe.step, pe.error_full_text, pe.started_at
       FROM pipeline_events pe
       JOIN vlogs v ON v.id = pe.vlog_id
      WHERE pe.operator_id = ? AND pe.status = 'failed'
        AND v.deleted_at IS NULL
      ORDER BY pe.started_at DESC
      LIMIT 30`,
    operator.id,
  )

  // ── FFmpeg container health: cheap probe ───────────────────────────────
  let ffmpegHealth: { ok: boolean; status?: number; latency_ms?: number; error?: string } = { ok: false }
  if (env.FFMPEG && typeof env.FFMPEG.fetch === 'function') {
    const t0 = Date.now()
    try {
      const r = await env.FFMPEG.fetch('https://ffmpeg.neolog.internal/health', { method: 'GET' }) as unknown as Response
      ffmpegHealth = { ok: r.ok, status: r.status, latency_ms: Date.now() - t0 }
      if (!r.ok) {
        const body = await r.text().catch(() => '<unreadable>')
        ffmpegHealth.error = body.slice(0, 500)
      }
    } catch (err: any) {
      ffmpegHealth = { ok: false, error: err?.message || String(err), latency_ms: Date.now() - t0 }
    }
  } else {
    ffmpegHealth = { ok: false, error: 'FFMPEG binding not present' }
  }

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    operator_id: operator.id,
    filters: { limit, status: statusFilter, step: stepFilter, vlog_id: vlogFilter },
    aggregates: {
      vlogs: vlogAgg ?? { total: 0, complete: 0, failed: 0, processing: 0, archived: 0, has_transcoded: 0, has_thumb: 0 },
      events_by_step_status_24h: byStepStatus,
    },
    ffmpeg: ffmpegHealth,
    recent_failures: recentFailures,
    events,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
