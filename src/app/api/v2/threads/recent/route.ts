/**
 * GET /api/v2/threads/recent
 *
 * Returns the operator's most recent threads (last 14 days, top 5).
 * Used by the Capture page's "Active threads" strip to remind the operator
 * what's been on their mind — drop a vlog that adds to any of these and the
 * system will link them.
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function GET(req: NextRequest) {
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
  const db = getDb(env)
  const threads = await findMany<{
    id: string
    topic: string
    take: string | null
    vlog_id: string
  }>(
    db,
    `SELECT id, topic, take, vlog_id
       FROM threads
      WHERE operator_id = ? AND deleted_at IS NULL
        AND extracted_at >= datetime('now', '-14 days')
      ORDER BY extracted_at DESC
      LIMIT 5`,
    operator.id,
  )
  return NextResponse.json({ threads })
}
