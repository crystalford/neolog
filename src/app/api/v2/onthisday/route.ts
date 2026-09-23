/**
 * GET /api/v2/onthisday — this date in other years.
 *
 * SPEC §1: "**Resurfacing without comment is allowed.** An old entry shown
 * again on its date — *on this day* — with nothing said about it. Shows;
 * doesn't say."
 *
 * This is the only resurfacing in the product, and the restraint is the
 * feature. `onthisday.html`: "No comment, no 'remember when', no count. The
 * way a diary falls open at a page." So this endpoint returns entries and
 * nothing else — no counts to display, no streak, no "one year ago today".
 *
 * A year with nothing on this date is reported as a year with nothing on it,
 * because "twenty-two years with nothing written down for 5 September. Not
 * because nothing happened" is a true and useful thing to see.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { type R2Env } from '@/lib/r2'
import { onThisDay, type RailEnv } from '@/lib/rail'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function GET(req: NextRequest) {
  const env = getCloudflareContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = await readyDb(getDb(env), 'onthisday')
  const url = new URL(req.url)

  // Default to today, in UTC, to match how dates are stored.
  const on = url.searchParams.get('on') || new Date().toISOString().slice(5, 10)  // MM-DD
  if (!/^\d{2}-\d{2}$/.test(on)) {
    return NextResponse.json({ error: 'on must be MM-DD' }, { status: 400 })
  }
  // ⚠️ 21 Sep — the body moved to `src/lib/rail.ts`. See the note there and
  // on `/api/v2/away`: the home page reads all four rail cards server-side
  // now, and one function with two callers is how this repo keeps a query
  // from being written twice.
  return NextResponse.json(
    await onThisDay(db, env as unknown as RailEnv, operator.id, on),
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
