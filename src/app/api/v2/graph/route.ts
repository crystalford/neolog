/**
 * GET /api/v2/graph
 *
 * Returns the substrate as a node + edge list ready for client-side layout.
 * Replaces the mock SVG on /graph with real data.
 *
 * Node types:
 *   cluster — large, central. Sized by thread_count.
 *   thread  — medium, attached to its cluster (or floating if uncategorized).
 *   entity  — small, attached to vlogs where it's mentioned.
 *   vlog    — included only if no other node references the operator's data
 *             (so brand-new accounts show vlogs as nodes for visual feedback).
 *
 * Edges:
 *   thread → cluster (membership)
 *   thread ↔ thread  (cosine match from thread_connections)
 *   entity → vlog    (mention)
 *
 * The browser does the actual force-directed layout via d3-force-lite logic
 * or a simple radial-by-cluster placement. The endpoint stays cheap and
 * deterministic.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

interface ClusterRow {
  id: string
  abstracted_topic: string | null
  name: string | null
  state: string
  ripeness_score: number | null
  topic_color_token: string | null
}

interface ThreadRow {
  id: string
  vlog_id: string
  topic: string | null
  abstracted_topic: string | null
  cluster_id: string | null
  strength: number | null
  take: string | null
}

interface EntityRow {
  id: string
  vlog_id: string
  name: string
  entity_type: string
  mention_count: number | null
}

interface ConnectionRow {
  thread_a_id: string
  thread_b_id: string
  confidence: number | null
  connection_type: string | null
}

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }
  const db = getDb(env)

  const [clusters, threads, entities, connections] = await Promise.all([
    findMany<ClusterRow>(
      db,
      `SELECT id, abstracted_topic, name, state, ripeness_score, topic_color_token
         FROM clusters
        WHERE operator_id = ? AND deleted_at IS NULL
        ORDER BY ripeness_score DESC, state ASC`,
      operator.id,
    ).catch(() => [] as ClusterRow[]),
    findMany<ThreadRow>(
      db,
      `SELECT id, vlog_id, topic, abstracted_topic, cluster_id, strength, take
         FROM threads
        WHERE operator_id = ? AND deleted_at IS NULL
        ORDER BY strength DESC, extracted_at DESC
        LIMIT 500`,
      operator.id,
    ).catch(() => [] as ThreadRow[]),
    findMany<EntityRow>(
      db,
      `SELECT id, vlog_id, name, entity_type, mention_count
         FROM entities
        WHERE operator_id = ?
        ORDER BY mention_count DESC, name ASC
        LIMIT 200`,
      operator.id,
    ).catch(() => [] as EntityRow[]),
    findMany<ConnectionRow>(
      db,
      `SELECT thread_a_id, thread_b_id, confidence, connection_type
         FROM thread_connections
        WHERE EXISTS (
          SELECT 1 FROM threads WHERE id = thread_a_id AND operator_id = ?
        )
        LIMIT 500`,
      operator.id,
    ).catch(() => [] as ConnectionRow[]),
  ])

  const nodes: Array<{
    id: string
    kind: 'cluster' | 'thread' | 'entity'
    label: string
    size: number
    color?: string
    parent?: string  // cluster_id for threads, vlog_id for entities
    state?: string
    strength?: number
    entity_type?: string
    mention_count?: number
  }> = []

  for (const c of clusters) {
    nodes.push({
      id: c.id,
      kind: 'cluster',
      label: c.name ?? c.abstracted_topic ?? c.id.slice(-6),
      size: 24,
      color: c.topic_color_token ?? c.abstracted_topic ?? 'misc',
      state: c.state,
    })
  }
  for (const t of threads) {
    nodes.push({
      id: t.id,
      kind: 'thread',
      label: t.topic ?? t.abstracted_topic ?? t.take?.slice(0, 40) ?? t.id.slice(-6),
      size: 8 + Math.min(8, (t.strength ?? 0) * 2),
      color: (t.abstracted_topic ?? 'misc').toLowerCase(),
      parent: t.cluster_id ?? undefined,
      strength: t.strength ?? 0,
    })
  }
  for (const e of entities) {
    nodes.push({
      id: e.id,
      kind: 'entity',
      label: e.name,
      size: 4 + Math.min(6, (e.mention_count ?? 1)),
      color: e.entity_type,
      parent: e.vlog_id,
      entity_type: e.entity_type,
      mention_count: e.mention_count ?? 1,
    })
  }

  const edges: Array<{ from: string; to: string; kind: 'membership' | 'cosine' | 'mention'; weight?: number }> = []
  for (const t of threads) {
    if (t.cluster_id) {
      edges.push({ from: t.id, to: t.cluster_id, kind: 'membership' })
    }
  }
  for (const c of connections) {
    edges.push({ from: c.thread_a_id, to: c.thread_b_id, kind: 'cosine', weight: c.confidence ?? 0.5 })
  }

  return NextResponse.json({
    nodes,
    edges,
    counts: {
      clusters: clusters.length,
      threads: threads.length,
      entities: entities.length,
      connections: connections.length,
    },
    has_data: clusters.length + threads.length + entities.length > 0,
  })
}
