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
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { judgeClipBacklog } from '@/lib/clip-judge'
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
  const body = await req.json().catch(() => ({})) as { max_vlogs?: number; max_per_vlog?: number }
  const result = await judgeClipBacklog(env as any, operator.id, {
    maxVlogs: body.max_vlogs,
    maxPerVlog: body.max_per_vlog,
  })
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
