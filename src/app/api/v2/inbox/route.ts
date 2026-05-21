/**
 * GET /api/v2/inbox
 *
 * What needs the operator's attention — collected from across the
 * system into one triage payload. Five buckets:
 *
 *   - surfaced — surfaced_cards still undismissed (cluster_ready,
 *                adjacent_insight, gap_question, auto_link)
 *   - ripening — clusters whose ripeness_score crossed 65 but are
 *                still in 'ripening' or 'surfaced' state (ready to
 *                produce)
 *   - processing — vlogs whose pipeline_status is mid-flight
 *                (transcoding / transcribing / extracting / etc.)
 *   - failed — vlogs whose pipeline_status is failed
 *   - drafts — productions whose state is 'developing' or
 *              'materializing' (in-progress creative work)
 *
 * Each block is wrapped in try/catch so schema drift on one table
 * doesn't 500 the whole inbox.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
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

  const safe = async <T,>(label: string, q: () => Promise<T[]>): Promise<T[]> => {
    try { return await q() }
    catch (err: any) { console.warn(`[inbox] ${label}: ${err?.message || err}`); return [] }
  }

  const [surfaced, ripening, processing, failed, drafts, worthShipping, topicsHot] = await Promise.all([
    safe('surfaced', () => findMany<{
      id: string; subtype: string; body: string; body_html: string | null
      topic_color: string | null; surfaced_at: string
      cluster_id: string | null; thread_id: string | null
    }>(
      db,
      `SELECT id, subtype, body, body_html, topic_color, surfaced_at,
              cluster_id, thread_id
         FROM surfaced_cards
        WHERE operator_id = ? AND dismissed_at IS NULL
        ORDER BY surfaced_at DESC
        LIMIT 30`,
      operator.id,
    )),
    safe('ripening', () => findMany<{
      id: string; topic: string; abstracted_topic: string | null
      ripeness_score: number; state: string; thread_count: number
      gap_question: string | null
    }>(
      db,
      `SELECT c.id, c.topic, c.abstracted_topic, c.ripeness_score, c.state, c.gap_question,
              (SELECT COUNT(*) FROM cluster_threads WHERE cluster_id = c.id) AS thread_count
         FROM clusters c
        WHERE c.operator_id = ? AND c.deleted_at IS NULL
          AND c.state IN ('ripening', 'surfaced', 'ready')
          AND c.ripeness_score >= 65
        ORDER BY c.ripeness_score DESC
        LIMIT 12`,
      operator.id,
    )),
    safe('processing', () => findMany<{
      id: string; original_filename: string | null; pipeline_status: string
      recorded_at: string | null; uploaded_at: string
    }>(
      db,
      `SELECT id, original_filename, pipeline_status, recorded_at, uploaded_at
         FROM vlogs
        WHERE operator_id = ? AND deleted_at IS NULL
          AND pipeline_status IN ('uploaded','transcoding','thumbnail_pending','transcribing','extracting')
        ORDER BY uploaded_at DESC
        LIMIT 12`,
      operator.id,
    )),
    safe('failed', () => findMany<{
      id: string; original_filename: string | null; pipeline_status: string
      pipeline_error: string | null; recorded_at: string | null; uploaded_at: string
    }>(
      db,
      `SELECT id, original_filename, pipeline_status, pipeline_error, recorded_at, uploaded_at
         FROM vlogs
        WHERE operator_id = ? AND deleted_at IS NULL
          AND pipeline_status = 'failed'
        ORDER BY uploaded_at DESC
        LIMIT 12`,
      operator.id,
    )),
    safe('drafts', () => findMany<{
      id: string; name: string; tagline: string | null
      blurb: string | null; state: string; last_activity_at: string | null
    }>(
      db,
      `SELECT id, name, tagline, blurb, state, last_activity_at
         FROM projects
        WHERE operator_id = ? AND deleted_at IS NULL
          AND state IN ('developing', 'materializing')
        ORDER BY last_activity_at DESC, created_at DESC
        LIMIT 12`,
      operator.id,
    )),
    // Worth shipping — strength 4-5 threads (not b-roll) that don't
    // have a production linked yet. These are the threads the operator
    // nailed solo; quality without needing a cluster.
    safe('worth_shipping', () => findMany<{
      id: string; topic: string; abstracted_topic: string | null
      take: string | null; strength: number; extracted_at: string
      vlog_id: string
    }>(
      db,
      `SELECT t.id, t.topic, t.abstracted_topic, t.take, t.strength, t.extracted_at, t.vlog_id
         FROM threads t
         JOIN extraction_runs er ON er.id = t.run_id AND er.is_active = 1
        WHERE t.operator_id = ? AND t.deleted_at IS NULL
          AND COALESCE(t.strength, 0) >= 4
          AND NOT EXISTS (
            SELECT 1 FROM productions p
             WHERE p.source_kind = 'thread' AND p.source_id = t.id
               AND p.deleted_at IS NULL
          )
        ORDER BY t.strength DESC, t.extracted_at DESC
        LIMIT 8`,
      operator.id,
    )),
    // Topics hot — top topic_buckets in the last 30 days by thread
    // count. Surfaces what the operator's been circling lately without
    // requiring formal cluster membership.
    safe('topics_hot', () => findMany<{ topic: string; n: number }>(
      db,
      `SELECT COALESCE(abstracted_topic, topic) AS topic, COUNT(*) AS n
         FROM threads
        WHERE operator_id = ? AND deleted_at IS NULL
          AND extracted_at >= datetime('now', '-30 days')
          AND COALESCE(abstracted_topic, topic) != ''
        GROUP BY COALESCE(abstracted_topic, topic)
       HAVING n >= 2
        ORDER BY n DESC, MAX(extracted_at) DESC
        LIMIT 8`,
      operator.id,
    )),
  ])

  return NextResponse.json({
    surfaced,
    ripening,
    processing,
    failed,
    drafts,
    worth_shipping: worthShipping,
    topics_hot: topicsHot,
    counts: {
      surfaced: surfaced.length,
      ripening: ripening.length,
      processing: processing.length,
      failed: failed.length,
      drafts: drafts.length,
      worth_shipping: worthShipping.length,
      topics_hot: topicsHot.length,
      total: surfaced.length + ripening.length + processing.length + failed.length + drafts.length + worthShipping.length,
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
