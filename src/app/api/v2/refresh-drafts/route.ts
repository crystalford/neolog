/**
 * POST /api/v2/refresh-drafts (GET also accepted for convenience)
 *
 * Does the background work that would otherwise only fire when the
 * operator opens /subjects. Updates the home page's "Ready to send"
 * list with anything new.
 *
 *   - If >= 5 threads landed since the last librarian run, rebuild the
 *     subjects. The librarian, on completion, auto-refreshes the
 *     operator-profile digest + the quick-video seeds, so a single
 *     librarian pass cascades into all three caches getting fresh.
 *   - Otherwise: refresh the quick-video seeds only (~5s) so the
 *     home page's quick-video cards have new suggestions.
 *
 * Operator-invocable today. Wireable as a Cloudflare scheduled job
 * (wrangler.toml `[triggers] crons` or a separate cron worker) so the
 * home page picks up new drafts overnight without anyone opening the
 * app.
 *
 * Returns a JSON summary the caller can log.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { buildSubjects, type LibrarianEnv } from '@/lib/librarian'
import { buildSparkSeeds } from '@/lib/spark-seeds'
import type { D1Database, Ai } from '@cloudflare/workers-types'

interface Env extends LibrarianEnv {
  DB: D1Database
  AI: Ai
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

// Same threshold as /api/v2/subjects (keep them aligned).
const LIBRARIAN_THRESHOLD = 5

export async function POST(req: NextRequest) { return run(req) }
export async function GET(req: NextRequest)  { return run(req) }

async function run(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const started = Date.now()

  const staleness = await findOne<{ last_librarian_at: string | null; new_threads: number }>(
    db,
    `WITH last_run AS (
       SELECT MAX(updated_at) AS last_at FROM clusters
        WHERE operator_id = ? AND subject_source = 'librarian' AND deleted_at IS NULL
     )
     SELECT (SELECT last_at FROM last_run) AS last_librarian_at,
            (SELECT COUNT(*) FROM threads
              WHERE operator_id = ? AND deleted_at IS NULL
                AND (
                  (SELECT last_at FROM last_run) IS NULL
                  OR extracted_at > (SELECT last_at FROM last_run)
                )
            ) AS new_threads`,
    operator.id, operator.id,
  )
  const newThreads = staleness?.new_threads ?? 0
  const isFirstRun = !staleness?.last_librarian_at

  const summary: any = {
    operator_id: operator.id,
    last_librarian_at: staleness?.last_librarian_at,
    new_threads_pending: newThreads,
    rebuilt_subjects: false,
    refreshed_quick_video_seeds: false,
    librarian_model: null,
    elapsed_ms: 0,
  }

  if (isFirstRun || newThreads >= LIBRARIAN_THRESHOLD) {
    try {
      const result = await buildSubjects(db, operator.id, env)
      summary.rebuilt_subjects = true
      summary.librarian_model = (result as any)?.model ?? null
      summary.subjects_count = (result as any)?.subjects?.length ?? null
      // The librarian auto-rebuilds quick-video seeds + operator-profile on
      // completion. Don't double-run.
      summary.refreshed_quick_video_seeds = true
    } catch (err: any) {
      summary.librarian_error = err?.message || String(err)
    }
  } else {
    try {
      const seeds = await buildSparkSeeds(db, operator.id, env as any)
      summary.refreshed_quick_video_seeds = true
      summary.seeds_count = (seeds as any)?.seeds?.length ?? null
    } catch (err: any) {
      summary.seeds_error = err?.message || String(err)
    }
  }

  summary.elapsed_ms = Date.now() - started
  return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } })
}
