/**
 * GET /api/v2/public/numbers — what the log counts to.
 *
 * `numbers.html`. Every number carries the rule it was counted by, so the
 * page can be checked instead of believed. Nothing here interprets a count.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { loadNumbers, lastChanged } from '@/lib/machine-layer'
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
  const db = await readyDb(getDb(env), 'numbers')
  const [n, changed] = await Promise.all([
    loadNumbers(db, operator.id),
    lastChanged(db, operator.id),
  ])
  return NextResponse.json({ ...n, last_changed: changed }, { headers: { 'Cache-Control': 'no-store' } })
}
