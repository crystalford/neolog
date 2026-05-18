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
  // Confirm the vlog belongs to this operator. Cheap and prevents trivially
  // probing other operators' vlog IDs.
  const owned = await findOne<{ id: string }>(
    db, `SELECT id FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    vlog_id, operator.id,
  )
  if (!owned) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const events = await getEventsForVlog(db, vlog_id, operator.id, 200)
  return NextResponse.json({ events })
}
