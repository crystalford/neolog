/**
 * GET /api/v2/timeline
 *
 * Returns the heterogeneous Timeline feed: vlogs, threads, clip_candidates,
 * posts, surfaced_cards, articles (productions of form 'article'). Sorted by
 * each row's relevant timestamp, descending.
 *
 * Resilience: each block's SELECT is wrapped in its own try/catch so one bad
 * table (missing column, malformed JSON, etc.) doesn't 500 the whole page.
 * The handler is also wrapped in a top-level try/catch that returns JSON with
 * the actual error message instead of an opaque 500 — saves us from "Error:
 * HTTP 500" with no diagnostic.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { presignGetUrl, type R2Env } from '@/lib/r2'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

interface TimelineCard {
  id: string
  type: 'vlog' | 'thread' | 'post' | 'clip' | 'article' | 'surfaced' | 'project_update'
  [key: string]: unknown
}

export async function GET(req: NextRequest) {
  try {
    return await handle(req)
  } catch (err: any) {
    // Top-level safety net so the client gets diagnostic info instead of an
    // opaque 500. Keeps stack trace short to avoid 4MB response cap.
    return NextResponse.json(
      {
        error: `Timeline failed: ${err?.message || String(err)}`,
        stack: err?.stack ? String(err.stack).slice(0, 800) : null,
      },
      { status: 500 },
    )
  }
}

async function handle(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try {
    operator = await requireOperator(req, env)
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }

  const db = getDb(env)
  const cards: TimelineCard[] = []
  const blockErrors: Record<string, string> = {}

  // ── Vlogs ────────────────────────────────────────────────────────────────
  // SELECT vlogs + their thread/clip counts in 3 queries total instead of
  // N+1 (which was 175 queries for 174 vlogs). Then presign all thumbnail
  // R2 keys in parallel.
  try {
    const vlogs = await findMany<{
      id: string
      original_filename: string | null
      file_size_bytes: number | null
      mime_type: string | null
      duration_seconds: number | null
      recorded_at: string | null
      recorded_at_source: string | null
      thumbnail_url: string | null
      thumbnail_r2_key: string | null
      pipeline_status: string
      uploaded_at: string
      transcript_text: string | null
    }>(
      db,
      `SELECT id, original_filename, file_size_bytes, mime_type, duration_seconds,
              recorded_at, recorded_at_source, thumbnail_url, thumbnail_r2_key,
              pipeline_status, uploaded_at, transcript_text
         FROM vlogs
        WHERE operator_id = ? AND deleted_at IS NULL
        ORDER BY recorded_at DESC, uploaded_at DESC
        LIMIT 200`,
      operator.id,
    )

    // Batched counts — two grouped queries instead of N round-trips.
    const threadCountRows = await findMany<{ vlog_id: string; n: number }>(
      db,
      `SELECT vlog_id, COUNT(*) AS n
         FROM threads
        WHERE operator_id = ? AND deleted_at IS NULL
        GROUP BY vlog_id`,
      operator.id,
    )
    const clipCountRows = await findMany<{ vlog_id: string; n: number }>(
      db,
      `SELECT vlog_id, COUNT(*) AS n
         FROM clip_candidates
        WHERE operator_id = ? AND deleted_at IS NULL
        GROUP BY vlog_id`,
      operator.id,
    )
    const threadCounts = new Map(threadCountRows.map(r => [r.vlog_id, r.n]))
    const clipCounts = new Map(clipCountRows.map(r => [r.vlog_id, r.n]))

    // Resolve thumbnails in parallel. Same three-state contract as the list
    // endpoint: R2 key (presigned) > legacy data URI > null.
    const vlogCards = await Promise.all(
      vlogs.map(async v => {
        let thumbnailUrl: string | null = v.thumbnail_url
        if (!thumbnailUrl && v.thumbnail_r2_key) {
          try { thumbnailUrl = await presignGetUrl(env, v.thumbnail_r2_key, 24 * 3600) }
          catch { /* presign needs R2 keys — leave null */ }
        }
        const wordCount = v.transcript_text ? v.transcript_text.trim().split(/\s+/).filter(Boolean).length : 0
        return {
          id: v.id,
          type: 'vlog' as const,
          recorded_at: v.recorded_at || v.uploaded_at,
          recorded_at_source: v.recorded_at_source ?? (v.recorded_at ? null : 'upload_time_default'),
          title: deriveVlogTitle(v.original_filename),
          thumbnail_url: thumbnailUrl,
          duration_seconds: v.duration_seconds,
          file_size_bytes: v.file_size_bytes,
          mime_type: v.mime_type,
          thread_count: threadCounts.get(v.id) ?? 0,
          clip_count: clipCounts.get(v.id) ?? 0,
          transcript_word_count: wordCount,
          visibility: 'private',
          pipeline_status: v.pipeline_status,
        }
      }),
    )
    for (const c of vlogCards) cards.push(c)
  } catch (err: any) {
    blockErrors.vlogs = err?.message || String(err)
    console.warn('[timeline] vlog block failed:', blockErrors.vlogs)
  }

  // ── Threads ──────────────────────────────────────────────────────────────
  try {
    const threads = await findMany<{
      id: string
      topic: string
      take: string | null
      key_quotes: string | null
      strength: number | null
      abstracted_topic: string | null
      extracted_at: string
      vlog_id: string
      transcript_span_start: number | null
      vlog_filename: string | null
    }>(
      db,
      `SELECT t.id, t.topic, t.take, t.key_quotes, t.strength, t.abstracted_topic, t.extracted_at,
              t.vlog_id, t.transcript_span_start, v.original_filename AS vlog_filename
         FROM threads t
         JOIN vlogs v ON v.id = t.vlog_id
        WHERE t.operator_id = ?
        ORDER BY t.extracted_at DESC
        LIMIT 200`,
      operator.id,
    )
    for (const t of threads) {
      const keyQuote = parseFirstQuote(t.key_quotes)
      cards.push({
        id: t.id,
        type: 'thread',
        created_at: t.extracted_at,
        topic: t.abstracted_topic || t.topic,
        abstracted_topic: t.abstracted_topic ?? undefined,
        take: t.take || '(no take extracted)',
        key_quote: keyQuote,
        strength: t.strength ?? 3,
        visibility: 'private',
        source_vlog_title: deriveVlogTitle(t.vlog_filename),
        source_timecode: t.transcript_span_start != null
          ? `${Math.floor(t.transcript_span_start / 60)}:${String(Math.floor(t.transcript_span_start % 60)).padStart(2, '0')}`
          : undefined,
      })
    }
  } catch (err: any) {
    blockErrors.threads = err?.message || String(err)
    console.warn('[timeline] thread block failed:', blockErrors.threads)
  }

  // ── Clip candidates ──────────────────────────────────────────────────────
  try {
    const clips = await findMany<{
      id: string
      start_time: number
      end_time: number
      headline: string
      quote: string | null
      status: string
      extracted_at: string
    }>(
      db,
      `SELECT id, start_time, end_time, headline, quote, status, extracted_at
         FROM clip_candidates
        WHERE operator_id = ?
        ORDER BY extracted_at DESC
        LIMIT 200`,
      operator.id,
    )
    for (const c of clips) {
      cards.push({
        id: c.id,
        type: 'clip',
        created_at: c.extracted_at,
        status: c.status === 'published' ? 'published' : 'candidate',
        start_seconds: c.start_time,
        end_seconds: c.end_time,
        quote: c.quote || c.headline,
      })
    }
  } catch (err: any) {
    blockErrors.clips = err?.message || String(err)
    console.warn('[timeline] clip block failed:', blockErrors.clips)
  }

  // ── Posts ────────────────────────────────────────────────────────────────
  try {
    const posts = await findMany<{
      id: string
      kind: string
      body: string | null
      state: string
      published_to: string | null
      engagement: string | null
      created_at: string
    }>(
      db,
      `SELECT id, kind, body, state, published_to, engagement, created_at
         FROM posts
        WHERE operator_id = ? AND state = 'published'
        ORDER BY created_at DESC
        LIMIT 100`,
      operator.id,
    )
    for (const p of posts) {
      const eng = safeJson<{ views?: number; reposts?: number; replies?: number }>(p.engagement) || {}
      cards.push({
        id: p.id,
        type: 'post',
        posted_at: p.created_at,
        platform: p.published_to || 'X',
        text: p.body || '',
        views: eng.views,
        reposts: eng.reposts,
        replies: eng.replies,
      })
    }
  } catch (err: any) {
    blockErrors.posts = err?.message || String(err)
    console.warn('[timeline] post block failed:', blockErrors.posts)
  }

  // ── Surfaced cards ───────────────────────────────────────────────────────
  try {
    const surfaced = await findMany<{
      id: string
      subtype: string
      body: string
      body_html: string | null
      topic_color: string | null
      surfaced_at: string
    }>(
      db,
      `SELECT id, subtype, body, body_html, topic_color, surfaced_at
         FROM surfaced_cards
        WHERE operator_id = ? AND dismissed_at IS NULL
        ORDER BY surfaced_at DESC
        LIMIT 50`,
      operator.id,
    )
    for (const s of surfaced) {
      cards.push({
        id: s.id,
        type: 'surfaced',
        created_at: s.surfaced_at,
        kind: s.subtype as 'cluster_ready' | 'adjacent_insight' | 'gap_question' | 'auto_link',
        body: s.body_html || s.body,
        topic: s.topic_color || undefined,
      })
    }
  } catch (err: any) {
    blockErrors.surfaced = err?.message || String(err)
    console.warn('[timeline] surfaced block failed:', blockErrors.surfaced)
  }

  // Sort the whole union by timestamp desc. Vlogs whose recorded_at_source
  // isn't a real source (mvhd / filename / pre_extracted) get demoted to the
  // bottom — they don't have a meaningful chronological position so they
  // shouldn't pretend to be from "yesterday".
  const isRealSource = (s: unknown): boolean =>
    s === 'pre_extracted' || s === 'mvhd' || s === 'filename'
  const isReal = (c: TimelineCard): boolean =>
    c.type !== 'vlog' || isRealSource(c.recorded_at_source)
  cards.sort((a, b) => {
    const aReal = isReal(a)
    const bReal = isReal(b)
    if (aReal && !bReal) return -1
    if (!aReal && bReal) return 1
    const ta = (a.recorded_at as string) || (a.posted_at as string) || (a.created_at as string) || ''
    const tb = (b.recorded_at as string) || (b.posted_at as string) || (b.created_at as string) || ''
    return tb.localeCompare(ta)
  })

  const counts = {
    all: cards.length,
    vlog: cards.filter(c => c.type === 'vlog').length,
    thread: cards.filter(c => c.type === 'thread').length,
    post: cards.filter(c => c.type === 'post').length,
    clip: cards.filter(c => c.type === 'clip').length,
    article: cards.filter(c => c.type === 'article').length,
    broll: 0,
    attachment: 0,
    surfaced: cards.filter(c => c.type === 'surfaced').length,
  }

  const response: any = { cards, counts }
  if (Object.keys(blockErrors).length > 0) {
    response.block_errors = blockErrors  // surfaced for the client / debugging
  }
  return NextResponse.json(response)
}

// ─── helpers ────────────────────────────────────────────────────────────────
function deriveVlogTitle(filename: string | null): string {
  if (!filename) return 'Untitled vlog'
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, ch => ch.toUpperCase()) || 'Untitled vlog'
}

function parseFirstQuote(raw: string | null): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) return String(parsed[0])
  } catch {}
  return null
}

function safeJson<T>(raw: string | null): T | null {
  if (!raw) return null
  try { return JSON.parse(raw) as T } catch { return null }
}
