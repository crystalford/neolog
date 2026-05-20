/**
 * POST /api/v2/admin/reset-stuck
 *
 * Clears `pipeline_status` on vlogs that are stuck in a transient state
 * (transcoding / transcribing / extracting / uploaded) past a freshness
 * window. The dead Cloudflare Workflow / DO instances that put them
 * there will fail their own retries and stop on their own — this just
 * frees the operator to re-dispatch without waiting for the 15-min
 * in-flight skip window.
 *
 * Costs nothing — pure D1 UPDATE. No LLM calls, no container starts.
 *
 * Request body:
 *   {
 *     scope?: 'in_flight' | 'failed' | 'all',  // default 'in_flight'
 *     stuck_minutes?: number,                   // default 5
 *     dry_run?: boolean,                        // default false
 *   }
 *
 * Response:
 *   { reset: N, dry_run: bool, scope, stuck_minutes, sample_ids: [...] }
 *
 * Safe to re-run. Leaves transcripts, extractions, R2 artifacts intact.
 * Resets pipeline_status → 'archived' (operator-opt-in re-process state)
 * and clears pipeline_error so the UI doesn't show stale red text.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

const IN_FLIGHT_STATUSES = ['transcoding', 'transcribing', 'extracting', 'uploaded']

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const body = await req.json().catch(() => ({})) as {
    scope?: 'in_flight' | 'failed' | 'all'
    stuck_minutes?: number
    dry_run?: boolean
    reset_restart_count?: boolean
  }
  const scope = body.scope === 'failed' || body.scope === 'all' ? body.scope : 'in_flight'
  const stuckMin = Math.max(0, Math.min(60 * 24, body.stuck_minutes ?? 5))
  const dryRun = body.dry_run === true

  const db = getDb(env)
  const inFlightSet = IN_FLIGHT_STATUSES.map(s => `'${s}'`).join(',')

  // Build the WHERE clause for each scope. Always operator-scoped, never
  // touches deleted vlogs, never touches 'complete' (those are done).
  let whereClause: string
  if (scope === 'in_flight') {
    whereClause = `
      pipeline_status IN (${inFlightSet})
      AND updated_at < datetime('now', '-${stuckMin} minutes')
    `
  } else if (scope === 'failed') {
    whereClause = `
      (pipeline_status IN (${inFlightSet})
       AND updated_at < datetime('now', '-${stuckMin} minutes'))
      OR pipeline_status = 'failed'
    `
  } else { // 'all'
    whereClause = `
      pipeline_status != 'complete'
      AND (
        pipeline_status NOT IN (${inFlightSet})
        OR updated_at < datetime('now', '-${stuckMin} minutes')
      )
    `
  }

  try {
    // Always preview the affected ids so the response has something the
    // UI can show. Cap the sample at 50 for response size.
    const sample = await findMany<{ id: string; pipeline_status: string }>(
      db,
      `SELECT id, pipeline_status FROM vlogs
        WHERE operator_id = ? AND deleted_at IS NULL AND ${whereClause}
        ORDER BY updated_at ASC
        LIMIT 50`,
      operator.id,
    )

    const countRow = await findMany<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM vlogs
        WHERE operator_id = ? AND deleted_at IS NULL AND ${whereClause}`,
      operator.id,
    )
    const totalCount = countRow[0]?.n ?? 0

    if (dryRun || totalCount === 0) {
      return NextResponse.json({
        reset: 0,
        dry_run: true,
        would_reset: totalCount,
        scope,
        stuck_minutes: stuckMin,
        sample_ids: sample.map(r => ({ id: r.id, was: r.pipeline_status })),
      }, { headers: { 'Cache-Control': 'no-store' } })
    }

    // Actually reset. Operator-scoped UPDATE; sets pipeline_status to
    // 'archived' (the operator-opt-in processing state) so the row stays
    // out of the "in flight" set in subsequent dispatches. Clears
    // pipeline_error AND state_error AND extraction_outcomes so stale
    // red banners disappear. Also resets pipeline_restart_count to 0
    // when the caller passed reset_restart_count:true — necessary to
    // re-eligible vlogs that hit the healer's MAX_RESTARTS limit.
    const resetRestartCount = body.reset_restart_count === true
    const sqlParts = [
      `pipeline_status = 'archived'`,
      `pipeline_error = NULL`,
      `state_error = NULL`,
      `extraction_outcomes = NULL`,
      `updated_at = CURRENT_TIMESTAMP`,
    ]
    if (resetRestartCount) sqlParts.push(`pipeline_restart_count = 0`)
    await run(
      db,
      `UPDATE vlogs
          SET ${sqlParts.join(',\n              ')}
        WHERE operator_id = ? AND deleted_at IS NULL AND ${whereClause}`,
      operator.id,
    )

    return NextResponse.json({
      reset: totalCount,
      dry_run: false,
      scope,
      stuck_minutes: stuckMin,
      sample_ids: sample.map(r => ({ id: r.id, was: r.pipeline_status })),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'reset-stuck failed', details: err?.message || String(err) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
