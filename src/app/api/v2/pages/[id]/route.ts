/**
 * GET   /api/v2/pages/[id] — one page: the header, the log's paragraph, and
 *                            every entry under it as feed rows.
 * PATCH /api/v2/pages/[id] — rename it, edit the paragraph, change the kind,
 *                            merge it into another, or say it should not be
 *                            a page at all.
 *
 * "A page is the log filtered, not a report about a subject" (SPEC §11) — so
 * the entries come back in exactly the shape `/api/v2/log` returns, and the
 * page renders them with the same row component as the feed.
 *
 * Corrections here are the ones `wrong.html` names: rename (everything
 * attached follows), wrong kind, a page that shouldn't exist ("not a page,
 * just a thought"), and merging two the log made out of one thing. Nothing
 * is deleted — a page that shouldn't exist is buried, and its entries stay
 * exactly where they were.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany, run } from '@/lib/d1'
import { presignGetUrl, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import {
  type PageRow, type PageKind, PAGE_KINDS, statusFor, spanFor,
} from '@/lib/pages'
import {
  type LogEntry, type DatePrecision, type Visibility, type Author,
  type EntryKind, vlogSentence,
} from '@/lib/log-entry'
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

  const page = await findOne<PageRow>(
    db,
    `SELECT id, name, kind, summary, summary_author, span_start, span_end,
            entry_count, visibility, named_by_system, source_ref, merged_into
       FROM pages
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!page) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // The entries under it, newest first — the same shape the feed returns.
  const [entryRows, vlogRows] = await Promise.all([
    findMany<{
      id: string; text: string; detail: string | null
      occurred_at: string; created_at: string
      happened_at: string | null; logged_at: string | null
      date_precision: string; kind: string; visibility: string
      held_reason: string | null; author: string; source_kind: string
      vlog_id: string | null; source_ref: string | null
      duration_seconds: number | null
    }>(
      db,
      `SELECT le.id, le.text, le.detail, le.occurred_at, le.created_at,
              le.happened_at, le.logged_at, le.date_precision, le.kind,
              le.visibility, le.held_reason, le.author, le.source_kind,
              le.vlog_id, le.source_ref, le.duration_seconds
         FROM page_entries pe
         JOIN log_entries le ON le.id = pe.entry_id
        WHERE pe.page_id = ? AND pe.entry_kind = 'entry'
          AND le.operator_id = ? AND le.deleted_at IS NULL AND le.buried_at IS NULL
        ORDER BY COALESCE(le.happened_at, le.occurred_at) DESC
        LIMIT 500`,
      params.id, operator.id,
    ),
    findMany<{
      id: string; title: string | null; original_filename: string | null
      thumbnail_r2_key: string | null; thumbnail_url: string | null
      duration_seconds: number | null; recorded_at: string | null
      created_at: string; summary: string | null
    }>(
      db,
      `SELECT v.id, v.title, v.original_filename, v.thumbnail_r2_key,
              v.thumbnail_url, v.duration_seconds, v.recorded_at, v.created_at,
              v.summary
         FROM page_entries pe
         JOIN vlogs v ON v.id = pe.entry_id
        WHERE pe.page_id = ? AND pe.entry_kind = 'vlog'
          AND v.operator_id = ? AND v.deleted_at IS NULL
        ORDER BY COALESCE(v.recorded_at, v.created_at) DESC
        LIMIT 200`,
      params.id, operator.id,
    ),
  ])

  const items: LogEntry[] = entryRows.map(r => ({
    id: r.id,
    source: 'entry' as const,
    kind: (r.kind || 'said') as EntryKind,
    sentence: r.text,
    detail: r.detail,
    happened_at: r.happened_at || r.occurred_at || r.created_at,
    logged_at: r.logged_at || r.created_at,
    date_precision: (r.date_precision || 'exact') as DatePrecision,
    visibility: (r.visibility || 'public') as Visibility,
    held_reason: r.held_reason,
    author: (r.author || 'operator') as Author,
    href: `/entry/${r.id}`,
    media: [],
    duration_seconds: r.duration_seconds,
    batch_id: null,
    vlog_id: r.vlog_id,
    source_ref: r.source_ref,
    searchable: '',
  }))

  const thumbs = await Promise.all(vlogRows.map(async v => {
    if (!v.thumbnail_r2_key) return v.thumbnail_url || null
    try { return await presignGetUrl(env, v.thumbnail_r2_key, 24 * 3600) } catch { return v.thumbnail_url || null }
  }))
  vlogRows.forEach((v, i) => {
    items.push({
      id: v.id,
      source: 'vlog',
      kind: 'made',
      sentence: vlogSentence(v.duration_seconds),
      detail: (v.title && v.title !== v.original_filename ? v.title : null) || v.summary || null,
      happened_at: v.recorded_at || v.created_at,
      logged_at: v.created_at,
      date_precision: v.recorded_at ? 'exact' : 'approx',
      visibility: 'public',
      held_reason: null,
      author: 'log',
      href: `/vlog/${v.id}`,
      media: [{ kind: 'video', url: null, poster_url: thumbs[i], duration_seconds: v.duration_seconds }],
      duration_seconds: v.duration_seconds,
      batch_id: null,
      vlog_id: v.id,
      source_ref: null,
      searchable: '',
    })
  })

  items.sort((a, b) => (b.happened_at || '').localeCompare(a.happened_at || ''))

  // `idea.html` and `term.html`: what a page of a THOUGHT needs that a page
  // of a person does not — when it was first said, and every time he changed
  // his mind since. Both come from rows that already exist: the earliest
  // entry, and the revisions on anything under it.
  const changes = items.length
    ? await findMany<{
        entry_id: string; old_value: string | null; new_value: string | null; created_at: string
      }>(
        db,
        `SELECT entry_id, old_value, new_value, created_at
           FROM entry_revisions
          WHERE operator_id = ? AND field = 'text'
            AND entry_id IN (${items.filter(i => i.source === 'entry').map(() => '?').join(',') || "''"})
          ORDER BY created_at ASC LIMIT 20`,
        operator.id, ...items.filter(i => i.source === 'entry').map(i => i.id),
      )
    : []

  const oldest = items.length ? items[items.length - 1] : null

  const now = new Date()
  return NextResponse.json(
    {
      page: {
        ...page,
        status: statusFor(page, now),
        span: spanFor(page, now),
      },
      items,
      // The first time he said it, and every time he has changed it since.
      first_said: oldest
        ? { id: oldest.id, text: oldest.sentence, at: oldest.happened_at, href: oldest.href }
        : null,
      changes,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)

  const existing = await findOne<{ id: string }>(
    db, `SELECT id FROM pages WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    name?: string
    kind?: string
    summary?: string
    merge_into?: string
    not_a_page?: boolean
  }

  const sets: string[] = []
  const binds: unknown[] = []

  // Rename. Everything attached follows, because attachment is by id — the
  // old name is not a key anywhere.
  if (typeof body.name === 'string') {
    const n = body.name.trim()
    if (!n) return NextResponse.json({ error: 'a page needs a name' }, { status: 400 })
    sets.push('name = ?', 'named_by_system = 0')
    binds.push(n)
  }

  if (typeof body.kind === 'string') {
    if (!PAGE_KINDS.includes(body.kind as PageKind)) {
      return NextResponse.json({ error: 'unknown kind' }, { status: 400 })
    }
    sets.push('kind = ?')
    binds.push(body.kind)
  }

  // The paragraph becomes his the moment he edits it, and the column says so
  // — the log never shows its own words as the operator's, or the reverse.
  if (typeof body.summary === 'string') {
    sets.push('summary = ?', "summary_author = 'operator'")
    binds.push(body.summary.trim() || null)
  }

  // "Merge two if the log made one thing into two." The entries move; the
  // merged page stays as a tombstone so old links still resolve.
  if (typeof body.merge_into === 'string' && body.merge_into) {
    if (body.merge_into === params.id) {
      return NextResponse.json({ error: 'cannot merge a page into itself' }, { status: 400 })
    }
    const target = await findOne<{ id: string }>(
      db, `SELECT id FROM pages WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
      body.merge_into, operator.id,
    )
    if (!target) return NextResponse.json({ error: 'no such page to merge into' }, { status: 400 })
    await run(
      db,
      `INSERT OR IGNORE INTO page_entries (page_id, entry_kind, entry_id, attached_by)
       SELECT ?, entry_kind, entry_id, attached_by FROM page_entries WHERE page_id = ?`,
      body.merge_into, params.id,
    )
    sets.push('merged_into = ?')
    binds.push(body.merge_into)
  }

  // "Not a page, just a thought." Buried, not deleted — and the entries it
  // gathered are untouched, because a page was only ever a way of looking
  // at them.
  if (body.not_a_page) {
    sets.push('deleted_at = CURRENT_TIMESTAMP')
  }

  if (!sets.length) return NextResponse.json({ error: 'nothing to change' }, { status: 400 })
  sets.push('updated_at = CURRENT_TIMESTAMP')
  binds.push(params.id, operator.id)
  await run(db, `UPDATE pages SET ${sets.join(', ')} WHERE id = ? AND operator_id = ?`, ...binds)

  return NextResponse.json({ ok: true, id: params.id }, { headers: { 'Cache-Control': 'no-store' } })
}
