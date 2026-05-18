/**
 * POST /api/v2/vlogs/[id]/reset
 *
 * Wipe the pipeline state for one vlog and kick a fresh run:
 *  - delete pipeline_events rows for this vlog (only the NEW DO-orchestrator
 *    runs; legacy workflow events stay so the historical record is preserved)
 *  - reset vlogs.state = 'queued', state_error = NULL,
 *           pipeline_status = 'uploaded', pipeline_error = NULL,
 *           pipeline_restart_count = 0
 *  - dispatch /start on the pipeline DO (with HEARTBEAT_TOKEN), which clears
 *    DO storage (pointer / attempts) and schedules an alarm to begin step 0.
 *
 * Used by the "Reset" button on /timeline/[id] when the operator wants to
 * start over cleanly — confusing state, leftover events from a prior run,
 * or just iterating during testing.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  PIPELINE?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  PROCESS_UPLOAD?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  HEARTBEAT_TOKEN?: string
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try {
    operator = await requireOperator(req, env)
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
    }
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
  if (!owned) return NextResponse.json({ error: 'vlog not found' }, { status: 404 })

  // Wipe only the new DO-orchestrator events; keep legacy workflow events
  // so we don't destroy historical evidence of what happened.
  await run(
    db,
    `DELETE FROM pipeline_events WHERE vlog_id = ? AND (runtime = 'pipeline' OR runtime IS NULL)`,
    vlog_id,
  )

  await run(
    db,
    `UPDATE vlogs
        SET state = 'queued', state_error = NULL,
            pipeline_status = 'uploaded', pipeline_error = NULL,
            pipeline_restart_count = 0,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    vlog_id,
  )

  let dispatched = false
  let path = 'none'
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
      path = 'pipeline'
    } catch {}
  } else if (env.PROCESS_UPLOAD) {
    try {
      const res = await env.PROCESS_UPLOAD.fetch('https://internal/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vlog_id, operator_id: operator.id }),
      })
      dispatched = res.ok
      path = 'workflow'
    } catch {}
  }

  return NextResponse.json({ ok: true, dispatched, path })
}
