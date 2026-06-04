/**
 * GET /api/v2/subjects
 *
 * The Subjects feed — the named concepts the operator keeps returning to,
 * built by the librarian pass and stored as clusters (subject_source =
 * 'librarian'). Strongest first.
 *
 * Each subject carries: the named concept, the one-line framing, whether
 * the system named it (the operator didn't have the term), a representative
 * verbatim quote, counts (threads / vlogs), and whether a video-essay
 * script has already been generated from it.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const db = getDb(env)

  const subjects = await findMany<{
    id: string
    name: string
    framing: string | null
    named_by_system: number
    concept_confidence: number | null
    representative_quote: string | null
    ripeness_score: number
    state: string
    thread_count: number
    vlog_count: number
    production_id: string | null
  }>(
    db,
    `SELECT
        c.id,
        c.topic                              AS name,
        c.framing,
        c.named_by_system,
        c.concept_confidence,
        c.representative_quote,
        c.ripeness_score,
        c.state,
        (SELECT COUNT(*) FROM cluster_threads ct WHERE ct.cluster_id = c.id)                    AS thread_count,
        (SELECT COUNT(DISTINCT t.vlog_id)
           FROM cluster_threads ct JOIN threads t ON t.id = ct.thread_id
          WHERE ct.cluster_id = c.id)                                                           AS vlog_count,
        (SELECT p.id FROM productions p
          WHERE p.source_kind = 'cluster' AND p.source_id = c.id
            AND p.production_type = 'video_essay' AND p.operator_id = c.operator_id
          ORDER BY p.created_at DESC LIMIT 1)                                                    AS production_id
       FROM clusters c
      WHERE c.operator_id = ?
        AND c.subject_source = 'librarian'
        AND c.deleted_at IS NULL
      ORDER BY c.ripeness_score DESC, c.updated_at DESC`,
    operator.id,
  )

  return NextResponse.json({ subjects }, { headers: { 'Cache-Control': 'no-store' } })
}
