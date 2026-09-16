/**
 * GET /api/v2/vlogs/[id]/events
 *
 * Returns the pipeline_events log for one vlog, most-recent first, with
 * FULL untruncated error_full_text. Used by the /timeline/[id] detail
 * page to render the diagnostic block. Replaces the truncated
 * extraction_outcomes JSON view.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { getEventsForVlog } from '@/lib/pipeline-events'
import { diagnoseFromEvents } from '@/lib/diagnose-vlog'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try {
    operator = await requireOperator(req, env)
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }
  const { id: vlog_id } = await ctx.params
  if (!vlog_id) return NextResponse.json({ error: 'vlog id required' }, { status: 400 })

  const db = getDb(env)
  // What the synthesizer needs to say something true: whether Whisper left
  // word timings, and how many entries have been read out of this recording.
  // ⚠️ It used to read `extraction_runs.total_items`, and that table was
  // dropped on 8 Sep — so this query threw `no such table` and the banner at
  // the top of the recording's page never rendered a diagnosis at all.
  const owned = await findOne<{
    id: string
    pipeline_status: string
    transcript_len: number
    has_words: number
    entries_read: number
  }>(
    db,
    `SELECT v.id, v.pipeline_status,
            COALESCE(LENGTH(v.transcript_text), 0) AS transcript_len,
            EXISTS (SELECT 1 FROM transcript_words w WHERE w.vlog_id = v.id) AS has_words,
            (SELECT COUNT(*) FROM log_entries e
              WHERE e.vlog_id = v.id AND e.operator_id = v.operator_id
                AND e.deleted_at IS NULL) AS entries_read
       FROM vlogs v
      WHERE v.id = ? AND v.operator_id = ? AND v.deleted_at IS NULL`,
    vlog_id, operator.id,
  )
  if (!owned) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const events = await getEventsForVlog(db, vlog_id, operator.id, 200)

  // Synthesize a one-sentence diagnosis from the events. This is what the
  // operator actually needs — a human-readable summary of what's wrong
  // and what to do — not more raw log text. Banner at the top of the
  // detail page consumes this.
  const diagnosis = diagnoseFromEvents(
    events as any,
    owned.pipeline_status,
    !!owned.has_words,
    owned.entries_read ?? 0,
    owned.transcript_len ?? 0,
  )

  return NextResponse.json({ events, diagnosis })
}
