/**
 * GET /api/v2/timeline
 *
 * Returns the heterogeneous Timeline feed: vlogs, threads, clip_candidates,
 * posts, surfaced_cards, articles (productions of form 'article'). Sorted by
 * each row's relevant timestamp, descending. Caller can filter by `type` via
 * query param but default returns all types — the client filters too.
 *
 * Each row is shaped into the TimelineCardData union the client expects.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

interface TimelineCard {
  id: string
  type: 'vlog' | 'thread' | 'post' | 'clip' | 'article' | 'surfaced' | 'project_update'
  [key: string]: unknown
}

export async function GET(req: NextRequest) {
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

  // ── Vlogs ────────────────────────────────────────────────────────────────
  const vlogs = await findMany<{
    id: string
    original_filename: string | null
    file_size_bytes: number | null
    mime_type: string | null
    duration_seconds: number | null
    recorded_at: string | null
    thumbnail_url: string | null
    pipeline_status: string
    uploaded_at: string
    transcript_text: string | null
  }>(
    db,
    `SELECT id, original_filename, file_size_bytes, mime_type, duration_seconds,
            recorded_at, thumbnail_url, pipeline_status, uploaded_at, transcript_text
       FROM vlogs
      WHERE operator_id = ? AND deleted_at IS NULL
      ORDER BY recorded_at DESC, uploaded_at DESC
      LIMIT 200`,
    operator.id,
  )
  for (const v of vlogs) {
    // Count threads + clips for this vlog
    const counts = await findMany<{ k: string; n: number }>(
      db,
      `SELECT 'thread' AS k, COUNT(*) AS n FROM threads WHERE vlog_id = ?
       UNION ALL
       SELECT 'clip' AS k, COUNT(*) AS n FROM clip_candidates WHERE vlog_id = ?`,
      v.id, v.id,
    )
    const threadCount = counts.find(c => c.k === 'thread')?.n ?? 0
    const clipCount = counts.find(c => c.k === 'clip')?.n ?? 0
    const wordCount = v.transcript_text ? v.transcript_text.trim().split(/\s+/).filter(Boolean).length : 0
    cards.push({
      id: v.id,
      type: 'vlog',
      recorded_at: v.recorded_at || v.uploaded_at,
      title: deriveVlogTitle(v.original_filename),
      thumbnail_url: v.thumbnail_url,
      duration_seconds: v.duration_seconds,
      file_size_bytes: v.file_size_bytes,
      mime_type: v.mime_type,
      thread_count: threadCount,
      clip_count: clipCount,
      transcript_word_count: wordCount,
      visibility: 'private',
      pipeline_status: v.pipeline_status,
    })
  }

  // ── Threads ──────────────────────────────────────────────────────────────
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

  // ── Clip candidates ──────────────────────────────────────────────────────
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

  // ── Posts ────────────────────────────────────────────────────────────────
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

  // ── Surfaced cards ───────────────────────────────────────────────────────
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

  // Sort the whole union by timestamp desc
  cards.sort((a, b) => {
    const ta = (a.recorded_at as string) || (a.posted_at as string) || (a.created_at as string) || ''
    const tb = (b.recorded_at as string) || (b.posted_at as string) || (b.created_at as string) || ''
    return tb.localeCompare(ta)
  })

  // Counts per type (for filter pills)
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

  return NextResponse.json({ cards, counts })
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
