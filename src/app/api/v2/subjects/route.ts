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
import { getDb, findMany, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { buildSubjects, type LibrarianEnv } from '@/lib/librarian'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends LibrarianEnv {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

// How many new threads since the last librarian run before we kick off
// a background rebuild on visit. Small enough to feel live; large enough
// to skip rebuilding for one stray extraction.
const STALENESS_THRESHOLD_THREADS = 5

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
    subject_kind: string | null
    pole_a: string | null
    pole_b: string | null
    pole_a_at: string | null
    pole_b_at: string | null
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
        c.subject_kind,
        c.pole_a,
        c.pole_b,
        c.pole_a_at,
        c.pole_b_at,
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
      ORDER BY
        CASE c.subject_kind
          WHEN 'tension'   THEN 0
          WHEN 'evolution' THEN 1
          WHEN 'open_loop' THEN 2
          WHEN 'candidate' THEN 4
          ELSE 3
        END,
        c.ripeness_score DESC,
        c.updated_at DESC`,
    operator.id,
  )

  // Live ingestion: count threads written after the most recent librarian
  // cluster's updated_at. If meaningfully ahead, fire a rebuild in the
  // background — the operator sees cached subjects now; the next refresh
  // has the new ones. No cron, no ambient cost: it only runs on visit.
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
  const isFirstRun = !staleness?.last_librarian_at && subjects.length === 0
  const isStale = !isFirstRun && newThreads >= STALENESS_THRESHOLD_THREADS

  if (isStale) {
    const ctx = getRequestContext()
    // waitUntil keeps the worker alive past the response so the rebuild
    // completes. Swallow errors — a failed background rebuild must NOT
    // affect the GET response.
    ctx.waitUntil(
      buildSubjects(db, operator.id, env).catch(err => {
        console.warn(`[subjects] background librarian failed: ${err?.message || err}`)
      }),
    )
  }

  return NextResponse.json({
    subjects,
    refreshing: isStale,
    new_threads_pending: newThreads,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
