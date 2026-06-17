/**
 * GET /api/v2/home/ready
 *
 * The "Ready to send" bottom half of the home page. A unified list of
 * production candidates the system has prepared in the background from
 * existing data — no rebuilds, pure SELECT.
 *
 * The core outputs the operator wants are shorts and long-form video
 * essays. X posts (verbatim quotes the operator can copy + ship) are
 * still produced, plus x threads / micro essays / articles / clips off
 * the same source material.
 *
 * Card kinds, in render order:
 *   - RESUME  — most recent in-flight production (script_ready /
 *               recording / producing / materializing). Top slot.
 *   - QUOTE   — verbatim strength-4/5 take from a recent thread.
 *               Primary action: copy as an X post (your own line, no
 *               LLM rewriting). Spin into a short is one tap from the
 *               thread page.
 *   - CLIP    — delivery moment the extractor flagged. Opens the source
 *               vlog scrubbed to start_time for sanity-check, then ships
 *               as a short.
 *   - SUBJECT — librarian-named concept. Video-essay seed.
 *   - TOPIC   — typed subject with a finished research_brief, no
 *               production yet.
 *   - QUICK   — cached short seed from operator.spark_seeds_json.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { sweepPendingAutoPublish, type AutoPromoteEnv } from '@/lib/auto-promote'
import type { D1Database, Ai } from '@cloudflare/workers-types'

interface Env extends AutoPromoteEnv {
  DB: D1Database
  AI: Ai
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export type ReadyItem =
  | {
      kind: 'quote'
      id: string
      quote: string
      take: string | null
      topic: string
      strength: number
      vlog_id: string
      vlog_title: string | null
      transcript_span_start: number | null
      href: string
    }
  | {
      kind: 'clip'
      id: string
      headline: string
      quote: string | null
      vlog_id: string
      vlog_title: string | null
      start_time: number
      end_time: number
      href: string
    }
  | {
      kind: 'subject'
      id: string
      name: string
      framing: string | null
      subject_kind: string | null
      thread_count: number
      vlog_count: number
      href: string
      production_id: string | null
    }
  | {
      kind: 'topic'
      id: string
      title: string
      framing: string | null
      href: string
      production_id: string | null
    }
  | {
      kind: 'quick_video'
      seed: string
      why: string | null
      href: string
    }
  | {
      kind: 'resume'
      id: string
      title: string
      state: string
      production_type: string
      href: string
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

  const safe = async <T,>(label: string, q: () => Promise<T[]>): Promise<T[]> => {
    try { return await q() }
    catch (err: any) { console.warn(`[home/ready] ${label}: ${err?.message || err}`); return [] }
  }
  const safeOne = async <T,>(label: string, q: () => Promise<T | null>): Promise<T | null> => {
    try { return await q() }
    catch (err: any) { console.warn(`[home/ready] ${label}: ${err?.message || err}`); return null }
  }

  const [quotes, clips, subjects, topic, resume, op] = await Promise.all([
    // Strength 4-5 threads with a usable verbatim quote. Skip ones already
    // wrapped into a production. The verbatim is the magic: it's the
    // operator's own line, no LLM in the loop, ready to copy as an X
    // post or wrap into a short.
    safe('quotes', () => findMany<{
      id: string; topic: string; take: string | null
      key_quotes: string | null; strength: number
      vlog_id: string; vlog_title: string | null
      transcript_span_start: number | null; extracted_at: string
    }>(
      db,
      `SELECT t.id, t.topic, t.take, t.key_quotes, t.strength,
              t.vlog_id, v.title AS vlog_title,
              t.transcript_span_start, t.extracted_at
         FROM threads t
         JOIN extraction_runs er ON er.id = t.run_id AND er.is_active = 1
         JOIN vlogs v ON v.id = t.vlog_id
        WHERE t.operator_id = ? AND t.deleted_at IS NULL
          AND COALESCE(t.strength, 0) >= 4
          AND COALESCE(t.key_quotes, '') != ''
          AND NOT EXISTS (
            SELECT 1 FROM productions p
             WHERE p.source_kind = 'thread' AND p.source_id = t.id
               AND p.deleted_at IS NULL
          )
        ORDER BY t.strength DESC, t.extracted_at DESC
        LIMIT 3`,
      operator.id,
    )),
    // Pending clip candidates — flagged delivery moments. Each is a short
    // wrapped in the operator's own footage; one tap to ship.
    safe('clips', () => findMany<{
      id: string; headline: string; quote: string | null
      vlog_id: string; vlog_title: string | null
      start_time: number; end_time: number
    }>(
      db,
      `SELECT cc.id, cc.headline, cc.quote,
              cc.vlog_id, v.title AS vlog_title,
              cc.start_time, cc.end_time
         FROM clip_candidates cc
         JOIN vlogs v ON v.id = cc.vlog_id
        WHERE cc.operator_id = ? AND cc.deleted_at IS NULL
          AND cc.status = 'pending'
        ORDER BY cc.created_at DESC
        LIMIT 2`,
      operator.id,
    )),
    safe('subjects', () => findMany<{
      id: string; name: string; framing: string | null
      subject_kind: string | null
      thread_count: number; vlog_count: number
      production_id: string | null
    }>(
      db,
      `SELECT
          c.id,
          c.topic AS name,
          c.framing,
          c.subject_kind,
          (SELECT COUNT(*) FROM cluster_threads ct WHERE ct.cluster_id = c.id) AS thread_count,
          (SELECT COUNT(DISTINCT t.vlog_id)
             FROM cluster_threads ct JOIN threads t ON t.id = ct.thread_id
            WHERE ct.cluster_id = c.id) AS vlog_count,
          (SELECT p.id FROM productions p
            WHERE p.source_kind = 'cluster' AND p.source_id = c.id
              AND p.production_type = 'video_essay' AND p.operator_id = c.operator_id
              AND p.deleted_at IS NULL
            ORDER BY p.created_at DESC LIMIT 1) AS production_id
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
          c.updated_at DESC
        LIMIT 2`,
      operator.id,
    )),
    safeOne('topic', () => findOne<{
      id: string; title: string; framing: string | null
    }>(
      db,
      `SELECT t.id, t.title, t.framing
         FROM topics t
        WHERE t.operator_id = ? AND t.deleted_at IS NULL
          AND t.state != 'spark'
          AND COALESCE(t.research_brief, '') != ''
          AND NOT EXISTS (
            SELECT 1 FROM productions p
             WHERE p.source_kind = 'topic' AND p.source_id = t.id
               AND p.deleted_at IS NULL
          )
        ORDER BY t.updated_at DESC
        LIMIT 1`,
      operator.id,
    )),
    safeOne('resume', () => findOne<{
      id: string; title: string | null; state: string; production_type: string
    }>(
      db,
      `SELECT id, title, state, production_type
         FROM productions
        WHERE operator_id = ? AND deleted_at IS NULL
          AND state IN ('script_ready', 'recording', 'producing', 'materializing')
        ORDER BY updated_at DESC
        LIMIT 1`,
      operator.id,
    )),
    safeOne('op', () => findOne<{ spark_seeds_json: string | null }>(
      db, `SELECT spark_seeds_json FROM operator WHERE id = ?`, operator.id,
    )),
  ])

  const items: ReadyItem[] = []

  if (resume) {
    items.push({
      kind: 'resume',
      id: resume.id,
      title: resume.title || '(untitled)',
      state: resume.state,
      production_type: resume.production_type,
      href: `/production/${resume.id}`,
    })
  }

  for (const q of quotes) {
    const verbatim = pickQuote(q.key_quotes) || q.take || ''
    if (!verbatim) continue
    items.push({
      kind: 'quote',
      id: q.id,
      quote: verbatim,
      take: q.take,
      topic: q.topic,
      strength: q.strength,
      vlog_id: q.vlog_id,
      vlog_title: q.vlog_title,
      transcript_span_start: q.transcript_span_start,
      href: `/thread/${q.id}`,
    })
  }

  for (const c of clips) {
    items.push({
      kind: 'clip',
      id: c.id,
      headline: c.headline,
      quote: c.quote,
      vlog_id: c.vlog_id,
      vlog_title: c.vlog_title,
      start_time: c.start_time,
      end_time: c.end_time,
      href: `/vlog/${c.vlog_id}?t=${Math.floor(c.start_time)}`,
    })
  }

  for (const s of subjects) {
    items.push({
      kind: 'subject',
      id: s.id,
      name: s.name,
      framing: s.framing,
      subject_kind: s.subject_kind,
      thread_count: s.thread_count,
      vlog_count: s.vlog_count,
      production_id: s.production_id,
      href: s.production_id ? `/production/${s.production_id}` : `/subjects/${s.id}`,
    })
  }

  if (topic) {
    items.push({
      kind: 'topic',
      id: topic.id,
      title: topic.title,
      framing: topic.framing,
      production_id: null,
      href: `/topics/${topic.id}`,
    })
  }

  let seeds: { seed: string; spark_why?: string }[] = []
  if (op?.spark_seeds_json) {
    try {
      const parsed = JSON.parse(op.spark_seeds_json)
      if (Array.isArray(parsed)) seeds = parsed
    } catch {}
  }
  for (const s of seeds.slice(0, 2)) {
    if (!s?.seed) continue
    items.push({
      kind: 'quick_video',
      seed: String(s.seed).trim(),
      why: s.spark_why ? String(s.spark_why).trim() : null,
      href: `/topics?quick=${encodeURIComponent(String(s.seed).slice(0, 200))}`,
    })
  }

  // Background: if any vlogs are flagged auto_publish_pending=1, run the
  // auto-promote sweep in waitUntil so the home-page response isn't
  // blocked. Visits to the home page effectively act as a heartbeat for
  // the publish queue.
  try {
    const ctx = getRequestContext()
    ctx.waitUntil(
      sweepPendingAutoPublish(env, operator.id, 3).catch(err => {
        console.warn(`[home/ready] sweep failed: ${err?.message || err}`)
      }),
    )
  } catch {}

  // Auto-published ribbon: recent clip-productions (last 7 days) tied to
  // a clip_candidate source. The ribbon component shows e.g. "Posted 3
  // clips from yesterday's vlog → review" so the operator gets feedback
  // without ever pressing approve.
  const recentAutoShipped = await safe('recent_auto_shipped', () => findMany<{
    id: string; produced_at: string; headline: string | null; vlog_id: string | null
  }>(
    db,
    `SELECT p.id, p.produced_at,
            json_extract(p.output_metadata, '$.headline') AS headline,
            json_extract(p.output_metadata, '$.source_vlog_id') AS vlog_id
       FROM productions p
      WHERE p.operator_id = ?
        AND p.source_kind = 'clip_candidate'
        AND p.deleted_at IS NULL
        AND p.produced_at >= datetime('now', '-7 days')
      ORDER BY p.produced_at DESC
      LIMIT 10`,
    operator.id,
  ))

  return NextResponse.json({
    items,
    auto_shipped_recent: recentAutoShipped,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

/**
 * key_quotes is a JSON array of strings in the canonical shape. Some old
 * rows are stored as raw strings. Pick the longest readable line.
 */
function pickQuote(raw: string | null): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const candidates = parsed.map(x => String(x ?? '').trim()).filter(s => s.length >= 12)
      candidates.sort((a, b) => b.length - a.length)
      return candidates[0] || null
    }
    if (typeof parsed === 'string' && parsed.trim().length >= 12) return parsed.trim()
  } catch {
    if (raw.trim().length >= 12) return raw.trim()
  }
  return null
}
