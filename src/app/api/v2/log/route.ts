/**
 * GET /api/v2/log — the log. One feed, everything in it.
 *
 * Params:
 *   order  = happened | logged   (default happened — SPEC §1)
 *   filter = all | said | did | auto | mem | pub | priv | held | buried
 *   q      = free text; matches the sentence, the detail AND the transcript
 *            of a recording, because searching text the reader cannot see is
 *            worse than no search (log.html)
 *   limit  = 1..500 (default 200)
 *   before = ISO cursor on the ordering date, for paging
 *
 * Reads `log_entries`, `vlogs` and `photos` and returns one normalised list.
 * The reasoning for reading rather than importing is in `src/lib/log-entry.ts`
 * — that's the handoff's open question #1, settled there.
 *
 * Buried rows are excluded from the feed, from search and from the count
 * (SPEC §1 — burial, not deletion). The day still shows how many it skipped,
 * which is what `buried` in the response is for.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { presignGetUrl, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import {
  type LogEntry, type FeedFilter, type DatePrecision, type Visibility,
  type Author, type EntryKind, type MediaRef,
  vlogSentence, photoSentence, matchesFilter,
} from '@/lib/log-entry'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

const SIGNED_TTL = 24 * 3600

/** Presign a batch of keys at once. Serialised awaits made /media slow. */
async function presignAll(env: Env, keys: (string | null)[]): Promise<(string | null)[]> {
  return Promise.all(keys.map(async k => {
    if (!k) return null
    try { return await presignGetUrl(env, k, SIGNED_TTL) } catch { return null }
  }))
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
  const url = new URL(req.url)
  const order = url.searchParams.get('order') === 'logged' ? 'logged' : 'happened'
  const filter = (url.searchParams.get('filter') || 'all') as FeedFilter
  const q = (url.searchParams.get('q') || '').trim().toLowerCase()
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10)))
  // Burial removes an entry from the feed, search and the counts. Asking for
  // it by name is the only way to see it — and the only way back to digging
  // one up, since the dig-up control lives on the entry's own page.
  const wantBuried = filter === 'buried'

  // Pull a generous slice from each table, merge, then cap. Each table is
  // capped at `limit` because after the merge only `limit` rows survive
  // anyway — no table can starve another out of the window.
  const [entryRows, vlogRows, photoRows, buriedRow] = await Promise.all([
    findMany<{
      id: string; text: string; detail: string | null
      occurred_at: string; created_at: string
      happened_at: string | null; logged_at: string | null
      date_precision: string; kind: string; visibility: string
      held_reason: string | null; author: string; source_kind: string
      batch_id: string | null; r2_key: string | null; mime: string | null
      duration_seconds: number | null; transcript: string | null
      link_url: string | null; original_filename: string | null
      vlog_id: string | null; source_ref: string | null
    }>(
      db,
      `SELECT id, text, detail, occurred_at, created_at, happened_at, logged_at,
              date_precision, kind, visibility, held_reason, author, source_kind,
              batch_id, r2_key, mime, duration_seconds, transcript, link_url,
              original_filename, vlog_id, source_ref
         FROM log_entries
        WHERE operator_id = ? AND deleted_at IS NULL
          AND buried_at IS ${wantBuried ? 'NOT NULL' : 'NULL'}
        ORDER BY COALESCE(${order === 'logged' ? 'logged_at, created_at' : 'happened_at, occurred_at'}) DESC
        LIMIT ?`,
      operator.id, limit,
    ),
    wantBuried ? Promise.resolve([]) : findMany<{
      id: string; title: string | null; original_filename: string | null
      thumbnail_r2_key: string | null; thumbnail_url: string | null
      duration_seconds: number | null; recorded_at: string | null
      recorded_at_source: string | null; created_at: string
      summary: string | null; vision_description: string | null
      transcript_text: string | null
    }>(
      db,
      `SELECT id, title, original_filename, thumbnail_r2_key, thumbnail_url,
              duration_seconds, recorded_at, recorded_at_source, created_at,
              summary, vision_description, transcript_text
         FROM vlogs
        WHERE operator_id = ? AND deleted_at IS NULL
        ORDER BY COALESCE(${order === 'logged' ? 'created_at' : 'recorded_at, created_at'}) DESC
        LIMIT ?`,
      operator.id, limit,
    ),
    wantBuried ? Promise.resolve([]) : findMany<{
      id: string; thumbnail_r2_key: string | null; r2_key: string
      caption: string | null; vision_description: string | null
      taken_at: string | null; created_at: string
    }>(
      db,
      `SELECT id, thumbnail_r2_key, r2_key, caption, vision_description,
              taken_at, created_at
         FROM photos
        WHERE operator_id = ? AND deleted_at IS NULL
        ORDER BY COALESCE(${order === 'logged' ? 'created_at' : 'taken_at, created_at'}) DESC
        LIMIT ?`,
      operator.id, limit,
    ),
    findMany<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM log_entries
        WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NOT NULL`,
      operator.id,
    ),
  ])

  const items: LogEntry[] = []

  // ── Typed, spoken, dropped-in entries ────────────────────────────────────
  const entryMedia = await presignAll(env, entryRows.map(r => r.r2_key))
  entryRows.forEach((r, i) => {
    const signed = entryMedia[i]
    const media: MediaRef[] = []
    if (r.r2_key) {
      const m = r.mime || ''
      media.push({
        kind: m.startsWith('image/') ? 'image'
            : m.startsWith('video/') ? 'video'
            : m.startsWith('audio/') ? 'audio' : 'file',
        url: signed,
        duration_seconds: r.duration_seconds,
        label: r.original_filename,
      })
    }
    items.push({
      id: r.id,
      source: 'entry',
      kind: (r.kind || 'said') as EntryKind,
      sentence: r.text,
      detail: r.detail,
      happened_at: r.happened_at || r.occurred_at || r.created_at,
      logged_at: r.logged_at || r.created_at || r.occurred_at,
      date_precision: (r.date_precision || 'exact') as DatePrecision,
      visibility: (r.visibility || 'public') as Visibility,
      held_reason: r.held_reason,
      author: (r.author || 'operator') as Author,
      href: `/entry/${r.id}`,
      media,
      duration_seconds: r.duration_seconds,
      batch_id: r.batch_id,
      vlog_id: r.vlog_id,
      source_ref: r.source_ref,
      searchable: [r.text, r.detail, r.transcript, r.link_url, r.original_filename]
        .filter(Boolean).join(' ').toLowerCase(),
    })
  })

  // ── Recordings ──────────────────────────────────────────────────────────
  // The sentence is the log's, composed from the file's own facts. The
  // operator's title, if there is one, sits underneath — never invented.
  const vlogThumbs = await presignAll(env, vlogRows.map(r => r.thumbnail_r2_key))
  vlogRows.forEach((v, i) => {
    const thumb = vlogThumbs[i] || v.thumbnail_url || null
    // A date the pipeline had to guess is a fuzzy date, and says so.
    const src = v.recorded_at_source || ''
    const precision: DatePrecision =
      !v.recorded_at ? 'approx'
      : src === 'upload_time' ? 'approx'
      : src === 'filename' || src === 'filename_date_only' ? 'day'
      : 'exact'
    const titled = v.title && v.title !== v.original_filename ? v.title : null
    items.push({
      id: v.id,
      source: 'vlog',
      kind: 'made',
      sentence: vlogSentence(v.duration_seconds),
      detail: titled || v.summary || v.vision_description || null,
      happened_at: v.recorded_at || v.created_at,
      logged_at: v.created_at,
      date_precision: precision,
      visibility: 'public',
      held_reason: null,
      author: 'log',
      href: `/vlog/${v.id}`,
      media: [{
        kind: 'video',
        url: null,
        poster_url: thumb,
        duration_seconds: v.duration_seconds,
        label: v.original_filename,
      }],
      duration_seconds: v.duration_seconds,
      batch_id: null,
      vlog_id: v.id,
      source_ref: null,
      // The transcript is searchable even though the row never shows it.
      searchable: [v.title, v.summary, v.vision_description, v.original_filename, v.transcript_text]
        .filter(Boolean).join(' ').toLowerCase(),
    })
  })

  // ── Photos ──────────────────────────────────────────────────────────────
  const photoThumbs = await presignAll(env, photoRows.map(p => p.thumbnail_r2_key || p.r2_key))
  photoRows.forEach((p, i) => {
    items.push({
      id: p.id,
      source: 'photo',
      kind: 'seen',
      sentence: photoSentence(1),
      // A caption the operator wrote is his. A vision description is the
      // log's, and the author field is what says so.
      detail: p.caption || p.vision_description || null,
      happened_at: p.taken_at || p.created_at,
      logged_at: p.created_at,
      date_precision: p.taken_at ? 'exact' : 'approx',
      visibility: 'public',
      held_reason: null,
      author: p.caption ? 'operator' : 'log',
      href: `/photos#${p.id}`,
      media: [{ kind: 'image', url: photoThumbs[i], label: p.caption }],
      duration_seconds: null,
      batch_id: null,
      vlog_id: null,
      source_ref: null,
      searchable: [p.caption, p.vision_description].filter(Boolean).join(' ').toLowerCase(),
    })
  })

  // ── One list ────────────────────────────────────────────────────────────
  const dateOf = (e: LogEntry) => (order === 'logged' ? e.logged_at : e.happened_at) || ''
  let list = items.filter(e => matchesFilter(e, filter))
  if (q) list = list.filter(e => e.searchable.includes(q) || e.sentence.toLowerCase().includes(q))
  list.sort((a, b) => dateOf(b).localeCompare(dateOf(a)))

  const total = list.length
  const trimmed = list.slice(0, limit)

  return NextResponse.json(
    { items: trimmed, total, order, filter, buried: buriedRow[0]?.n || 0 },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
