/**
 * GET /api/v2/log/walk/[id] — the whole route a thought took, reached from
 * any turn on it.
 *
 * There is no thread id: the id in the path is an ENTRY's, and every turn on
 * the same route resolves to the same walk. See `src/lib/walk.ts` for why
 * that is the right shape rather than a shortcut.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { loadWalk } from '@/lib/walk'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = await readyDb(getDb(env), 'walk')
  const walk = await loadWalk(db, operator.id, params.id)
  if (!walk.start) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(walk, { headers: { 'Cache-Control': 'no-store' } })
}
