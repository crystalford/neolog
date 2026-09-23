/**
 * GET /api/v2/away — what arrived while nothing was written.
 *
 * `away.html` is mostly a list of things the log refuses to do. Its own
 * heading is "While you were gone — nothing needed you", and the summary
 * line is "151 entries · all filed · nothing waiting".
 *
 * So: no welcome back, no broken streak, no badge, no unread count, no queue
 * to clear. The design's line for the gap itself is the whole attitude —
 * "You didn't write anything for nine days. 148 photos and one voice note
 * arrived on their own, so the days aren't empty — they just have no words
 * on them."
 *
 * That is a statement about the log, not a reproach, and this endpoint
 * returns exactly the facts needed to say it and nothing that could be
 * turned into a nag: no streak, no target, no "you usually write N a week".
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/lib/d1'
import { awaySummary } from '@/lib/rail'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

/** Below this a gap is just a couple of quiet days, and not worth a word. */
const MIN_GAP_DAYS = 4

export async function GET(req: NextRequest) {
  const env = getCloudflareContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = await readyDb(getDb(env), 'away')

  // ⚠️ 21 Sep — the body of this moved to `src/lib/rail.ts`, so the home
  // page can read it server-side in the request that renders the page
  // instead of fetching it on mount. One function, two callers — the shape
  // `feed.ts` already uses, and for the same reason: a second copy of a
  // query is a second thing that can disagree about what the log holds.
  return NextResponse.json(
    await awaySummary(db, operator.id),
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
