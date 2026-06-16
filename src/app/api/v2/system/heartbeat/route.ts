/**
 * POST /api/v2/system/heartbeat
 *
 * The autonomous loop's body. Runs the librarian + spark-seeds refresh
 * + draft-prep work that would otherwise only fire when the operator
 * opens /subjects. Idempotent and cheap when nothing changed.
 *
 * Today this is operator-invocable from a Settings button or hit by
 * an external scheduler. Next step: wire as a Cloudflare Cron Trigger
 * (separate worker or wrangler.toml entry on the Pages project) so the
 * home page picks up new drafts overnight without anyone opening it.
 *
 * Steps:
 *   1. If >= 5 new threads since the last librarian run, rebuild
 *      subjects. The librarian itself auto-refreshes operator-profile
 *      + spark-seeds on completion.
 *   2. Otherwise, refresh spark-seeds only (cheap, 5s) so the home
 *      page has fresh quick-video suggestions.
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

export async function POST(req: NextRequest) {
  return run(req)
}

export async function GET(req: NextRequest) {
  // GET form for convenience — operator can hit the URL from a browser
  // to trigger a manual pulse without crafting a POST.
  return run(req)
}

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
    ran_librarian: false,
    ran_spark_seeds: false,
    librarian_model: null,
    elapsed_ms: 0,
  }

  if (isFirstRun || newThreads >= LIBRARIAN_THRESHOLD) {
    try {
      const result = await buildSubjects(db, operator.id, env)
      summary.ran_librarian = true
      summary.librarian_model = (result as any)?.model ?? null
      summary.subjects_count = (result as any)?.subjects?.length ?? null
      // The librarian auto-rebuilds spark-seeds + operator-profile on
      // completion. Don't double-run.
      summary.ran_spark_seeds = true
    } catch (err: any) {
      summary.librarian_error = err?.message || String(err)
    }
  } else {
    // Cheap path — refresh spark-seeds only.
    try {
      const seeds = await buildSparkSeeds(db, operator.id, env as any)
      summary.ran_spark_seeds = true
      summary.spark_seeds_count = (seeds as any)?.seeds?.length ?? null
    } catch (err: any) {
      summary.spark_seeds_error = err?.message || String(err)
    }
  }

  summary.elapsed_ms = Date.now() - started
  return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } })
}
