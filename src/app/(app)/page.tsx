/**
 * The log — home. The server half.
 *
 * ⚠️ 20 Sep. This page used to BE the client component, and it rendered
 * nothing on the server: the document arrived as a 12 KB shell with zero
 * rows in it, then the browser booted the JS and fetched `/api/v2/log`, and
 * only then did the log appear. Measured against the live site that was the
 * shell at ~650ms and the feed landing on top of it — "the whole page takes
 * a second to load, the content loads after the site".
 *
 * So the read happens here, on the server, and the entries ship inside the
 * HTML. `LogHomeClient` renders them on the first paint and takes over for
 * everything after: the order toggle, the eight-way filter, the search, and
 * opening a folded period. It is the same server+client split the Next 15
 * migration used for `/entry/[id]`, `/page/[id]` and `/month/[ym]`.
 *
 * **One feed, one query.** This calls `loadFeed` — the same function
 * `/api/v2/log` calls, in `src/lib/feed.ts`. SPEC §0.1 forbids a second
 * AUTHORED feed, two queries that can disagree about what the log holds. One
 * function with two callers is the opposite of that, and is the shape
 * `loadPublicFeed` already uses for the public feeds.
 *
 * ⚠️ **If anything here fails, the page still loads.** The whole read is
 * wrapped, and a failure hands the client `initial: null`, which is exactly
 * the state it was in before this change — it fetches on mount and shows the
 * log a moment later. A slow home page is a complaint; a home page that 500s
 * is the log being gone, and this is the one surface that must not do that.
 */

export const dynamic = 'force-dynamic'

import { headers } from 'next/headers'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { loadFeed, type FeedEnv } from '@/lib/feed'
import { requireOperatorFromHeaders } from '@/lib/access'
import { lookAtHeldBacklog } from '@/lib/log-intake'
import { drainUploadQueue } from '@/lib/upload-queue'
import type { FeedFilter } from '@/lib/log-entry'
import type { D1Database } from '@cloudflare/workers-types'
import LogHomeClient, { type InitialFeed } from './LogHomeClient'

interface Env extends FeedEnv {
  DB: D1Database
  AI: { run: (m: unknown, a: unknown) => Promise<unknown> }
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export default async function LogHome({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || null

  // The buried view is reached by name, not by a ninth button on a toolbar
  // the design gives eight.
  const filter: FeedFilter = one(sp.filter) === 'buried' ? 'buried' : 'all'
  // Arriving from an entry with "write what this led to" — read here and
  // handed down, so the server and the client agree about it rather than the
  // client discovering it at hydration.
  const ledFrom = one(sp.led_from)
  const relation = one(sp.relation)

  let initial: InitialFeed | null = null
  try {
    const env = getCloudflareContext().env as unknown as Env
    const operator = await requireOperatorFromHeaders(await headers(), env)
    const db = await readyDb(getDb(env), 'log-page')

    const payload = await loadFeed(db, env, operator.id, {
      order: 'happened',   // SPEC §1 — the default, and what the toggle starts on
      filter,
      limit: 200,
    })
    initial = {
      items: payload.items,
      buried: payload.buried,
      coverage: payload.coverage,
      fold: payload.fold,
      buried_by_day: payload.buried_by_day,
    }

    // The held-back backlog used to drain from `/api/v2/log`, which the
    // client called on every load. It does not any more — this render is
    // what a home page visit is now — so the drain happens here, after the
    // response, for the same reason and in the same bounded batch.
    getCloudflareContext().ctx?.waitUntil?.(
      lookAtHeldBacklog(env as never, db, operator.id, 6)
        .catch(err => console.warn('[log-page] hold-back backlog:', err?.message || err)),
    )

    // And send the next few queued recordings to the pipeline. A bulk drop
    // registers without dispatching (fifty at once is what wedged the
    // September corpus run), so something has to hand them over — and the
    // operator was explicit it must not be him. The drain is bounded and
    // marks each row before it sends, so a page visit cannot double-send.
    //
    // ⚠️ This means the queue moves while he is using the site. Left alone
    // with the browser closed it stops at the cap and waits; the unattended
    // answer is the healer's cron, which is off by default and his call.
    getCloudflareContext().ctx?.waitUntil?.(
      drainUploadQueue(env as never, db, operator.id)
        .catch(err => console.warn('[log-page] upload queue:', err?.message || err)),
    )
  } catch (err: any) {
    // Never fatal. The client falls back to fetching, which is what it did
    // before this page read anything at all.
    console.warn('[log-page] server render fell back to the client:', err?.message || err)
  }

  return (
    <LogHomeClient
      initial={initial}
      initialFilter={filter}
      ledFrom={ledFrom}
      relation={relation}
    />
  )
}
