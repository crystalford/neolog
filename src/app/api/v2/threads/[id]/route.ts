/**
 * GET /api/v2/threads/[id]
 *
 * Backing data for the comprehensive Thread detail page. Returns:
 *   - thread: all stored fields + parsed key_quotes / questions_raised /
 *     key_phrases, plus provenance from extraction_runs
 *   - vlog: id, filename, recorded_at, presigned playback URL, thumbnail,
 *     duration_sec (best-effort from transcript_words.end_time)
 *   - transcript_window: pre/span/post word-timestamped lines for rendering
 *     the dimmed-context + lit-span treatment from the prototype
 *   - cluster: the cluster this thread sits in (via cluster_threads JOIN)
 *   - sibling_threads: other threads in the same cluster
 *   - related_threads: same-abstracted_topic threads in OTHER vlogs
 *   - adjacent_insights: from cluster_insights of this thread's cluster
 *     (output of the cultivate pass)
 *   - entities: entity_mentions where source_kind='thread' OR fallback to
 *     entities mentioned in the parent vlog
 *   - productions_used_in: posts + productions referencing this thread
 *   - navigation: prev/next thread by extracted_at within operator's corpus
 *
 * Designed so missing data renders as empty arrays — the page handles
 * empty-state gracefully. The substrate (extraction prompt + transcript
 * span computation + entity_mentions on threads) ships in a later deploy;
 * this endpoint is forward-compatible.
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
import { presignGetUrl, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const db = getDb(env)

  // Core thread row + vlog metadata in one query. key_phrases was
  // added in migration 2026-05-20; default to NULL on old rows.
  const row = await findOne<{
    id: string
    topic: string
    take: string | null
    key_quotes: string | null
    key_phrases: string | null
    questions_raised: string | null
    register: string | null
    strength: number | null
    transcript_span_start: number | null
    transcript_span_end: number | null
    abstracted_topic: string | null
    extracted_at: string
    extraction_prompt_version: string
    run_id: string | null
    vlog_id: string
    vlog_filename: string | null
    vlog_recorded_at: string | null
    vlog_thumb_key: string | null
    vlog_r2_key: string | null
    vlog_transcoded_key: string | null
  }>(
    db,
    `SELECT t.id, t.topic, t.take, t.key_quotes, t.key_phrases, t.questions_raised, t.register,
            t.strength, t.transcript_span_start, t.transcript_span_end,
            t.abstracted_topic, t.extracted_at, t.extraction_prompt_version,
            t.run_id,
            t.vlog_id,
            v.original_filename AS vlog_filename,
            v.recorded_at AS vlog_recorded_at,
            v.thumbnail_r2_key AS vlog_thumb_key,
            v.r2_key AS vlog_r2_key,
            v.transcoded_r2_key AS vlog_transcoded_key
       FROM threads t
       JOIN vlogs v ON v.id = t.vlog_id
      WHERE t.id = ? AND t.operator_id = ? AND t.deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parseArr = <T = string>(raw: string | null, mapper: (x: any) => T = (x) => String(x) as T): T[] => {
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.map(mapper).filter(Boolean) : []
    } catch { return [] }
  }

  // best-effort wrapper so any single subquery failing doesn't 500 the page
  const safe = async <T,>(label: string, q: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await q() }
    catch (err: any) { console.warn(`[threads/[id]] ${label}: ${err?.message || err}`); return fallback }
  }

  const spanStart = row.transcript_span_start
  const spanEnd = row.transcript_span_end

  // Parallel queries for everything else. Each is independent so they
  // can run concurrently.
  const [
    extractionRun,
    clusterRow,
    siblingThreads,
    relatedThreads,
    adjacentInsights,
    entities,
    productionsUsedIn,
    transcriptWords,
    vlogDuration,
    navigation,
    presignedVideo,
    presignedThumb,
  ] = await Promise.all([
    // Provenance: model + cost from extraction_runs
    row.run_id
      ? safe('extraction_run', () => findOne<{
          model: string | null; mode: string | null
          total_items: number | null; created_at: number | null
        }>(db,
          `SELECT model, mode, total_items, created_at
             FROM extraction_runs WHERE id = ?`,
          row.run_id!,
        ), null)
      : Promise.resolve(null),

    // Cluster membership via cluster_threads (canonical) — falls back to nothing.
    safe('cluster', () => findOne<{
      id: string; topic: string; abstracted_topic: string | null
      ripeness_score: number | null; thread_count: number; role: string | null
    }>(db,
      `SELECT c.id, c.topic, c.abstracted_topic, c.ripeness_score,
              (SELECT COUNT(*) FROM cluster_threads WHERE cluster_id = c.id) AS thread_count,
              ct.role AS role
         FROM cluster_threads ct
         JOIN clusters c ON c.id = ct.cluster_id
        WHERE ct.thread_id = ? AND c.operator_id = ? AND c.deleted_at IS NULL
        LIMIT 1`,
      params.id, operator.id,
    ), null),

    // Sibling threads in the same cluster (other than self)
    safe('siblings', () => findMany<{
      id: string; topic: string; take: string | null; extracted_at: string
      strength: number | null; vlog_id: string
    }>(db,
      `SELECT t.id, t.topic, t.take, t.extracted_at, t.strength, t.vlog_id
         FROM threads t
         JOIN cluster_threads ct ON ct.thread_id = t.id
        WHERE ct.cluster_id = (SELECT cluster_id FROM cluster_threads WHERE thread_id = ? LIMIT 1)
          AND t.id != ?
          AND t.operator_id = ?
          AND t.deleted_at IS NULL
        ORDER BY t.extracted_at ASC
        LIMIT 20`,
      params.id, params.id, operator.id,
    ), []),

    // Auto-linked: same abstracted_topic, different vlog, not in same cluster.
    // (Cross-cluster pattern matches — the operator riffing on this idea
    // from another angle entirely.)
    row.abstracted_topic
      ? safe('related', () => findMany<{
          id: string; topic: string; take: string | null; abstracted_topic: string | null
          extracted_at: string; strength: number | null; vlog_id: string
        }>(db,
          `SELECT id, topic, take, abstracted_topic, extracted_at, strength, vlog_id
             FROM threads
            WHERE operator_id = ?
              AND LOWER(abstracted_topic) = LOWER(?)
              AND id != ?
              AND vlog_id != ?
              AND deleted_at IS NULL
            ORDER BY COALESCE(strength, 3) DESC, extracted_at DESC
            LIMIT 6`,
          operator.id, row.abstracted_topic, params.id, row.vlog_id,
        ), [])
      : Promise.resolve([]),

    // Adjacent insights — pulled from cluster_insights of this thread's cluster.
    // The cultivate pass writes these; if the cluster hasn't been cultivated
    // yet this is empty and the UI shows a "Run cultivate" prompt.
    safe('adjacent_insights', () => findMany<{
      kind: string; title: string | null; body: string; bounce_run_id: string | null
    }>(db,
      `SELECT kind, title, body, bounce_run_id
         FROM cluster_insights
        WHERE cluster_id = (SELECT cluster_id FROM cluster_threads WHERE thread_id = ? LIMIT 1)
        ORDER BY created_at DESC
        LIMIT 8`,
      params.id,
    ), []),

    // Entities — prefer thread-scoped mentions (source_kind='thread')
    // when they exist; otherwise fall back to all vlog entities. The
    // post-extraction hook populates entity_mentions per-thread, so new
    // threads narrow naturally to entities actually present in the
    // thread's quotes.
    safe('entities', async () => {
      const threadScoped = await findMany<{ id: string; name: string; entity_type: string; mention_count: number | null }>(
        db,
        `SELECT DISTINCT e.id, e.name, e.entity_type, e.mention_count
           FROM entity_mentions m
           JOIN entities e ON e.id = m.entity_id
          WHERE m.source_kind = 'thread' AND m.source_id = ?
            AND e.operator_id = ?
            AND e.deleted_at IS NULL
          ORDER BY COALESCE(e.mention_count, 0) DESC, e.name ASC
          LIMIT 20`,
        params.id, operator.id,
      )
      if (threadScoped.length > 0) return threadScoped
      return findMany<{ id: string; name: string; entity_type: string; mention_count: number | null }>(
        db,
        `SELECT id, name, entity_type, mention_count
           FROM entities
          WHERE vlog_id = ?
            AND operator_id = ?
            AND deleted_at IS NULL
          ORDER BY COALESCE(mention_count, 0) DESC, name ASC
          LIMIT 20`,
        row.vlog_id, operator.id,
      )
    }, []),

    // Productions / posts that reference this thread (none yet, but the
    // schema supports it via posts.source_kind='thread' source_id=thread_id).
    safe('productions_used_in', () => findMany<{
      kind: string; id: string; title: string; state: string | null
    }>(db,
      `SELECT 'post' AS kind, id, COALESCE(headline, '') AS title, state
         FROM posts
        WHERE operator_id = ? AND source_kind = 'thread' AND source_id = ?
          AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 6`,
      operator.id, params.id,
    ), []),

    // Transcript words covering pre-window (30s before span) + span + post-window (30s after).
    // If span isn't computed yet (null), we return empty.
    (spanStart != null && spanEnd != null)
      ? safe('transcript_words', () => findMany<{ word: string; start_time: number; end_time: number }>(db,
          `SELECT word, start_time, end_time FROM transcript_words
            WHERE vlog_id = ?
              AND start_time >= ? AND end_time <= ?
            ORDER BY word_index ASC
            LIMIT 1200`,
          row.vlog_id,
          Math.max(0, spanStart - 30),
          spanEnd + 30,
        ), [])
      : Promise.resolve([]),

    // Vlog duration — cheap: last transcript word's end_time.
    safe('vlog_duration', () => findOne<{ duration_sec: number | null }>(db,
      `SELECT MAX(end_time) AS duration_sec FROM transcript_words WHERE vlog_id = ?`,
      row.vlog_id,
    ), null),

    // Prev/next thread by extracted_at across the whole corpus
    safe('navigation', async () => {
      const [prev, next] = await Promise.all([
        findOne<{ id: string }>(db,
          `SELECT id FROM threads
            WHERE operator_id = ? AND deleted_at IS NULL
              AND (extracted_at < ? OR (extracted_at = ? AND id < ?))
            ORDER BY extracted_at DESC, id DESC LIMIT 1`,
          operator.id, row.extracted_at, row.extracted_at, params.id,
        ),
        findOne<{ id: string }>(db,
          `SELECT id FROM threads
            WHERE operator_id = ? AND deleted_at IS NULL
              AND (extracted_at > ? OR (extracted_at = ? AND id > ?))
            ORDER BY extracted_at ASC, id ASC LIMIT 1`,
          operator.id, row.extracted_at, row.extracted_at, params.id,
        ),
      ])
      return { prev_thread_id: prev?.id ?? null, next_thread_id: next?.id ?? null }
    }, { prev_thread_id: null, next_thread_id: null }),

    // Presigned playback URL — prefer transcoded H.264 over original (HEVC).
    safe('playback', async () => {
      const key = row.vlog_transcoded_key || row.vlog_r2_key
      if (!key) return null
      return presignGetUrl(env, key, 3600 * 4)
    }, null),

    safe('thumb', async () => {
      if (!row.vlog_thumb_key) return null
      return presignGetUrl(env, row.vlog_thumb_key, 3600 * 24)
    }, null),
  ])

  // Partition transcript_words by span / pre / post for the renderer.
  const preWords: any[] = []
  const spanWords: any[] = []
  const postWords: any[] = []
  for (const w of transcriptWords) {
    if (spanStart != null && spanEnd != null) {
      if (w.start_time < spanStart) preWords.push(w)
      else if (w.start_time >= spanStart && w.end_time <= spanEnd) spanWords.push(w)
      else postWords.push(w)
    }
  }

  return NextResponse.json({
    thread: {
      id: row.id,
      topic: row.topic,
      take: row.take || '',
      key_quotes: parseArr<string>(row.key_quotes, (x) => typeof x === 'string' ? x : (x?.text ?? '')),
      questions_raised: parseArr<string>(row.questions_raised),
      key_phrases: parseArr<string>(row.key_phrases),
      register: row.register,
      strength: row.strength,
      transcript_span_start: spanStart,
      transcript_span_end: spanEnd,
      abstracted_topic: row.abstracted_topic,
      extracted_at: row.extracted_at,
      extraction_prompt_version: row.extraction_prompt_version,
      run_id: row.run_id,
      model: extractionRun?.model ?? null,
      mode: extractionRun?.mode ?? null,
      extracted_total_items: extractionRun?.total_items ?? null,
    },
    vlog: {
      id: row.vlog_id,
      original_filename: row.vlog_filename,
      recorded_at: row.vlog_recorded_at,
      duration_sec: vlogDuration?.duration_sec ?? null,
      playback_url: presignedVideo,
      thumbnail_url: presignedThumb,
    },
    transcript_window: {
      pre_words: preWords,
      span_words: spanWords,
      post_words: postWords,
    },
    cluster: clusterRow,
    sibling_threads: siblingThreads,
    related_threads: relatedThreads,
    adjacent_insights: adjacentInsights,
    entities,
    productions_used_in: productionsUsedIn,
    navigation,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
