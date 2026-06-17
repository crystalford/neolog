/**
 * POST /api/v2/vlogs/[id]/auto-publish-now
 *
 * Manually trigger the same auto-promote pipeline that the post-upload
 * workflow runs at the end of extraction. Use for existing vlogs that
 * predate the feature, or when an extraction re-run produces new
 * clip candidates worth shipping.
 *
 * Behavior is the same as the workflow step: select the top N
 * validated clip candidates, slice each one, draft a caption, write a
 * post row, and fire the operator's social-fanout webhook if one is
 * configured. Idempotent — re-running on a vlog that already shipped
 * skips the work for any clip already produced.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { autoPromoteVlog, type AutoPromoteEnv } from '@/lib/auto-promote'
import type { D1Database, Ai } from '@cloudflare/workers-types'

interface Env extends AutoPromoteEnv {
  DB: D1Database
  AI: Ai
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const vlog = await findOne<{ id: string }>(
    getDb(env),
    `SELECT id FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!vlog) return NextResponse.json({ error: 'Vlog not found' }, { status: 404 })

  try {
    const summary = await autoPromoteVlog(env, operator.id, params.id)
    return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 })
  }
}
