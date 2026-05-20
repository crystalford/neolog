/**
 * POST /api/v2/vlogs/[id]/mark-broll
 *
 * Manual operator override: declare a vlog as b-roll. Used when the
 * operator KNOWS a vlog has no extractable dialogue (silent cinematic
 * footage, ambient takes, time-lapse, slow-mo b-roll) and doesn't want
 * the system to keep retrying.
 *
 * Effects:
 *   - pipeline_status → 'complete'
 *   - pipeline_error → NULL
 *   - inserts an active extraction_runs row with
 *     model='manual-broll-skip' and total_items=0, so the diagnostic
 *     classifies the vlog as b_roll
 *   - records a pipeline_events row with sub_step='manual_broll'
 *   - clears any pending DO alarm via the kill route (best-effort)
 *
 * This is reversible: if the operator changes their mind, they can
 * click "Reset" on the vlog detail page and re-extract normally.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { ulid } from '@/lib/ulid'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  PIPELINE?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  HEARTBEAT_TOKEN?: string
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const { id: vlog_id } = await ctx.params
  if (!vlog_id) return NextResponse.json({ error: 'vlog id required' }, { status: 400 })

  const db = getDb(env)
  const owned = await findOne<{ id: string }>(
    db,
    `SELECT id FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    vlog_id, operator.id,
  )
  if (!owned) return NextResponse.json({ error: 'not found' }, { status: 404 })

  try {
    // Best-effort: stop any in-flight DO alarm so the pipeline doesn't
    // immediately try to re-process the vlog after we mark it.
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

    // Mark old extraction_runs inactive; insert the manual-skip marker.
    await run(
      db,
      `UPDATE extraction_runs SET is_active = 0 WHERE vlog_id = ? AND is_active = 1`,
      vlog_id,
    )
    const run_id = ulid()
    await run(
      db,
      `INSERT INTO extraction_runs
         (id, vlog_id, operator_id, model, escalated_from, mode, r2_key,
          total_items, invalid_items, fail_rate, is_active, created_at)
       VALUES (?, ?, ?, 'manual-broll-skip', NULL, 'cheap', '', 0, 0, 0, 1, ?)`,
      run_id, vlog_id, operator.id, Date.now(),
    )

    // Update vlog row to a clean complete state.
    await run(
      db,
      `UPDATE vlogs
          SET pipeline_status = 'complete',
              pipeline_error = NULL,
              state = 'ready',
              state_error = NULL,
              extraction_outcomes = NULL,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND operator_id = ?`,
      vlog_id, operator.id,
    )

    // Record the action in pipeline_events so the operator can see it
    // in the live log + the diagnosis banner picks it up.
    try {
      await run(
        db,
        `INSERT INTO pipeline_events
           (id, vlog_id, operator_id, step, sub_step, status, started_at, completed_at, detail_json, attempt, ts)
         VALUES (?, ?, ?, 'extract', 'manual_broll', 'ok',
                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, 1, ?)`,
        ulid(), vlog_id, operator.id,
        JSON.stringify({ state: 'skipped', reason: 'manual_broll_marker', by: operator.id }),
        Date.now(),
      )
    } catch {}

    return NextResponse.json({ ok: true, vlog_id, run_id }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'mark-broll failed', details: err?.message || String(err) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
