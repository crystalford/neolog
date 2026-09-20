/**
 * GET /api/v2/log — the log. One feed, everything in it.
 *
 * Params:
 *   order  = happened | logged   (default happened — SPEC §1)
 *   filter = all | said | did | auto | mem | pub | priv | held | buried
 *   q      = free text; matches the sentence, the detail AND the transcript
 *            of a recording, because searching text the reader cannot see is
 *            worse than no search (log.html)
 *   limit  = 1..500 (default 200)
 *   from   = ISO date, inclusive — open one folded period
 *   to     = ISO date, inclusive
 *
 * ⚠️ 20 Sep: the query itself lives in `src/lib/feed.ts` now. The home page
 * is server-rendered and calls the same function directly, so the entries
 * ship inside the HTML rather than arriving a round trip after it. **One
 * feed, one query, two callers** — the shape `loadPublicFeed` already uses.
 * §0.1 forbids a second AUTHORED feed, not a second caller of one function.
 *
 * This route is what the page uses for everything AFTER the first render:
 * changing the order, the filter, the search, and opening a folded period.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { loadFeed, type FeedEnv } from '@/lib/feed'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { lookAtHeldBacklog } from '@/lib/log-intake'
import type { FeedFilter } from '@/lib/log-entry'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends FeedEnv {
  DB: D1Database
  // The hold-back backlog is drained from here, and it looks at pictures.
  AI: { run: (m: unknown, a: unknown) => Promise<unknown> }
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function GET(req: NextRequest) {
  const env = getCloudflareContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = await readyDb(getDb(env), 'log')
  const url = new URL(req.url)

  const payload = await loadFeed(db, env, operator.id, {
    order: url.searchParams.get('order') === 'logged' ? 'logged' : 'happened',
    filter: (url.searchParams.get('filter') || 'all') as FeedFilter,
    q: url.searchParams.get('q') || '',
    limit: parseInt(url.searchParams.get('limit') || '200', 10),
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
  })

  // ── Look at the pictures that are still waiting ────────────────────────
  //
  // A camera-roll import lands more images than one request can look at, so
  // intake checks a few and leaves the rest exactly as they arrived. This is
  // where the remainder gets seen: a small batch per feed load, after the
  // response has gone. The feed is the right place because a held row is
  // visible ON it — "not looked at yet" is a state he can watch clear.
  //
  // A picture the check already refused is not re-asked; its `held_reason`
  // says what the log saw, and asking again would eventually release
  // something it held on purpose.
  getCloudflareContext().ctx.waitUntil(
    lookAtHeldBacklog(env as never, db, operator.id, 6)
      .catch(err => console.warn('[log] hold-back backlog:', err?.message || err)),
  )

  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
}
