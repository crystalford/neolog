/**
 * POST /api/v2/clips/score-more
 *
 * Works through the judging backlog — clip_candidates that were extracted
 * but never scored by the clip-quality judge (common right after a bulk
 * upload of old vlogs, where extraction ran long before the judge existed).
 *
 * Body: { max_vlogs?: number, max_per_vlog?: number }
 *   max_vlogs     — how many distinct vlogs to judge this call (default 5)
 *   max_per_vlog  — candidates judged per vlog (default 8, same cap as
 *                   judgeUnscoredClipsForVlog's default)
 *
 * Bounded per call so a "Score more" button click stays fast (a handful of
 * seconds); the operator clicks it repeatedly (or it's called from
 * refresh-drafts) to work through hundreds of vlogs over time.
 *
 * Reuses judgeUnscoredClipsForVlog (src/lib/clip-judge.ts) — the same
 * judge the auto-publish sweep uses — so scores are consistent whichever
 * path triggers them.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { judgeUnscoredClipsForVlog } from '@/lib/clip-judge'
import type { D1Database, Ai } from '@cloudflare/workers-types'

interface Env { DB: D1Database; AI: Ai; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const body = await req.json().catch(() => ({})) as { max_vlogs?: number; max_per_vlog?: number }
  const maxVlogs = Math.max(1, Math.min(20, body.max_vlogs ?? 5))
  const maxPerVlog = Math.max(1, Math.min(20, body.max_per_vlog ?? 8))

  // Distinct vlogs carrying eligible-but-unjudged candidates, oldest queued
  // first — works through the backlog in a stable order across repeated calls.
  const vlogs = await findMany<{ vlog_id: string; oldest: string }>(
    db,
    `SELECT vlog_id, MIN(created_at) AS oldest
       FROM clip_candidates
      WHERE operator_id = ? AND deleted_at IS NULL
        AND status = 'pending' AND validated = 1
        AND clippability_score IS NULL
      GROUP BY vlog_id
      ORDER BY oldest ASC
      LIMIT ?`,
    operator.id, maxVlogs,
  )

  let judged = 0
  let errors = 0
  for (const v of vlogs) {
    try {
      const r = await judgeUnscoredClipsForVlog(env as any, operator.id, v.vlog_id, maxPerVlog)
      judged += r.judged
      errors += r.errors
    } catch (err: any) {
      console.warn(`[clips/score-more] vlog ${v.vlog_id} failed: ${err?.message || err}`)
      errors++
    }
  }

  return NextResponse.json({
    vlogs_processed: vlogs.length,
    judged,
    errors,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
