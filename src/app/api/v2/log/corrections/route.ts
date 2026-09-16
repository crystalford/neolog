/**
 * GET /api/v2/log/corrections — the log's record of its own mistakes.
 *
 * `wrong.html` §2. `entry_revisions` has kept every correction since the
 * first one shipped, and until now they were only visible on the page of the
 * entry that was corrected — so a mistake could be read only by someone who
 * already knew where it was.
 *
 * Query: ?limit= (1–100, default 40) &before=<the previous page's oldest
 * created_at>. Paged rather than capped, because a record of mistakes that
 * silently stops at some number is the same lie the export was telling.
 *
 * The counts come back with every page. They are counts, not a reading of
 * them — see `src/lib/corrections.ts` for the trend the design draws and
 * this does not.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { loadCorrections } from '@/lib/corrections'
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
  // `by_whom` and this session's index both landed in this deploy.
  const db = await readyDb(getDb(env), 'corrections')

  const url = new URL(req.url)
  const limit = Number(url.searchParams.get('limit') || 40)
  const before = url.searchParams.get('before')

  const page = await loadCorrections(db, operator.id, {
    limit: Number.isFinite(limit) ? limit : 40,
    before,
  })

  return NextResponse.json(page, { headers: { 'Cache-Control': 'no-store' } })
}
