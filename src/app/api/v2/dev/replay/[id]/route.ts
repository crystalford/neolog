/**
 * POST /api/v2/dev/replay/[id]?from=audio_extract|transcribe|extract&force=true
 *
 * Dev affordance for iterating on the pipeline without re-running upstream
 * steps. Body params (also accepted as query params):
 *   from:  'audio_extract' | 'transcribe' | 'extract'  (default 'extract')
 *   force: 'true' to ignore skip-if-exists guards
 *
 * Effect: marks the vlog state='queued' (or 'transcribed' if from=extract),
 * clears state_error, and re-dispatches the workflow / DO so the requested
 * step (and downstream steps) re-runs. Existing R2 artifacts for downstream
 * steps are NOT auto-deleted — `force=true` bypasses skip-if-exists checks
 * but leaves the data so a failed re-run can roll back.
 *
 * `from=extract` is the pipeline's own name for its last step, which is now
 * `stepRead` — no model, no prompt, no run row. Re-running it is free and
 * writes nothing the second time; audio_extract and transcribe are still
 * skipped by artifact existence, which is the point of replaying from a
 * later step at all.
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

const VALID_FROM = new Set(['audio_extract', 'transcribe', 'extract'])

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
  const url = new URL(req.url)
  const body = await req.json().catch(() => ({})) as { from?: string; force?: boolean }
  const from = (body.from ?? url.searchParams.get('from') ?? 'extract') as string
  const force = body.force === true || url.searchParams.get('force') === 'true'

  if (!VALID_FROM.has(from)) {
    return NextResponse.json({ error: `from must be one of ${[...VALID_FROM].join(', ')}` }, { status: 400 })
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

  const targetState = from === 'extract' ? 'transcribed' : 'queued'
  await run(
    db,
    `UPDATE vlogs SET state = ?, state_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    targetState, vlog_id,
  )

  // When force=true, also clear the column that the legacy workflow uses
  // to skip the step. The DO orchestrator handles force via its own flag
  // (passed below), but the workflow worker has no per-step force concept —
  // it skips based on column presence. So we wipe the relevant column.
  if (force) {
    if (from === 'audio_extract') {
      await run(
        db,
        `UPDATE vlogs SET audio_chunks_json = NULL, transcript_text = NULL,
                          transcript_completed_at = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        vlog_id,
      )
    } else if (from === 'transcribe') {
      await run(
        db,
        `UPDATE vlogs SET transcript_text = NULL, transcript_completed_at = NULL,
                          updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        vlog_id,
      )
    }
    // ⚠️ `from === 'extract'` used to deactivate the previous
    // `extraction_runs` row so the new run was the only live one. That table
    // was dropped on 8 Sep and there is no run to deactivate: the step it
    // names is `stepRead`, which cuts the word timings into entries and is
    // idempotent through `source_ref`. Running it twice writes nothing the
    // second time, which is why nothing replaces the deactivate rather than
    // it merely being absent.
  }

  let dispatched = false
  if (env.PIPELINE && env.HEARTBEAT_TOKEN) {
    try {
      const res = await env.PIPELINE.fetch(`https://internal/reextract/${vlog_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Heartbeat-Token': env.HEARTBEAT_TOKEN,
        },
        body: JSON.stringify({ operator_id: operator.id, pointer: from, force }),
      })
      dispatched = res.ok
    } catch {
      dispatched = false
    }
  } else if (env.PROCESS_UPLOAD) {
    try {
      const res = await env.PROCESS_UPLOAD.fetch('https://internal/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vlog_id, operator_id: operator.id,
          // ⚠️ This sent `passes: ['unified']` — the name of a library
          // deleted on 8 Sep — and `dispatchPipeline` read a non-empty
          // `passes` shorter than four as "use the legacy Workflow", so
          // replaying from the last step silently took the wrong backend.
          // What it means is skip the setup steps, which is what it says.
          skip_setup: from === 'extract' || undefined,
          force: force || undefined,
        }),
      })
      dispatched = res.ok
    } catch {
      dispatched = false
    }
  }

  return NextResponse.json({ ok: true, from, force, target_state: targetState, dispatched })
}
