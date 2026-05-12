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
    findOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM vlogs WHERE operator_id = ? AND deleted_at IS NULL', operator.id),
    findOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM vlogs WHERE operator_id = ? AND pipeline_status = 'complete' AND deleted_at IS NULL", operator.id),
    findOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM vlogs WHERE operator_id = ? AND pipeline_status = 'transcribing' AND deleted_at IS NULL", operator.id),
    findOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM vlogs WHERE operator_id = ? AND pipeline_status = 'extracting' AND deleted_at IS NULL", operator.id),
    findOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM vlogs WHERE operator_id = ? AND pipeline_status = 'archived' AND deleted_at IS NULL", operator.id),
    findOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM vlogs WHERE operator_id = ? AND (pipeline_status = 'error' OR pipeline_error IS NOT NULL) AND deleted_at IS NULL", operator.id),
    findOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM threads WHERE operator_id = ? AND deleted_at IS NULL', operator.id),
    findOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM clusters WHERE operator_id = ? AND deleted_at IS NULL', operator.id),
    findOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM prompts WHERE is_active = 1'),
  ])
  return NextResponse.json({
    vlog_total: counts[0]?.n ?? 0,
    vlog_complete: counts[1]?.n ?? 0,
    vlog_transcribing: counts[2]?.n ?? 0,
    vlog_extracting: counts[3]?.n ?? 0,
    vlog_archived: counts[4]?.n ?? 0,
    vlog_error: counts[5]?.n ?? 0,
    thread_total: counts[6]?.n ?? 0,
    cluster_total: counts[7]?.n ?? 0,
    prompts_active: counts[8]?.n ?? 0,
  })
}
