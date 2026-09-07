/**
 * The fold.
 *
 * SPEC §1, design constants: **"Nothing is a flat list past about twenty —
 * fold by time, fold by heading, search first."**
 *
 * `log-2028.html` shows the same page at 4,212 entries: this week open, then
 * earlier weeks one line each, then months one line each, then years. The
 * feed has to stay the same page at four thousand entries as at four, and
 * this is what makes that true.
 *
 * It matters now rather than later because relog puts several hundred lines
 * on the log in one click. A flat reverse-chronological list of those is not
 * a record anyone can read.
 *
 * ── What a folded line is allowed to say ─────────────────────────────────
 *
 * The design's folded rows carry a written summary — "Pitched the bank and
 * lost. Spent the week talking about it in the car." That is abstractive
 * prose about a period, and under `LLM-PIPELINE.md` §9 nothing abstractive
 * is stored without a groundedness judge behind it.
 *
 * So a folded line here carries **a real entry from that period**, verbatim,
 * plus counts — not a synthesis. It is honest, it needs no model, and it is
 * more useful than a summary for finding your way back: the line you
 * remember is the one you can click.
 *
 * Writing the period summaries properly is a later step, and it needs the
 * citation machinery, not a prompt.
 */

import { findMany } from '@/lib/d1'
import type { D1Database } from '@cloudflare/workers-types'

export interface FoldBucket {
  /** 'week' | 'month' | 'year' */
  grain: 'week' | 'month' | 'year'
  /** Inclusive ISO dates, for opening the period. */
  from: string
  to: string
  /** "28 Aug – 1 Sep" · "Jul 2028" · "2011" */
  label: string
  count: number
  /** The longest thing said in that period, verbatim. Never a synthesis. */
  line: string | null
  line_entry_id: string | null
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** How far back stays open as ordinary rows. Everything older folds. */
export const OPEN_DAYS = 14

function iso(d: Date): string { return d.toISOString().slice(0, 10) }

function labelRange(from: Date, to: Date): string {
  const sameMonth = from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear()
  const a = `${from.getUTCDate()} ${MONTHS[from.getUTCMonth()]}`
  const b = sameMonth ? `${to.getUTCDate()}` : `${to.getUTCDate()} ${MONTHS[to.getUTCMonth()]}`
  return sameMonth ? `${from.getUTCDate()} – ${b} ${MONTHS[from.getUTCMonth()]}` : `${a} – ${b}`
}

/**
 * Build the folded periods older than the open window.
 *
 * Weeks for the rest of the last three months, months for the rest of the
 * year, years before that. Each grain only appears where it has something in
 * it — an empty period is not a row, it is nothing.
 */
export async function buildFold(
  db: D1Database,
  operatorId: string,
  opts: { now?: Date; order?: 'happened' | 'logged' } = {},
): Promise<FoldBucket[]> {
  const now = opts.now || new Date()
  const dateCol = opts.order === 'logged'
    ? 'COALESCE(logged_at, created_at)'
    : 'COALESCE(happened_at, occurred_at, created_at)'

  const openFrom = new Date(now.getTime() - OPEN_DAYS * 86400000)

  // One pass over the whole log, by day. Cheap, and everything below is
  // arithmetic on the result rather than more queries.
  const days = await findMany<{ d: string; n: number }>(
    db,
    `SELECT substr(${dateCol}, 1, 10) AS d, COUNT(*) AS n
       FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
        AND ${dateCol} < ?
      GROUP BY d ORDER BY d DESC`,
    operatorId, openFrom.toISOString(),
  )
  if (!days.length) return []

  const counts = new Map<string, number>()
  for (const r of days) if (r.d) counts.set(r.d, (counts.get(r.d) || 0) + r.n)

  const buckets: FoldBucket[] = []
  const oldest = new Date(`${days[days.length - 1].d}T00:00:00Z`)

  const weeksBack = new Date(now.getTime() - 90 * 86400000)
  const monthsBack = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))

  // ── Weeks, back to about three months ──────────────────────────────────
  let cursor = new Date(openFrom.getTime() - 86400000)
  while (cursor >= weeksBack && cursor >= oldest) {
    const to = new Date(cursor)
    const from = new Date(cursor.getTime() - 6 * 86400000)
    let n = 0
    for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86400000)) {
      n += counts.get(iso(d)) || 0
    }
    if (n > 0) {
      buckets.push({
        grain: 'week', from: iso(from), to: iso(to),
        label: labelRange(from, to), count: n, line: null, line_entry_id: null,
      })
    }
    cursor = new Date(from.getTime() - 86400000)
  }

  // ── Months, back to the start of this year ─────────────────────────────
  let m = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1))
  while (m >= monthsBack && m >= new Date(Date.UTC(oldest.getUTCFullYear(), oldest.getUTCMonth(), 1))) {
    const from = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), 1))
    const to = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0))
    const capped = to > cursor ? cursor : to
    let n = 0
    for (let d = new Date(from); d <= capped; d = new Date(d.getTime() + 86400000)) {
      n += counts.get(iso(d)) || 0
    }
    if (n > 0) {
      buckets.push({
        grain: 'month', from: iso(from), to: iso(capped),
        label: `${MONTHS[from.getUTCMonth()]} ${from.getUTCFullYear()}`,
        count: n, line: null, line_entry_id: null,
      })
    }
    m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() - 1, 1))
  }

  // ── Years, everything before that ──────────────────────────────────────
  const byYear = new Map<number, number>()
  for (const [d, n] of counts) {
    const y = parseInt(d.slice(0, 4), 10)
    if (isNaN(y)) continue
    if (y >= monthsBack.getUTCFullYear()) continue
    byYear.set(y, (byYear.get(y) || 0) + n)
  }
  for (const y of Array.from(byYear.keys()).sort((a, b) => b - a)) {
    buckets.push({
      grain: 'year',
      from: `${y}-01-01`, to: `${y}-12-31`,
      label: String(y), count: byYear.get(y) || 0,
      line: null, line_entry_id: null,
    })
  }

  // ── One real line per period ───────────────────────────────────────────
  // The longest thing HE said in it. Not a summary of the period — a
  // sentence out of it, so the line you remember is the one you can click.
  //
  // ONE query, not one per bucket. This runs on every load of the home page,
  // and with entries going back to 2001 there are around fifty buckets — so
  // the obvious per-bucket query was fifty round trips to D1 on the hot
  // path. The longest few hundred lines are fetched once and assigned in
  // memory instead.
  if (buckets.length) {
    const oldestNeeded = buckets[buckets.length - 1].from
    const candidates = await findMany<{ id: string; text: string; at: string }>(
      db,
      `SELECT id, text, ${dateCol} AS at
         FROM log_entries
        WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
          AND author = 'operator'
          AND ${dateCol} >= ? AND ${dateCol} < ?
        ORDER BY LENGTH(text) DESC
        LIMIT 600`,
      operatorId, `${oldestNeeded}T00:00:00.000Z`, openFrom.toISOString(),
    )

    // Longest first, so the first candidate falling inside a bucket is the
    // one that bucket wants.
    for (const b of buckets) {
      const from = `${b.from}T00:00:00.000Z`
      const to = `${b.to}T23:59:59.999Z`
      const hit = candidates.find(c => c.at >= from && c.at <= to)
      if (!hit) continue
      b.line_entry_id = hit.id
      b.line = hit.text.length > 180 ? `${hit.text.slice(0, 178)}…` : hit.text
    }
  }

  return buckets
}
