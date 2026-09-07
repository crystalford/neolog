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
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { type PageRow, type PageKind, statusFor, spanFor, bandFor } from '@/lib/pages'
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
