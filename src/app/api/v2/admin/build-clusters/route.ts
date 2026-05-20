/**
 * POST /api/v2/admin/build-clusters
 *
 * The first clustering engine. Groups existing threads by abstracted_topic
 * (case-insensitive) and creates one cluster per group with 3+ threads
 * spread across 2+ distinct vlogs. Idempotent — running it twice doesn't
 * create duplicates; instead it backfills existing clusters with any
 * newly-extracted threads.
 *
 * Body: { dry_run?: boolean, min_threads?: number, min_vlogs?: number }
 *   - dry_run        : if true, return what WOULD happen without writing
 *   - min_threads    : minimum threads per cluster (default 3)
 *   - min_vlogs      : minimum distinct vlogs per cluster (default 2)
 *
 * Algorithm:
 *   1. SELECT threads grouped by lower(abstracted_topic) where the group
 *      has >= min_threads threads spanning >= min_vlogs distinct vlogs
 *   2. For each group:
 *      - If a cluster with that abstracted_topic already exists for this
 *        operator: add any threads not already in cluster_threads
 *      - Otherwise: create a new cluster row + populate cluster_threads
 *   3. Compute initial ripeness_score = min(thread_count * 10, 100)
 *      so a 3-thread cluster scores 30, a 10+ thread cluster maxes at 100.
 *      (Real ripeness model can replace this later; for now we just need
 *      a non-zero number to drive the UI.)
 *
 * This is intentionally dumb. Topic-equality clustering is the floor —
 * embedding-based clustering and the cluster-cultivate / cluster-bounce
 * workflows from CLAUDE.md will replace this later. Right now the operator
 * needs to see SOMETHING in the /clusters page from their 280-vlog corpus.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { ulid } from '@/lib/ulid'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

interface Group {
  abstracted_topic: string
  abstracted_lower: string
  thread_count: number
  vlog_count: number
  avg_strength: number
  top_topic: string
  top_take: string
  thread_ids: string[]
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  let body: { dry_run?: boolean; min_threads?: number; min_vlogs?: number } = {}
  try { body = await req.json() } catch {}
  const dryRun = body.dry_run === true
  const minThreads = Math.max(2, Math.min(20, body.min_threads ?? 3))
  const minVlogs = Math.max(1, Math.min(10, body.min_vlogs ?? 2))

  const db = getDb(env)

  // Group threads by lower(abstracted_topic). Skip null/empty topics.
  // Note: COUNT(DISTINCT vlog_id) gives us the cross-vlog reach so we
  // don't form clusters from 5 threads of a single rambling vlog.
  const groupsRes = await db.prepare(
    `SELECT lower(abstracted_topic) AS abstracted_lower,
            MAX(abstracted_topic)   AS abstracted_topic,
            COUNT(*)                AS thread_count,
            COUNT(DISTINCT vlog_id) AS vlog_count,
            AVG(COALESCE(strength, 3)) AS avg_strength
       FROM threads
      WHERE operator_id = ?
        AND abstracted_topic IS NOT NULL
        AND trim(abstracted_topic) != ''
      GROUP BY lower(abstracted_topic)
      HAVING thread_count >= ? AND vlog_count >= ?
      ORDER BY thread_count DESC`,
  ).bind(operator.id, minThreads, minVlogs).all<{
    abstracted_lower: string
    abstracted_topic: string
    thread_count: number
    vlog_count: number
    avg_strength: number
  }>()

  const groupRows = groupsRes.results ?? []

  // For each group, fetch the actual thread ids + a representative
  // topic/take to seed the cluster row.
  const groups: Group[] = []
  for (const g of groupRows) {
    const tRes = await db.prepare(
      `SELECT id, topic, take, strength
         FROM threads
        WHERE operator_id = ? AND lower(abstracted_topic) = ?
        ORDER BY COALESCE(strength, 3) DESC, extracted_at DESC`,
    ).bind(operator.id, g.abstracted_lower).all<{
      id: string; topic: string; take: string | null; strength: number | null
    }>()
    const ts = tRes.results ?? []
    if (ts.length === 0) continue
    groups.push({
      abstracted_topic: g.abstracted_topic,
      abstracted_lower: g.abstracted_lower,
      thread_count: g.thread_count,
      vlog_count: g.vlog_count,
      avg_strength: g.avg_strength,
      top_topic: ts[0].topic,
      top_take: ts[0].take ?? '',
      thread_ids: ts.map(t => t.id),
    })
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      groups_found: groups.length,
      preview: groups.slice(0, 20).map(g => ({
        abstracted_topic: g.abstracted_topic,
        thread_count: g.thread_count,
        vlog_count: g.vlog_count,
        top_topic: g.top_topic,
      })),
    })
  }

  // For each group: either backfill an existing cluster or create a new one.
  let created = 0
  let updated = 0
  let threadsAdded = 0
  for (const g of groups) {
    const existing = await db.prepare(
      `SELECT id FROM clusters
        WHERE operator_id = ? AND lower(abstracted_topic) = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    ).bind(operator.id, g.abstracted_lower).first<{ id: string }>()

    let clusterId: string
    if (existing) {
      clusterId = existing.id
      // Update topic/take to the strongest thread, refresh ripeness.
      const ripeness = Math.min(g.thread_count * 10, 100)
      await db.prepare(
        `UPDATE clusters
            SET topic = ?, take = ?, ripeness_score = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
      ).bind(g.top_topic, g.top_take, ripeness, clusterId).run()
      updated++
    } else {
      clusterId = ulid()
      const ripeness = Math.min(g.thread_count * 10, 100)
      await db.prepare(
        `INSERT INTO clusters
           (id, operator_id, topic, take, abstracted_topic, state, ripeness_score)
         VALUES (?, ?, ?, ?, ?, 'forming', ?)`,
      ).bind(clusterId, operator.id, g.top_topic, g.top_take, g.abstracted_topic, ripeness).run()
      created++
    }

    // Find which threads need to be added to cluster_threads.
    // PRIMARY KEY (cluster_id, thread_id) prevents duplicates so we can
    // batch-insert with INSERT OR IGNORE.
    const existingThreadIds = await db.prepare(
      `SELECT thread_id FROM cluster_threads WHERE cluster_id = ?`,
    ).bind(clusterId).all<{ thread_id: string }>()
    const existingSet = new Set((existingThreadIds.results ?? []).map(r => r.thread_id))
    const toAdd = g.thread_ids.filter(id => !existingSet.has(id))
    for (const tid of toAdd) {
      // First-added thread is "core", rest are "supporting" by default.
      const role = existingSet.size === 0 && tid === g.thread_ids[0] ? 'core' : 'supporting'
      await db.prepare(
        `INSERT OR IGNORE INTO cluster_threads (cluster_id, thread_id, role)
         VALUES (?, ?, ?)`,
      ).bind(clusterId, tid, role).run()
      existingSet.add(tid)
      threadsAdded++
    }
  }

  return NextResponse.json({
    ok: true,
    groups_found: groups.length,
    clusters_created: created,
    clusters_updated: updated,
    threads_added: threadsAdded,
    min_threads: minThreads,
    min_vlogs: minVlogs,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
