/**
 * GET /api/v2/public/asks — the questions on the log, and the answers he
 * later gave to them.
 *
 * `asks.html`, minus the part that is below the drafting fence. See the note
 * at the top of `src/lib/machine-layer.ts`: the question is his, the answer
 * is his, and nothing between them is written by a model.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { loadAsks, lastChanged } from '@/lib/machine-layer'
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
  const db = await readyDb(getDb(env), 'asks')
  const [asks, changed] = await Promise.all([
    loadAsks(db, operator.id, {
      publicOnly: req.nextUrl.searchParams.get('all') !== '1',
    }),
    lastChanged(db, operator.id),
  ])
  return NextResponse.json({ ...asks, last_changed: changed }, { headers: { 'Cache-Control': 'no-store' } })
}
