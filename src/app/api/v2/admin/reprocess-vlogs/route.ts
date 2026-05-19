/**
 * POST /api/v2/admin/reprocess-vlogs
 *
 * Bulk re-dispatch the post-upload pipeline across many vlogs at once.
 * Used by the operator to backfill after a pipeline bug — e.g. the
 * silent-INSERT bug that masked clip / creative / entity output for
 * weeks. Each dispatched vlog runs asynchronously in the DO/Workflow
 * (this endpoint just kicks them off and returns immediately).
 *
 * Body:
 *   {
 *     vlog_ids?: string[]            // explicit list; takes precedence
 *     scope?: 'incomplete' | 'all'   // when no vlog_ids given (default 'incomplete')
 *     mode: 'cheap' | 'premium'      // LLM tier
 *     max_concurrency?: number       // default 3
 *   }
 *
 * Response:
 *   { dispatched: N, failed: M, results: [{ vlog_id, ok, backend, error? }, ...] }
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { dispatchPipeline } from '@/lib/dispatch-pipeline'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  PROCESS_UPLOAD?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
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

  const body = await req.json().catch(() => null) as {
    vlog_ids?: string[]
    scope?: 'incomplete' | 'all'
    mode?: 'cheap' | 'premium'
    max_concurrency?: number
  } | null

  const mode: 'cheap' | 'premium' = body?.mode === 'premium' ? 'premium' : 'cheap'
  const scope: 'incomplete' | 'all' = body?.scope === 'all' ? 'all' : 'incomplete'
  const concurrency = Math.min(Math.max(1, body?.max_concurrency ?? 3), 10)

  const db = getDb(env)

  // Resolve the target vlog list.
  let ids: string[] = []
  if (Array.isArray(body?.vlog_ids) && body.vlog_ids.length > 0) {
    ids = body.vlog_ids.slice(0, 500)
  } else {
    // Pull all vlogs owned by operator. 'incomplete' = pipeline_status
    // not complete OR no active extraction_runs row. We do the join in
    // SQL so the bulk endpoint stays a single round-trip.
    try {
      const rows = await findMany<{ id: string }>(
        db,
        scope === 'all'
          ? `SELECT id FROM vlogs
              WHERE operator_id = ? AND deleted_at IS NULL
              ORDER BY recorded_at DESC, uploaded_at DESC
              LIMIT 500`
          : `SELECT v.id FROM vlogs v
              LEFT JOIN extraction_runs r
                ON r.vlog_id = v.id AND r.is_active = 1
              WHERE v.operator_id = ? AND v.deleted_at IS NULL
                AND (v.pipeline_status != 'complete' OR r.id IS NULL)
              ORDER BY v.recorded_at DESC, v.uploaded_at DESC
              LIMIT 500`,
        operator.id,
      )
      ids = rows.map(r => r.id)
    } catch (err: any) {
      return NextResponse.json(
        { error: 'Failed to resolve vlog list', details: err?.message || String(err) },
        { status: 500 },
      )
    }
  }

  if (ids.length === 0) {
    return NextResponse.json({ dispatched: 0, failed: 0, results: [], note: 'no vlogs matched' })
  }

  // Concurrency-bounded dispatch loop.
  const results: { vlog_id: string; ok: boolean; backend: string; error?: string }[] = []
  let cursor = 0
  const worker = async () => {
    while (cursor < ids.length) {
      const idx = cursor++
      const vlog_id = ids[idx]
      const res = await dispatchPipeline(env, {
        vlog_id, operator_id: operator.id, mode,
      })
      results.push({ vlog_id, ok: res.ok, backend: res.backend, error: res.error })
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  const dispatched = results.filter(r => r.ok).length
  const failed = results.length - dispatched
  return NextResponse.json({ dispatched, failed, results })
}
