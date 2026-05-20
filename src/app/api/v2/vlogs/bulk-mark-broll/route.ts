/**
 * POST /api/v2/vlogs/bulk-mark-broll
 *
 * Body: { ids: string[] }
 *
 * Bulk version of POST /api/v2/vlogs/[id]/mark-broll. For each id:
 *   - kills any in-flight pipeline DO alarm (best-effort)
 *   - marks prior extraction_runs inactive
 *   - inserts a manual-broll-skip run with total_items=0
 *   - sets vlog pipeline_status='complete', clears errors
 *   - records a pipeline_events row
 *
 * Operator workflow this enables: filter /vlogs to a category that's
 * mostly silent footage (DJI slow-mo b-roll, timelapses) → select all
 * → mark them as b-roll in one POST instead of opening each vlog.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { ulid } from '@/lib/ulid'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  PIPELINE?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  HEARTBEAT_TOKEN?: string
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  let body: { ids?: unknown }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : []
  if (ids.length === 0) return NextResponse.json({ error: 'no ids provided' }, { status: 400 })
  if (ids.length > 500) return NextResponse.json({ error: 'max 500 ids per request' }, { status: 400 })

  const db = getDb(env)

  // Verify ownership in one query.
  const placeholders = ids.map(() => '?').join(',')
  const rows = await db.prepare(
    `SELECT id FROM vlogs
      WHERE operator_id = ? AND deleted_at IS NULL
        AND id IN (${placeholders})`,
  ).bind(operator.id, ...ids).all<{ id: string }>()
  const owned = (rows.results ?? []).map(r => r.id)
  if (owned.length === 0) return NextResponse.json({ ok: true, marked: 0, skipped: ids.length })

  let marked = 0
  const failures: Record<string, string> = {}
  for (const vlog_id of owned) {
    try {
      // Kill any in-flight pipeline DO alarm so it doesn't immediately
      // re-process the vlog after we mark it.
      if (env.PIPELINE && env.HEARTBEAT_TOKEN) {
        try {
          await env.PIPELINE.fetch(`https://internal/kill/${vlog_id}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Heartbeat-Token': env.HEARTBEAT_TOKEN,
            },
            body: JSON.stringify({ operator_id: operator.id }),
          })
        } catch {}
      }

      await db.prepare(
        `UPDATE extraction_runs SET is_active = 0 WHERE vlog_id = ? AND is_active = 1`,
      ).bind(vlog_id).run()

      const run_id = ulid()
      await db.prepare(
        `INSERT INTO extraction_runs
           (id, vlog_id, operator_id, model, escalated_from, mode, r2_key,
            total_items, invalid_items, fail_rate, is_active, created_at)
         VALUES (?, ?, ?, 'manual-broll-skip', NULL, 'cheap', '', 0, 0, 0, 1, ?)`,
      ).bind(run_id, vlog_id, operator.id, Date.now()).run()

      await db.prepare(
        `UPDATE vlogs
            SET pipeline_status = 'complete',
                pipeline_error = NULL,
                state = 'ready',
                state_error = NULL,
                extraction_outcomes = NULL,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND operator_id = ?`,
      ).bind(vlog_id, operator.id).run()

      try {
        await db.prepare(
          `INSERT INTO pipeline_events
             (id, vlog_id, operator_id, step, sub_step, status, started_at, completed_at, detail_json, attempt, ts)
           VALUES (?, ?, ?, 'extract', 'manual_broll', 'ok',
                   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, 1, ?)`,
        ).bind(
          ulid(), vlog_id, operator.id,
          JSON.stringify({ state: 'skipped', reason: 'manual_broll_marker_bulk', by: operator.id }),
          Date.now(),
        ).run()
      } catch {}

      marked++
    } catch (err: any) {
      failures[vlog_id] = err?.message || String(err)
    }
  }

  return NextResponse.json({
    ok: true,
    requested: ids.length,
    marked,
    skipped: ids.length - owned.length,
    failures: Object.keys(failures).length ? failures : undefined,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
