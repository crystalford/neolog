/**
 * GET /api/v2/clusters/[id]
 *
 * Comprehensive backing data for the Cluster detail page. Returns:
 *   - cluster: row + role-flagged threads + insights from the
 *     cultivate pass (kind/title/body/bounce_run_id)
 *   - composite: 5 component scores that contribute to ripeness,
 *     computed on the fly from member threads
 *   - trajectory: 7-week ripeness curve (cumulative thread count
 *     scaled to a 0-100 ripeness estimate per bin)
 *   - riff_windows: time windows where activity clustered
 *   - production_candidates: 4 output types with heuristic fit scores
 *   - connected_clusters: cousins via shared abstracted_topic OR
 *     overlapping thread membership
 *   - navigation: prev/next cluster by ripeness DESC then updated_at
 *
 * All computed fields are best-effort heuristics; the cluster
 * detail page is designed to gracefully render empty states when
 * data is sparse (new clusters, small corpora).
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

  const c = await findOne<{
    id: string; topic: string; abstracted_topic: string | null; take: string | null
    state: string; ripeness_score: number | null; form: string | null
    length_magnitude: string | null; gap_question: string | null; topic_color: string | null
    created_at: string; updated_at: string
  }>(db, `SELECT id, topic, abstracted_topic, take, state, ripeness_score, form,
                  length_magnitude, gap_question, topic_color, created_at, updated_at
            FROM clusters WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
       params.id, operator.id)
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const safe = async <T,>(label: string, q: () => Promise<T>, fb: T): Promise<T> => {
    try { return await q() }
    catch (err: any) { console.warn(`[clusters/[id]] ${label}: ${err?.message || err}`); return fb }
  }

  const [
    threadsResult,
    insightsResult,
    navigationResult,
    connectedResult,
  ] = await Promise.all([
    // Threads in this cluster, with their join role + vlog_id +
    // extracted_at so we can compute composite + trajectory.
    safe('threads', () => findMany<{
      id: string; topic: string; take: string | null; strength: number | null
      validated: number | null; questions_raised: string | null
      vlog_id: string; extracted_at: string; role: string | null
    }>(db,
      `SELECT t.id, t.topic, t.take, t.strength, t.validated, t.questions_raised,
              t.vlog_id, t.extracted_at, ct.role
         FROM threads t
         JOIN cluster_threads ct ON ct.thread_id = t.id
        WHERE ct.cluster_id = ? AND t.operator_id = ? AND t.deleted_at IS NULL
        ORDER BY t.extracted_at ASC`,
      params.id, operator.id,
    ), []),

    safe('insights', () => findMany<{
      id: string; kind: string; title: string | null; body: string
      bounce_run_id: string | null; source_label: string | null; source_url: string | null
      created_at: string
    }>(
      db,
      `SELECT id, kind, title, body, bounce_run_id, source_label, source_url, created_at
         FROM cluster_insights
        WHERE cluster_id = ?
        ORDER BY created_at DESC
        LIMIT 60`,
      params.id,
    ), []),

    // Prev/next cluster by ripeness DESC then updated_at DESC
    safe('navigation', async () => {
      const [prev, next] = await Promise.all([
        findOne<{ id: string }>(db,
          `SELECT id FROM clusters
            WHERE operator_id = ? AND deleted_at IS NULL
              AND (COALESCE(ripeness_score, 0) > ?
                OR (COALESCE(ripeness_score, 0) = ? AND updated_at > ?))
            ORDER BY ripeness_score DESC, updated_at DESC LIMIT 1`,
          operator.id, c.ripeness_score ?? 0, c.ripeness_score ?? 0, c.updated_at,
        ),
        findOne<{ id: string }>(db,
          `SELECT id FROM clusters
            WHERE operator_id = ? AND deleted_at IS NULL
              AND (COALESCE(ripeness_score, 0) < ?
                OR (COALESCE(ripeness_score, 0) = ? AND updated_at < ?))
            ORDER BY ripeness_score DESC, updated_at DESC LIMIT 1`,
          operator.id, c.ripeness_score ?? 0, c.ripeness_score ?? 0, c.updated_at,
        ),
      ])
      return { prev_cluster_id: prev?.id ?? null, next_cluster_id: next?.id ?? null }
    }, { prev_cluster_id: null, next_cluster_id: null }),

    // Connected clusters — share abstracted_topic OR share threads
    safe('connected', () => findMany<{
      id: string; topic: string; abstracted_topic: string | null
      ripeness_score: number | null; thread_count: number; shared: number
    }>(db,
      `WITH shared_threads AS (
         SELECT ct2.cluster_id, COUNT(*) AS shared
           FROM cluster_threads ct1
           JOIN cluster_threads ct2 ON ct1.thread_id = ct2.thread_id
          WHERE ct1.cluster_id = ? AND ct2.cluster_id != ?
          GROUP BY ct2.cluster_id
       )
       SELECT c.id, c.topic, c.abstracted_topic, c.ripeness_score,
              (SELECT COUNT(*) FROM cluster_threads WHERE cluster_id = c.id) AS thread_count,
              COALESCE(s.shared, 0) AS shared
         FROM clusters c
         LEFT JOIN shared_threads s ON s.cluster_id = c.id
        WHERE c.operator_id = ?
          AND c.id != ?
          AND c.deleted_at IS NULL
          AND (s.shared > 0 OR LOWER(c.abstracted_topic) = LOWER(?))
        ORDER BY shared DESC, COALESCE(c.ripeness_score, 0) DESC
        LIMIT 6`,
      params.id, params.id, operator.id, params.id, c.abstracted_topic ?? '',
    ), []),
  ])

  const threads = threadsResult
  const insights = insightsResult

  // ── Composite ripeness — 5 components, each scored 0-100 ────────
  // Cheap, transparent heuristics — replaceable by a real model later.
  const threadCount = threads.length
  const distinctVlogs = new Set(threads.map(t => t.vlog_id)).size
  const avgStrength = threadCount > 0
    ? threads.reduce((a, t) => a + (t.strength ?? 3), 0) / threadCount
    : 0
  const validatedRate = threadCount > 0
    ? threads.filter(t => t.validated === 1).length / threadCount
    : 0
  const withQuestions = threads.filter(t => {
    if (!t.questions_raised) return false
    try { const q = JSON.parse(t.questions_raised); return Array.isArray(q) && q.length > 0 }
    catch { return false }
  }).length
  const questionRate = threadCount > 0 ? withQuestions / threadCount : 0

  const composite = {
    thread_density: Math.min(100, threadCount * 8),       // 12+ threads = 100
    take_strength: Math.round(avgStrength * 20),          // 5/5 avg = 100
    voice_richness: Math.round(validatedRate * 100),      // % validated
    bounce_readiness: Math.round(questionRate * 100),     // % w/ questions
    macro_eligibility: Math.min(100, distinctVlogs * 14 + threadCount * 3), // cross-vlog reach
  }

  // ── Trajectory — bin threads by week into 7 buckets ────────────
  const trajectory = buildTrajectory(threads.map(t => t.extracted_at))
  const trajectoryDelta = trajectory.length >= 2
    ? trajectory[trajectory.length - 1] - trajectory[Math.max(0, trajectory.length - 3)]
    : 0

  // ── Riff windows — periods where >= 3 threads land within 4 days
  const riffWindows = buildRiffWindows(threads.map(t => t.extracted_at))

  // ── Production candidates — heuristic fit based on cluster form ──
  const productionCandidates = buildProductionCandidates(
    c.form,
    c.length_magnitude,
    c.ripeness_score ?? 0,
    threadCount,
  )

  return NextResponse.json({
    cluster: {
      id: c.id,
      topic: c.topic,
      abstracted_topic: c.abstracted_topic,
      take: c.take,
      state: c.state,
      ripeness_score: c.ripeness_score ?? 0,
      form: c.form,
      length_magnitude: c.length_magnitude,
      gap_question: c.gap_question,
      topic_color: c.topic_color,
      created_at: c.created_at,
      updated_at: c.updated_at,
      threads: threads.map(t => ({
        id: t.id,
        topic: t.topic,
        take: t.take || '',
        strength: t.strength,
        role: t.role ?? 'supporting',
        extracted_at: t.extracted_at,
        vlog_id: t.vlog_id,
      })),
      insights: insights.map(i => ({
        id: i.id,
        kind: i.kind,
        kind_label: kindLabel(i.kind),
        title: i.title,
        body: i.body,
        bounce_run_id: i.bounce_run_id,
        source_label: i.source_label,
        source_url: i.source_url,
        // Operator-authored notes set source_label='operator' on POST;
        // distinguishes manual notes from cultivate/bounce output.
        operator_authored: i.source_label === 'operator' || (!i.bounce_run_id && i.source_label != null),
        created_at: i.created_at,
      })),
    },
    composite,
    trajectory: {
      points: trajectory,
      delta: trajectoryDelta > 0 ? `+${Math.round(trajectoryDelta)} recently` : null,
    },
    riff_windows: riffWindows,
    production_candidates: productionCandidates,
    connected_clusters: connectedResult,
    navigation: navigationResult,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

function kindLabel(k: string): string {
  return ({
    name: 'Named concept', parallel: 'Adjacent', evidence: 'Evidence',
    framework: 'Framework', counter_position: 'Counter', gap_question: 'Open question',
  } as Record<string, string>)[k] || k
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Bin threads' extracted_at timestamps into 7 weekly buckets between
 * the earliest and latest. Each bin's value = cumulative thread count
 * scaled to 0-100 (capped at 100).
 */
