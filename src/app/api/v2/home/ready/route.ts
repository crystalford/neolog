/**
 * GET /api/v2/home/ready
 *
 * The "Ready to send" bottom half of the home page. A unified list of
 * production candidates the system has prepared in the background from
 * existing data — no rebuilds, pure SELECT.
 *
 * Five sources, merged into a single typed list:
 *   - Top 2 ripe SUBJECTS (librarian output, tensions/evolutions float)
 *   - Top 1 TOPIC with a finished research_brief and no production yet
 *   - Top 2 quick-video SEEDS from operator.spark_seeds_json
 *   - Most-recent UNFINISHED production (resume work)
 *
 * Each item carries a `kind` discriminator and the minimum the home card
 * needs to render: name + framing + href + a small source line.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export type ReadyItem =
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

  const [subjects, topic, resume, op] = await Promise.all([
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

  // Unfinished production gets the top slot — pick it up where you left off.
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

  // Quick-video seeds — read the cached JSON, take up to 2.
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
      // Pre-fills /topics with the seed text via query param — the page picks it up.
      href: `/topics?quick=${encodeURIComponent(String(s.seed).slice(0, 200))}`,
    })
  }

  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } })
}
