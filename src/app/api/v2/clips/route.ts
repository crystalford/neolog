/**
 * GET /api/v2/clips
 *
 * Lists clip_candidates across ALL vlogs, ranked by clippability_score —
 * the browsable surface for "which lines from my 420 vlogs are worth
 * cutting." Each row renders as a transcript-style line: the verbatim
 * quote, the source vlog + timestamp, the judge's score/verdict, and a
 * click-to-cut action (POST /api/v2/clip-candidates/[id]/ship-as-short).
 *
 * Query params:
 *   min_score   — only rows with clippability_score >= this (default 1,
 *                 i.e. show everything that's been judged)
 *   status      — 'pending' (default) | 'approved' | 'all'
 *   limit       — default 100, max 500
 *
 * Also returns a `coverage` block — how many candidates across the
 * operator's corpus are judged vs. still waiting — so the UI can offer
 * "Score more" when there's a backlog (common after a bulk upload).
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const url = new URL(req.url)
  const minScore = Math.max(1, Math.min(5, parseInt(url.searchParams.get('min_score') || '1', 10)))
  const statusParam = url.searchParams.get('status') || 'pending'
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10)))

  const statusClause = statusParam === 'all' ? '' : `AND cc.status = ?`
  const params: any[] = statusParam === 'all'
    ? [operator.id, minScore, limit]
    : [operator.id, minScore, statusParam, limit]

  const rows = await findMany<{
    id: string; vlog_id: string; vlog_title: string | null
    vlog_recorded_at: string | null
    start_time: number; end_time: number
    headline: string; quote: string | null
    clippability_score: number | null
    clippability_verdict: string | null
    suggested_caption_hook: string | null
    status: string
    validated: number
  }>(
    db,
    `SELECT cc.id, cc.vlog_id, v.title AS vlog_title, v.recorded_at AS vlog_recorded_at,
            cc.start_time, cc.end_time, cc.headline, cc.quote,
            cc.clippability_score, cc.clippability_verdict, cc.suggested_caption_hook,
            cc.status, cc.validated
       FROM clip_candidates cc
       JOIN vlogs v ON v.id = cc.vlog_id
      WHERE cc.operator_id = ? AND cc.deleted_at IS NULL
        AND v.deleted_at IS NULL
        AND cc.clippability_score IS NOT NULL
        AND cc.clippability_score >= ?
        ${statusClause}
      ORDER BY cc.clippability_score DESC, cc.created_at DESC
      LIMIT ?`,
    ...params,
  )

  // Coverage — how much of the corpus is judged vs. waiting.
  const coverage = await findOne<{ total: number; judged: number; eligible_unjudged: number }>(
    db,
    `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN clippability_score IS NOT NULL THEN 1 ELSE 0 END) AS judged,
        SUM(CASE WHEN clippability_score IS NULL AND validated = 1
                      AND status = 'pending' THEN 1 ELSE 0 END) AS eligible_unjudged
       FROM clip_candidates
      WHERE operator_id = ? AND deleted_at IS NULL`,
    operator.id,
  )

  return NextResponse.json({
    lines: rows,
    coverage: {
      total: coverage?.total ?? 0,
      judged: coverage?.judged ?? 0,
      eligible_unjudged: coverage?.eligible_unjudged ?? 0,
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
