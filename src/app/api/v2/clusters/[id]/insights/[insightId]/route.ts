/**
 * DELETE /api/v2/clusters/[id]/insights/[insightId]
 *
 * Removes an operator-authored insight from a cluster. Verifies the
 * insight belongs to a cluster owned by the operator before deleting
 * (cluster_insights has no operator_id of its own; provenance flows
 * via cluster_id → clusters.operator_id).
 *
 * Hard delete (no deleted_at column on cluster_insights). Used for
 * operator notes/quotes/references the operator wants to retract.
 * Cultivate-generated insights (those with bounce_run_id set) are
 * also deletable here — same path.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; insightId: string } },
) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const db = getDb(env)
  // Confirm the insight belongs to an operator-owned cluster.
  const row = await findOne<{ id: string }>(
    db,
    `SELECT ci.id FROM cluster_insights ci
       JOIN clusters c ON c.id = ci.cluster_id
      WHERE ci.id = ? AND ci.cluster_id = ?
        AND c.operator_id = ? AND c.deleted_at IS NULL`,
    params.insightId, params.id, operator.id,
  )
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.prepare(`DELETE FROM cluster_insights WHERE id = ?`).bind(params.insightId).run()

  return NextResponse.json({ ok: true })
}
