/**
 * GET /api/v2/entities/[id]
 *
 * Entity detail — name + type + aliases + total mention count +
 * timeline of mentions (timestamps across vlogs) + verbatim mentions
 * (sentence index → thread → take) + clusters appears in (via
 * thread → cluster) + productions that referenced it (via
 * creative_elements OR productions metadata, best-effort) +
 * co-mentioned entities (other entities that share at least one vlog).
 *
 * Each block wrapped in try/catch so schema drift on one table can't
 * 500 the whole detail page.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)

  const entity = await findOne<{
    id: string
    name: string
    entity_type: string
    aliases: string | null
    mention_count: number | null
    vlog_id: string
    created_at: string
  }>(
    db,
    `SELECT id, name, entity_type, aliases, mention_count, vlog_id, created_at
       FROM entities
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!entity) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const safe = async <T,>(label: string, q: () => Promise<T[]>): Promise<T[]> => {
    try { return await q() }
    catch (err: any) { console.warn(`[entity/${params.id}] ${label}: ${err?.message || err}`); return [] }
  }

  // Mentions across vlogs (timeline data).
  const mentions = await safe('mentions', () => findMany<{
    id: string
    source_kind: string
    source_id: string
    mention_time: number | null
    sentence_index: number | null
    created_at: string
  }>(db,
    `SELECT id, source_kind, source_id, mention_time, sentence_index, created_at
       FROM entity_mentions
      WHERE entity_id = ? AND operator_id = ?
      ORDER BY created_at ASC
      LIMIT 200`,
    params.id, operator.id,
  ))

  // Threads that mention this entity — join via the vlog the entity row
  // belongs to + any vlogs in entity_mentions where source_kind='vlog'.
  const vlogIds = Array.from(new Set([
    entity.vlog_id,
    ...mentions.filter(m => m.source_kind === 'vlog').map(m => m.source_id),
  ])).filter(Boolean)

  const threads = vlogIds.length === 0 ? [] : await safe('threads', () => findMany<{
    id: string
    topic: string
    take: string | null
    abstracted_topic: string | null
    strength: number | null
    extracted_at: string
    vlog_id: string
    vlog_filename: string | null
  }>(db,
    `SELECT t.id, t.topic, t.take, t.abstracted_topic, t.strength, t.extracted_at,
            t.vlog_id, v.original_filename AS vlog_filename
       FROM threads t
       JOIN vlogs v ON v.id = t.vlog_id
       JOIN extraction_runs er ON er.id = t.run_id AND er.is_active = 1
      WHERE t.vlog_id IN (${vlogIds.map(() => '?').join(',')})
        AND t.operator_id = ?
        AND t.deleted_at IS NULL
      ORDER BY t.extracted_at DESC
      LIMIT 50`,
    ...vlogIds, operator.id,
  ))

  // Clusters those threads belong to.
  const threadIds = threads.map(t => t.id)
  const clusters = threadIds.length === 0 ? [] : await safe('clusters', () => findMany<{
    id: string
    topic: string
    abstracted_topic: string | null
    ripeness_score: number | null
    thread_count: number
  }>(db,
    `SELECT DISTINCT c.id, c.topic, c.abstracted_topic, c.ripeness_score,
            (SELECT COUNT(*) FROM cluster_threads WHERE cluster_id = c.id) AS thread_count
       FROM clusters c
       JOIN cluster_threads ct ON ct.cluster_id = c.id
      WHERE ct.thread_id IN (${threadIds.map(() => '?').join(',')})
        AND c.operator_id = ?
        AND c.deleted_at IS NULL
      ORDER BY c.ripeness_score DESC
      LIMIT 20`,
    ...threadIds, operator.id,
  ))

  // Co-mentioned entities — entities that share a vlog with this one.
  const coMentions = vlogIds.length === 0 ? [] : await safe('co_mentions', () => findMany<{
    id: string
    name: string
    entity_type: string
    mention_count: number | null
    shared_vlogs: number
  }>(db,
    `SELECT e.id, e.name, e.entity_type, e.mention_count,
            COUNT(DISTINCT e.vlog_id) AS shared_vlogs
       FROM entities e
      WHERE e.vlog_id IN (${vlogIds.map(() => '?').join(',')})
        AND e.id != ?
        AND e.operator_id = ?
        AND e.deleted_at IS NULL
      GROUP BY e.id
      ORDER BY shared_vlogs DESC, e.mention_count DESC
      LIMIT 20`,
    ...vlogIds, params.id, operator.id,
  ))

  return NextResponse.json({
    entity: {
      id: entity.id,
      name: entity.name,
      type: entity.entity_type,
      aliases: parseAliases(entity.aliases),
      mention_count: entity.mention_count ?? mentions.length,
      first_seen: entity.created_at,
    },
    mentions: mentions.map(m => ({
      id: m.id,
      source_kind: m.source_kind,
      source_id: m.source_id,
      time: m.mention_time,
      sentence_index: m.sentence_index,
      at: m.created_at,
    })),
    threads,
    clusters,
    co_mentions: coMentions,
    counts: {
      mentions: mentions.length,
      threads: threads.length,
      clusters: clusters.length,
      co_mentioned: coMentions.length,
    },
  })
}

function parseAliases(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {}
  return raw.split(/[,;\|]/).map(s => s.trim()).filter(Boolean)
}