function buildTrajectory(dates: string[]): number[] {
  if (dates.length < 2) {
    return dates.length === 1 ? [0, 100] : [0, 0]
  }
  const times = dates.map(d => new Date(d).getTime()).sort((a, b) => a - b)
  const first = times[0]
  const last = times[times.length - 1]
  const span = Math.max(1, last - first)
  const N_BINS = 7
  const bins = new Array(N_BINS).fill(0)
  for (const t of times) {
    const ratio = (t - first) / span
    const idx = Math.min(N_BINS - 1, Math.floor(ratio * N_BINS))
    bins[idx]++
  }
  // Cumulative
  for (let i = 1; i < N_BINS; i++) bins[i] += bins[i - 1]
  // Scale to 0-100 against expected max (10 threads = 100)
  return bins.map(v => Math.min(100, v * 10))
}

/**
 * Find dense time-windows where >= 3 threads cluster within 4 days.
 * Returns normalized 0..1 positions relative to the total span.
 */
function buildRiffWindows(dates: string[]): { start: number; end: number }[] {
  if (dates.length < 3) return []
  const times = dates.map(d => new Date(d).getTime()).sort((a, b) => a - b)
  const first = times[0]
  const last = times[times.length - 1]
  const span = Math.max(1, last - first)
  const WINDOW_MS = 4 * 24 * 60 * 60 * 1000
  const windows: { start: number; end: number }[] = []
  let i = 0
  while (i < times.length) {
    let j = i
    while (j < times.length && times[j] - times[i] <= WINDOW_MS) j++
    if (j - i >= 3) {
      windows.push({
        start: (times[i] - first) / span,
        end: (times[j - 1] - first) / span,
      })
      i = j
    } else {
      i++
    }
  }
  // Merge overlapping windows
  const merged: { start: number; end: number }[] = []
  for (const w of windows) {
    const last = merged[merged.length - 1]
    if (last && w.start <= last.end + 0.02) last.end = Math.max(last.end, w.end)
    else merged.push({ ...w })
  }
  return merged
}

