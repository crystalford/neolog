/**
 * Wait for the schema before touching columns that a migration added.
 *
 * `getDb()` starts the migration runner fire-and-forget and deliberately
 * does not await it — awaiting would add latency to the first request on
 * every cold isolate, and most routes only touch columns that have existed
 * for months.
 *
 * That trade stops being free for a route whose columns landed in the same
 * deploy. On the first request after such a deploy the query runs before its
 * columns exist and fails with "no such column" — which is exactly the shape
 * of the failure that took the whole log down on 7 September, except
 * transient, and therefore harder to recognise: it looks like the log is
 * broken, then mysteriously isn't.
 *
 * This session added around sixty columns across `log_entries`, `pages`,
 * `entry_revisions`, `recall_questions` and `month_summaries`, so every
 * route that reads them awaits the runner first. `ensureMigrationsOnce`
 * memoises per isolate, so this is a no-op after the first call — a few
 * hundred milliseconds once, instead of a broken first page load.
 */

import type { D1Database } from '@cloudflare/workers-types'

export async function readyDb(db: D1Database, label = 'route'): Promise<D1Database> {
  try {
    const { ensureMigrationsOnce } = await import('@/lib/migration-runner')
    await ensureMigrationsOnce(db)
  } catch (err: any) {
    // A failed wait is not a reason to refuse the request — the query may
    // still work, and if it does not the caller's own error is clearer than
    // one invented here.
    console.warn(`[${label}] migration wait failed: ${err?.message || err}`)
  }
  return db
}
