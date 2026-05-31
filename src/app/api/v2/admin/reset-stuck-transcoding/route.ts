/**
 * POST /api/v2/admin/reset-stuck-transcoding
 *
 * Resets vlogs left stuck in pipeline_status='transcoding' (and state from
 * the wedged DO transcode dispatch) back to 'complete'/'ready'. These vlogs
 * had already finished extraction (they were 'complete' before the dispatch);
 * only the H.264 transcode was missing, and that's now handled out-of-band by
 * the runner backfill. Clearing the label stops the misleading UI and stops
 * the healer from re-kicking / eventually failing them.
 *
 * Safe: only touches rows with an active extraction_runs row (i.e. genuinely
 * already-extracted) and never touches 'failed' rows.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

export const runtime = 'edge'

interface Env { DB: D1Database; [k: string]: unknown }

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const db = getDb(env)
  // Restore already-extracted vlogs (real transcript content) to complete,
  // regardless of whatever stuck/in-flight/archived label the wedged DO
  // dispatch or a terminate-all left them in. The transcript-length guard
  // preserves genuine silent b-roll (transcript_text='' from no-audio-skip)
  // and never touches operator-archived imports (no active extraction_run).
  const res = await db.prepare(
    `UPDATE vlogs
        SET pipeline_status = 'complete',
            state = 'ready',
            pipeline_error = NULL,
            state_error = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE operator_id = ?
        AND deleted_at IS NULL
        AND pipeline_status IN ('transcoding','processing','extracting','transcribing','archived','uploaded')
        AND LENGTH(COALESCE(transcript_text, '')) > 0
        AND EXISTS (SELECT 1 FROM extraction_runs r WHERE r.vlog_id = vlogs.id AND r.is_active = 1)`,
  ).bind(operator.id).run()

  const remaining = await findOne<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM vlogs
      WHERE operator_id = ? AND deleted_at IS NULL
        AND pipeline_status IN ('transcoding','processing','extracting','transcribing')
        AND LENGTH(COALESCE(transcript_text, '')) > 0`,
    operator.id,
  )

  return NextResponse.json({
    ok: true,
    reset: (res as any)?.meta?.changes ?? null,
    still_not_complete: remaining?.c ?? null,
  })
}
