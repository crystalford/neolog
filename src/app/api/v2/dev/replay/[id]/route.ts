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
 * 50 prompt iterations on the same vlog cost ~$2 instead of ~50 minutes of
 * ffmpeg time × 50, because audio_extract + transcribe are skipped by
 * artifact existence.
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

  let dispatched = false
  if (env.PROCESS_UPLOAD) {
    try {
      const dispatchBody: Record<string, unknown> = {
        vlog_id, operator_id: operator.id,
      }
      if (from === 'extract') dispatchBody.passes = ['unified']
      if (force) dispatchBody.force = true
      const res = await env.PROCESS_UPLOAD.fetch('https://internal/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dispatchBody),
      })
      dispatched = res.ok
    } catch {
      dispatched = false
    }
  }

  return NextResponse.json({ ok: true, from, force, target_state: targetState, dispatched })
}