/**
 * Heuristic fit scores for production candidates. The Materialize CTA
 * eventually routes to a real production engine; for now these scores
 * are visible signals to the operator about what shape the cluster
 * wants to take.
 */
function buildProductionCandidates(
  form: string | null,
  length: string | null,
  ripeness: number,
  threadCount: number,
): { name: string; sub: string; cost: string; duration_label: string; fit: number; primary?: boolean }[] {
  // Base fits, then bias by form + length + ripeness
  const fits = {
    video_essay: 50,
    x_thread: 60,
    article: 55,
    clip: 45,
  }
  if (form === 'concept_essay' || form === 'cultural_criticism') {
    fits.video_essay += 25; fits.article += 20
  }
  if (form === 'manifesto_rant' || form === 'aphoristic_probe') {
    fits.x_thread += 25
  }
  if (form === 'forensic' || form === 'reflection') {
    fits.article += 25; fits.video_essay += 15
  }
  if (length === 'extended' || length === 'mid') {
    fits.video_essay += 10; fits.article += 10
  }
  if (length === 'short' || length === 'single') {
    fits.clip += 25; fits.x_thread += 10
  }
  // More threads → essay-friendlier
  fits.video_essay += Math.min(20, threadCount * 2)
  fits.article += Math.min(15, threadCount * 1.5)
  // Ripeness bumps all of them but more for the bigger formats
  fits.video_essay += Math.round(ripeness * 0.15)
  fits.article += Math.round(ripeness * 0.10)
  fits.x_thread += Math.round(ripeness * 0.05)

  const list: { name: string; sub: string; cost: string; duration_label: string; fit: number; primary?: boolean }[] = [
    { name: 'Video essay', sub: '8-12 min · voice + b-roll',     cost: '~$2.40', duration_label: '14 min', fit: Math.min(99, fits.video_essay) },
    { name: 'X thread',    sub: '4-6 posts from key quotes',     cost: '~$0.12', duration_label: '30 s',  fit: Math.min(99, fits.x_thread) },
    { name: 'Article',     sub: '1,800 words · long form',       cost: '~$0.34', duration_label: '2 min', fit: Math.min(99, fits.article) },
    { name: 'Single clip', sub: '30 s · best moment',            cost: '~$0.02', duration_label: '8 s',  fit: Math.min(99, fits.clip) },
  ]
  // Mark the top as primary
  list.sort((a, b) => b.fit - a.fit)
  list[0].primary = true
  return list
}
