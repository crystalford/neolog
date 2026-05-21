/**
 * GET /api/v2/graph
 *
 * The graph as a visual territory. Returns:
 *   - clusters: id + name + topic + ripeness + thread count + created_at
 *   - threads: id + topic + cluster_id (from cluster_threads JOIN) +
 *     strength + take + extracted_at
 *   - entities: id + name + type + mention count + first_seen_at
 *   - connections: thread→thread links (strength + connection_type)
 *
 * Designed for client-side SVG layout (deterministic positioning by
 * hash of id so the graph doesn't shuffle on every page load) + a
 * time-lapse scrubber that filters by ts <= scrubber position.
 *
 * Previous version had two bugs: queried threads.cluster_id (always
 * NULL because build-clusters writes to cluster_threads only) and
 * referenced thread_connections.confidence (column is `strength` per
 * schema). Both fixed.
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

  const safe = async <T,>(label: string, q: () => Promise<T[]>) => {
    try { return await q() }
    catch (err: any) { console.warn(`[graph] ${label}: ${err?.message || err}`); return [] }
  }

  const [clusters, threads, entities, connections] = await Promise.all([
    safe('clusters', () => findMany<{
      id: string; abstracted_topic: string | null; topic: string
      state: string; ripeness_score: number | null
      thread_count: number; created_at: string
    }>(db,
      `SELECT c.id, c.abstracted_topic, c.topic, c.state, c.ripeness_score, c.created_at,
              (SELECT COUNT(*) FROM cluster_threads WHERE cluster_id = c.id) AS thread_count
         FROM clusters c
        WHERE c.operator_id = ? AND c.deleted_at IS NULL
        ORDER BY c.ripeness_score DESC, c.created_at DESC
        LIMIT 80`,
      operator.id,
    )),
    safe('threads', () => findMany<{
      id: string; vlog_id: string; topic: string; abstracted_topic: string | null
      cluster_id: string | null; strength: number | null; take: string | null
      extracted_at: string
    }>(db,
      `SELECT t.id, t.vlog_id, t.topic, t.abstracted_topic,
              (SELECT ct.cluster_id FROM cluster_threads ct WHERE ct.thread_id = t.id LIMIT 1) AS cluster_id,
              t.strength, t.take, t.extracted_at
         FROM threads t
        WHERE t.operator_id = ? AND t.deleted_at IS NULL
        ORDER BY t.strength DESC, t.extracted_at DESC
        LIMIT 500`,
      operator.id,
    )),
    safe('entities', () => findMany<{
      id: string; vlog_id: string; name: string; entity_type: string
      mention_count: number | null; created_at: string
    }>(db,
      `SELECT id, vlog_id, name, entity_type, mention_count, created_at
         FROM entities
        WHERE operator_id = ? AND deleted_at IS NULL
        ORDER BY mention_count DESC, name ASC
        LIMIT 200`,
      operator.id,
    )),
    safe('connections', () => findMany<{
      thread_a_id: string; thread_b_id: string
      strength: number | null; connection_type: string
    }>(db,
      `SELECT tc.thread_a_id, tc.thread_b_id, tc.strength, tc.connection_type
         FROM thread_connections tc
         JOIN threads ta ON ta.id = tc.thread_a_id
        WHERE ta.operator_id = ?
        LIMIT 500`,
      operator.id,
    )),
  ])

  return NextResponse.json({
    clusters: clusters.map(c => ({
      id: c.id,
      label: c.abstracted_topic ?? c.topic,
      topic: c.abstracted_topic ?? c.topic,
      state: c.state,
      ripeness: c.ripeness_score ?? 0,
      thread_count: c.thread_count,
      created_at: c.created_at,
    })),
    threads: threads.map(t => ({
      id: t.id,
      label: t.topic ?? t.abstracted_topic ?? (t.take ?? '').slice(0, 40),
      topic: t.abstracted_topic ?? t.topic ?? 'misc',
      cluster_id: t.cluster_id,
      vlog_id: t.vlog_id,
      strength: t.strength ?? 3,
      take: t.take ?? '',
      extracted_at: t.extracted_at,
    })),
    entities: entities.map(e => ({
      id: e.id,
      label: e.name,
      type: e.entity_type,
      mention_count: e.mention_count ?? 1,
      vlog_id: e.vlog_id,
      created_at: e.created_at,
    })),
    connections: connections.map(c => ({
      from: c.thread_a_id, to: c.thread_b_id,
      strength: c.strength ?? 0.5, type: c.connection_type,
    })),
    counts: {
      clusters: clusters.length,
      threads: threads.length,
      entities: entities.length,
      connections: connections.length,
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
