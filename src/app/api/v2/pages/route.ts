/**
 * GET /api/v2/pages — the index.
 *
 * Every name, place, project and subject on the log — each one a page,
 * pointing at everything about it (`headings.html`).
 *
 * Returns them grouped the way the index groups: going on now · from before
 * · people · places. Status and span are DERIVED on read, so they cannot go
 * stale against the counts they describe.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany, findOne, run } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { type PageRow, type PageKind, PAGE_KINDS, statusFor, spanFor, bandFor } from '@/lib/pages'
import { ulid } from '@/lib/ulid'
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
  const db = await readyDb(getDb(env), 'pages')
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim().toLowerCase()
  const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') || '400', 10)))

  const rows = await findMany<PageRow & { updated_at: string }>(
    db,
    `SELECT id, name, kind, summary, summary_author, span_start, span_end,
            entry_count, visibility, named_by_system, source_ref, merged_into,
            updated_at
       FROM pages
      WHERE operator_id = ? AND deleted_at IS NULL AND merged_into IS NULL
      ORDER BY COALESCE(span_end, updated_at) DESC
      LIMIT ?`,
    operator.id, limit,
  )

  const now = new Date()
  const items = rows
    .filter(p => !q || p.name.toLowerCase().includes(q))
    .map(p => ({
      ...p,
      kind: p.kind as PageKind,
      status: statusFor(p, now),
      span: spanFor(p, now),
      band: bandFor({ kind: p.kind as PageKind, span_end: p.span_end }, now),
      href: `/page/${p.id}`,
    }))

  return NextResponse.json(
    { items, total: items.length },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * POST /api/v2/pages — make a page, because he named something.
 *
 * The only way a page comes into existence now. Seeding from `entities` and
 * the librarian's `clusters` went with the extraction engine, and nothing
 * replaced it: a page the log invented is the log deciding what matters in
 * his life.
 *
 * Everything after this attaches on its own — the name appearing in an entry
 * is what puts the entry on the page. Making it is the only act.
 */
export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = await readyDb(getDb(env), 'pages')

  const body = await req.json().catch(() => ({})) as { name?: string; kind?: string }
  const name = (body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'a page needs a name' }, { status: 400 })
  const kind = PAGE_KINDS.includes(body.kind as PageKind) ? body.kind as PageKind : 'thing'

  // A second page with the same name would split the entries between them,
  // which is the failure the merge correction exists to undo. Cheaper to
  // refuse and hand back the one that exists.
  const existing = await findOne<{ id: string; name: string }>(
    db,
    `SELECT id, name FROM pages
      WHERE operator_id = ? AND deleted_at IS NULL AND merged_into IS NULL
        AND lower(name) = lower(?)`,
    operator.id, name,
  )
  if (existing) {
    return NextResponse.json(
      { id: existing.id, name: existing.name, existed: true, href: `/page/${existing.id}` },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const id = ulid()
  await run(
    db,
    `INSERT INTO pages (id, operator_id, name, kind, named_by_system, entry_count)
     VALUES (?,?,?,?,0,0)`,
    id, operator.id, name, kind,
  )
  // He named it, so `named_by_system` is 0 and the page never says the log
  // did. Its paragraph starts empty rather than drafted.
  return NextResponse.json(
    { id, name, existed: false, href: `/page/${id}` },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
