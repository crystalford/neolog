/**
 * POST /api/v2/vlogs/[id]/auto-publish-toggle
 *
 * Body: { auto_publish_clips?: boolean, auto_publish_vertical?: boolean }
 *
 * Per-vlog control. Flips one or both flags. Returns the new row state.
 * Decoupled from the "auto-publish-now" endpoint so the operator can
 * configure intent without firing the sweep.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const body = await req.json().catch(() => ({})) as {
    auto_publish_clips?: boolean
    auto_publish_vertical?: boolean
  }

  const updates: string[] = []
  const values: any[] = []
  if (body.auto_publish_clips !== undefined) {
    updates.push('auto_publish_clips = ?')
    values.push(body.auto_publish_clips ? 1 : 0)
  }
  if (body.auto_publish_vertical !== undefined) {
    updates.push('auto_publish_vertical = ?')
    values.push(body.auto_publish_vertical ? 1 : 0)
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: 'no toggle fields in body' }, { status: 400 })
  }

  await run(
    db,
    `UPDATE vlogs SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    ...values, params.id, operator.id,
  )

  const row = await findOne<{
    auto_publish_clips: number; auto_publish_vertical: number; auto_publish_pending: number
  }>(
    db,
    `SELECT auto_publish_clips, auto_publish_vertical, auto_publish_pending
       FROM vlogs WHERE id = ? AND operator_id = ?`,
    params.id, operator.id,
  )
  return NextResponse.json({ ok: true, vlog: row }, { headers: { 'Cache-Control': 'no-store' } })
}
