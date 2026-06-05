/**
 * POST /api/v2/subjects/[id]/pull-clips
 *
 * The Subjects screen's "Pull clips" deliverable. Picks the strongest 3
 * threads in this subject (the cluster) that have valid transcript spans,
 * and produces a clip from each via the existing thread-level video-segment
 * pipeline. Skips clips that already exist for a given thread.
 *
 * Returns the produced/existing clip ids so the caller can display them.
 * Best-effort per-clip — if one fails (no video, transcode missing on a
 * source vlog) the others still ship.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

const MAX_CLIPS_PER_PULL = 3

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const { id: subjectId } = await ctx.params

  const db = getDb(env)
  const cluster = await findOne<{ id: string }>(
    db,
    `SELECT id FROM clusters
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    subjectId, operator.id,
  )
  if (!cluster) return NextResponse.json({ error: 'subject not found' }, { status: 404 })

  // Strongest member threads with valid transcript spans. A clip needs a
  // span — threads from older extractions without spans aren't slice-able.
  const candidates = await findMany<{
    id: string; vlog_id: string; topic: string; strength: number | null
    span_start: number | null; span_end: number | null
  }>(
    db,
    `SELECT t.id, t.vlog_id, t.topic, t.strength,
            t.transcript_span_start AS span_start,
            t.transcript_span_end   AS span_end
       FROM threads t
       JOIN cluster_threads ct ON ct.thread_id = t.id
      WHERE ct.cluster_id = ?
        AND t.operator_id = ?
        AND t.deleted_at IS NULL
        AND t.transcript_span_start IS NOT NULL
        AND t.transcript_span_end IS NOT NULL
        AND t.transcript_span_end > t.transcript_span_start
      ORDER BY COALESCE(t.strength, 3) DESC, t.extracted_at ASC
      LIMIT ?`,
    subjectId, operator.id, MAX_CLIPS_PER_PULL,
  )

  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true, clips: [],
      note: 'No threads in this subject have clip-able transcript spans yet. Re-extract a recent vlog to capture spans.',
    })
  }

  const origin = new URL(req.url).origin
  const cookie = req.headers.get('cookie') || ''

  // For each candidate, check if a clip production already exists; if so
  // return it. Otherwise create a new one via the existing productions POST.
  const results: { thread_id: string; topic: string; production_id: string; existed: boolean; error?: string }[] = []
  for (const c of candidates) {
    const existing = await findOne<{ id: string }>(
      db,
      `SELECT id FROM productions
        WHERE operator_id = ? AND production_type = 'clip'
          AND source_kind = 'thread' AND source_id = ?
        ORDER BY created_at DESC LIMIT 1`,
      operator.id, c.id,
    )
    if (existing) {
      results.push({ thread_id: c.id, topic: c.topic, production_id: existing.id, existed: true })
      continue
    }
    try {
      const r = await fetch(`${origin}/api/v2/productions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ source_kind: 'thread', source_id: c.id, production_type: 'clip' }),
      })
      const d: any = await r.json().catch(() => ({}))
      if (r.ok && d?.id) {
        results.push({ thread_id: c.id, topic: c.topic, production_id: d.id, existed: false })
      } else {
        results.push({ thread_id: c.id, topic: c.topic, production_id: '', existed: false, error: d?.error || `HTTP ${r.status}` })
      }
    } catch (err: any) {
      results.push({ thread_id: c.id, topic: c.topic, production_id: '', existed: false, error: err?.message || String(err) })
    }
  }

  return NextResponse.json({
    ok: true,
    clips: results,
    new_count: results.filter(r => r.production_id && !r.existed).length,
    existed_count: results.filter(r => r.existed).length,
    failed_count: results.filter(r => !!r.error).length,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
