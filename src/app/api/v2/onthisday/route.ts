/**
 * GET /api/v2/onthisday — this date in other years.
 *
 * SPEC §1: "**Resurfacing without comment is allowed.** An old entry shown
 * again on its date — *on this day* — with nothing said about it. Shows;
 * doesn't say."
 *
 * This is the only resurfacing in the product, and the restraint is the
 * feature. `onthisday.html`: "No comment, no 'remember when', no count. The
 * way a diary falls open at a page." So this endpoint returns entries and
 * nothing else — no counts to display, no streak, no "one year ago today".
 *
 * A year with nothing on this date is reported as a year with nothing on it,
 * because "twenty-two years with nothing written down for 5 September. Not
 * because nothing happened" is a true and useful thing to see.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
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

  // Default to today, in UTC, to match how dates are stored.
  const on = url.searchParams.get('on') || new Date().toISOString().slice(5, 10)  // MM-DD
  if (!/^\d{2}-\d{2}$/.test(on)) {
    return NextResponse.json({ error: 'on must be MM-DD' }, { status: 400 })
  }
  const thisYear = new Date().getUTCFullYear()

  const rows = await findMany<{
    id: string; text: string; detail: string | null
    happened_at: string; date_precision: string; author: string
    visibility: string; source_kind: string
  }>(
    db,
    `SELECT id, text, detail,
            COALESCE(happened_at, occurred_at, created_at) AS happened_at,
            date_precision, author, visibility, source_kind
       FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
        AND substr(COALESCE(happened_at, occurred_at, created_at), 6, 5) = ?
        -- An approximate date is not a date. Showing a "this day" entry whose
        -- day the log guessed would be the log saying something it does not
        -- know, on the one surface whose whole discipline is not saying.
        AND date_precision IN ('exact', 'day')
      ORDER BY COALESCE(happened_at, occurred_at) DESC
      LIMIT 60`,
    operator.id, on,
  )

  // Group by year. Years with nothing are worth naming — a gap in the log is
  // not proof nothing happened.
  const byYear = new Map<number, typeof rows>()
  for (const r of rows) {
    const y = new Date(r.happened_at).getUTCFullYear()
    if (isNaN(y)) continue
    byYear.set(y, [...(byYear.get(y) || []), r])
  }

  const firstRow = await findMany<{ y: string }>(
    db,
    `SELECT MIN(substr(COALESCE(happened_at, occurred_at, created_at), 1, 4)) AS y
       FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL`,
    operator.id,
  )
  const firstYear = parseInt(firstRow[0]?.y || String(thisYear), 10)

  const years = Array.from(byYear.keys()).sort((a, b) => b - a).map(y => ({
    year: y,
    entries: byYear.get(y)!,
  }))

  // How many years in the log's own span have nothing on this date.
  const span = Math.max(0, thisYear - firstYear + 1)
  const empty = Math.max(0, span - years.length)

  return NextResponse.json(
    { on, years, empty_years: empty, first_year: firstYear },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
