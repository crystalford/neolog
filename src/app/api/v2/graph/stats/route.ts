export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const counts = await Promise.all([
    findOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM threads WHERE operator_id = ? AND deleted_at IS NULL', operator.id),
    findOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM clusters WHERE operator_id = ? AND deleted_at IS NULL', operator.id),
    findOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM entities WHERE operator_id = ? AND deleted_at IS NULL', operator.id),
  ])
  const [t, c, e] = counts.map(r => r?.n ?? 0)
  return NextResponse.json({
    thread_count: t,
    cluster_count: c,
    entity_count: e,
    has_data: t > 0 || c > 0 || e > 0,
  })
}
