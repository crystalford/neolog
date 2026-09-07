/**
 * GET /api/v2/public/facts — the dossier: what the log can state about the
 * operator, and nothing else.
 *
 * `dossier.html`: "the dated facts (updated by the log, newest first, no
 * ranking) and one sentence written by the operator (the log may draft it,
 * marked)."
 *
 * ── Where each fact comes from ────────────────────────────────────────────
 *
 * Every row here is a page the log already made, with the dates it already
 * derived. Jobs and projects come back as roles with their spans; people and
 * places as the names that recur. The one sentence is `operator.bio` — his,
 * typed by him, or absent. **The log does not draft it here.** `dossier.html`
 * allows a drafted sentence marked as drafted, but a drafted sentence about
 * a PERSON is the one place a marked guess is still a guess about someone
 * real, and there is no verbatim source to check it against the way relog
 * has one. So: his sentence or no sentence.
 *
 * "No ranking" is load-bearing (§0: the log never ranks). Roles come back in
 * date order, not importance order, and there is no score on anything.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { lastChanged } from '@/lib/machine-layer'
import { statusFor, spanFor, type PageRow } from '@/lib/pages'
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
  const db = await readyDb(getDb(env), 'facts')

  const [who, pages, span, changed] = await Promise.all([
    findOne<{ display_name: string | null; handle: string | null; bio: string | null }>(
      db, `SELECT display_name, handle, bio FROM operator WHERE id = ?`, operator.id,
    ),
    findMany<PageRow & { first_at: string | null }>(
      db,
      `SELECT id, name, kind, summary, summary_author, span_start, span_end,
              entry_count, visibility, named_by_system, source_ref, merged_into,
              span_start AS first_at
         FROM pages
        WHERE operator_id = ? AND deleted_at IS NULL AND merged_into IS NULL
          AND kind IN ('job','project','person','place')
          AND entry_count > 0
        ORDER BY COALESCE(span_start, '9999') DESC
        LIMIT 300`,
      operator.id,
    ),
    findOne<{ first_at: string | null; last_at: string | null; days: number }>(
      db,
      `SELECT MIN(COALESCE(happened_at, occurred_at, created_at)) AS first_at,
              MAX(COALESCE(happened_at, occurred_at, created_at)) AS last_at,
              COUNT(DISTINCT date(COALESCE(happened_at, occurred_at, created_at))) AS days
         FROM log_entries
        WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL`,
      operator.id,
    ),
    lastChanged(db, operator.id),
  ])

  const now = new Date()
  const withDerived = pages.map(p => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    // The log's paragraph, marked as the log's until he edits it.
    summary: p.summary,
    summary_author: p.summary_author,
    entry_count: p.entry_count ?? 0,
    // Derived on read so they cannot go stale against the counts.
    status: statusFor(p, now),
    span: spanFor(p, now),
    span_start: p.span_start,
    span_end: p.span_end,
    href: `/page/${p.id}`,
  }))

  return NextResponse.json(
    {
      person: {
        name: who?.display_name || who?.handle || null,
        handle: who?.handle || null,
        // His sentence, or none. Never the log's.
        sentence: (who?.bio || '').trim() || null,
      },
      roles: withDerived.filter(p => p.kind === 'job' || p.kind === 'project'),
      names: withDerived.filter(p => p.kind === 'person' || p.kind === 'place'),
      record: {
        first_at: span?.first_at ?? null,
        last_at: span?.last_at ?? null,
        days: span?.days ?? 0,
      },
      last_changed: changed,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
