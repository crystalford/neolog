/**
 * GET /api/v2/subjects/[id]
 *
 * One subject's detail view: the named concept + framing, all member
 * moments (threads grouped by their source vlog), and the state of each
 * deliverable (script / post / clips) — whether it's been generated yet
 * and where to go to record/ship it.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const { id } = await ctx.params
  const db = getDb(env)

  const subject = await findOne<{
    id: string
    name: string
    framing: string | null
    named_by_system: number
    representative_quote: string | null
    concept_confidence: number | null
    ripeness_score: number
    state: string
    subject_source: string | null
    updated_at: string
  }>(
    db,
    `SELECT id, topic AS name, framing, named_by_system, representative_quote,
            concept_confidence, ripeness_score, state, subject_source, updated_at
       FROM clusters
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    id, operator.id,
  )
  if (!subject) return NextResponse.json({ error: 'subject not found' }, { status: 404 })

  // Member moments (threads in this subject), with the source vlog joined.
  const moments = await findMany<{
    thread_id: string
    vlog_id: string
    vlog_title: string | null
    vlog_filename: string | null
    vlog_recorded_at: string | null
    topic: string
    take: string | null
    key_quotes: string | null
    strength: number | null
    span_start: number | null
    span_end: number | null
    role: string
  }>(
    db,
    `SELECT t.id AS thread_id, t.vlog_id, v.title AS vlog_title,
            v.original_filename AS vlog_filename,
            v.recorded_at AS vlog_recorded_at,
            t.topic, t.take, t.key_quotes, t.strength,
            t.transcript_span_start AS span_start,
            t.transcript_span_end   AS span_end,
            ct.role
       FROM cluster_threads ct
       JOIN threads t ON t.id = ct.thread_id
       JOIN vlogs   v ON v.id = t.vlog_id
      WHERE ct.cluster_id = ?
        AND t.operator_id = ?
        AND t.deleted_at IS NULL
      ORDER BY COALESCE(t.strength, 3) DESC, v.recorded_at DESC`,
    id, operator.id,
  )

  // Existing deliverables: any production with source_kind=cluster + source_id=this
  // OR clip productions whose source_id is one of our member threads.
  const threadIds = moments.map(m => m.thread_id)
  const clusterProductions = await findMany<{
    id: string; production_type: string; state: string; created_at: string
    script_text: string | null
    output_r2_key: string | null
  }>(
    db,
    `SELECT id, production_type, state, created_at, script_text, output_r2_key
       FROM productions
      WHERE operator_id = ?
        AND source_kind = 'cluster' AND source_id = ?
      ORDER BY created_at DESC`,
    operator.id, id,
  )

  let clipProductions: Array<{
    id: string; thread_id: string; state: string; created_at: string; output_r2_key: string | null
  }> = []
  if (threadIds.length > 0) {
    const placeholders = threadIds.map(() => '?').join(',')
    const rows = await findMany<{
      id: string; source_id: string; state: string; created_at: string; output_r2_key: string | null
    }>(
      db,
      `SELECT id, source_id, state, created_at, output_r2_key
         FROM productions
        WHERE operator_id = ?
          AND production_type = 'clip' AND source_kind = 'thread'
          AND source_id IN (${placeholders})
        ORDER BY created_at DESC`,
      operator.id, ...threadIds,
    )
    clipProductions = rows.map(r => ({
      id: r.id, thread_id: r.source_id, state: r.state, created_at: r.created_at, output_r2_key: r.output_r2_key,
    }))
  }

  return NextResponse.json({
    subject,
    moments,
    deliverables: {
      cluster: clusterProductions,   // script (video_essay), post (x_post), thread, article
      clips: clipProductions,
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
