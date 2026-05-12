/**
 * POST /api/v2/admin/regenerate-thumbnails
 *
 * Dispatches the process-upload Workflow with `thumbnail_only: true` for
 * every operator vlog that doesn't have a thumbnail_url yet. The workflow
 * runs transcode (LOCKED — HEVC handling) → thumbnail → recorded_at, then
 * short-circuits before transcribe + extractions.
 *
 * Each dispatch is async — this endpoint returns immediately with a count
 * of jobs queued. The Cloudflare Workflows runtime executes them in the
 * background.
 *
 * Cost: ~$0.05 per vlog in container compute, roughly $8 for 172 vlogs.
 * Time: depends on parallelism Cloudflare schedules; usually 30-60 min wall.
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  PROCESS_UPLOAD?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(req: NextRequest) {
  try {
    return await handle(req)
  } catch (err: any) {
    return NextResponse.json(
      { error: `Crashed: ${err?.message || String(err)}` },
      { status: 500 },
    )
  }
}

async function handle(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  if (!env.PROCESS_UPLOAD) {
    return NextResponse.json(
      { error: 'PROCESS_UPLOAD service binding missing on Pages project. Add it via Pages → Settings → Bindings.' },
      { status: 503 },
    )
  }

  const db = getDb(env)
  const targets = await findMany<{ id: string }>(
    db,
    `SELECT id FROM vlogs
       WHERE operator_id = ? AND deleted_at IS NULL
         AND thumbnail_url IS NULL
       ORDER BY recorded_at ASC, uploaded_at ASC
       LIMIT 200`,
    operator.id,
  )

  if (targets.length === 0) {
    return NextResponse.json({ ok: true, dispatched: 0, message: 'All vlogs already have thumbnails.' })
  }

  // Fire off all dispatches in parallel. Each is a single subrequest to the
  // workflow worker; Cloudflare Workflows runtime handles the actual queueing.
  const results = await Promise.allSettled(
    targets.map(t =>
      env.PROCESS_UPLOAD!.fetch('https://internal/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vlog_id: t.id,
          operator_id: operator.id,
          thumbnail_only: true,
        }),
      }).then(r => r.ok),
    ),
  )

  const dispatched = results.filter(r => r.status === 'fulfilled' && r.value).length
  const failed = results.length - dispatched

  return NextResponse.json({
    ok: true,
    dispatched,
    failed,
    total_needing_thumbnail: targets.length,
    message: `Dispatched ${dispatched} thumbnail-only jobs. Workflows run in background — refresh /uploads in 30-60 minutes to see thumbnails populate.`,
  })
}
