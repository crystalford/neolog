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
import { sweepPendingAutoPublish, type AutoPromoteEnv } from '@/lib/auto-promote'
import { judgeClipBacklog } from '@/lib/clip-judge'
import { visionTagVlogBacklog } from '@/lib/vision'
import type { D1Database, Ai } from '@cloudflare/workers-types'

interface Env extends LibrarianEnv, AutoPromoteEnv {
  DB: D1Database
  AI: Ai
  NEOLOG_DEV_OPERATOR_EMAIL?: string
  // Shared with the auto-publish-cron worker. When the request carries
  // X-Cron-Secret matching this AND ?operator_id=..., we skip the
  // Cloudflare Access JWT check and impersonate that operator. Single-
  // operator app — this is fine. Set via `wrangler secret put CRON_SECRET`
  // on both the Pages project and the cron worker.
  CRON_SECRET?: string
}

// Same threshold as /api/v2/subjects (keep them aligned).
const LIBRARIAN_THRESHOLD = 5

export async function POST(req: NextRequest) { return run(req) }
export async function GET(req: NextRequest)  { return run(req) }

async function run(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  // Cron-bypass path: header-secret + operator_id query → skip Access JWT.
  let operator: { id: string } | null = null
  const cronSecret = req.headers.get('x-cron-secret')
  const operatorIdParam = new URL(req.url).searchParams.get('operator_id')
  if (cronSecret && env.CRON_SECRET && cronSecret === env.CRON_SECRET && operatorIdParam) {
    operator = { id: operatorIdParam }
  }

  if (!operator) {
    try { operator = await requireOperator(req, env) }
    catch (e) {
      if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
      throw e
    }
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

  // Sweep any vlogs flagged auto_publish_pending=1 — the post-upload
  // workflow sets this flag; this is the cron-triggerable side that
  // actually slices the clips and fires the social-fanout webhook.
  try {
    const sweep = await sweepPendingAutoPublish(env, operator.id, 3)
    summary.auto_publish_swept = sweep.swept
    summary.auto_publish_summaries = sweep.summaries
  } catch (err: any) {
    summary.auto_publish_error = err?.message || String(err)
  }

  // Work through the clip-quality judging backlog — EVERY vlog's
  // unscored clip_candidates, not just ones opted into auto-publish. This
  // is what makes /clips fill in on its own even when nobody has the page
  // open: the cron (every 10 min via workers/auto-publish-cron) calls this
  // endpoint, which chews a few more vlogs each tick.
  try {
    const backlog = await judgeClipBacklog(env as any, operator.id, { maxVlogs: 3, maxPerVlog: 8 })
    summary.clip_backlog_vlogs_processed = backlog.vlogs_processed
    summary.clip_backlog_judged = backlog.judged
  } catch (err: any) {
    summary.clip_backlog_error = err?.message || String(err)
  }

  // Work through the video vision-tagging backlog — every vlog whose
  // thumbnail exists but hasn't been visually described yet. Same shape as
  // the clip backlog above: bounded per call, drains on its own via cron.
  try {
    const visionBacklog = await visionTagVlogBacklog(env as any, operator.id, 8)
    summary.vlog_vision_tagged = visionBacklog.tagged
    summary.vlog_vision_errors = visionBacklog.errors
  } catch (err: any) {
    summary.vlog_vision_error = err?.message || String(err)
  }

  summary.elapsed_ms = Date.now() - started
  return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } })
}
