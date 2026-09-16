/**
 * A month, as a place.
 *
 * `month.html` is the reduction mechanic given somewhere to live: the month
 * in one paragraph, written by the log from that month's entries, with the
 * entries under it. The rule printed directly beneath the paragraph is what
 * makes it safe:
 *
 *   "Every sentence above points at entries below. Nothing in it is from
 *    outside the month."
 *
 * So this file enforces both halves in code, the same way `search.ts` does:
 *
 *   - The model is given ONLY that month's entries, numbered. It cannot
 *     reach anything outside the month because it is never shown anything
 *     outside the month.
 *   - Every sentence it writes must carry a citation, and every citation
 *     must name an entry that was actually sent. Sentences that fail are
 *     dropped before the paragraph is stored — never before it is checked.
 *
 * And once the operator edits the paragraph it is his: `author` flips to
 * `operator` and the log stops rewriting it. A record that silently replaces
 * what the person wrote is not a record.
 */

import { findMany, findOne, run } from '@/lib/d1'
import { callReasoning } from '@/lib/models'
import type { D1Database } from '@cloudflare/workers-types'

export interface MonthEntry {
  id: string
  text: string
  detail: string | null
  happened_at: string
  author: string
  visibility: string
  kind: string
}

export interface MonthView {
  ym: string
  label: string
  entries: MonthEntry[]
  /** Day of month -> how many entries. */
  days: Record<number, number>
  /**
   * Per day: how much was said, whether any of it is public, whether any of
   * it is a question. `month.html` draws the month week by week and colours
   * each day by these, so they are counted from the entries already loaded
   * rather than asked for again.
   */
  by_day: Record<number, { n: number; pub: boolean; q: boolean }>
  /**
   * Entries per month across the whole year — `month.html`'s "zoom out one
   * level: the year is the same shape". One grouped query, not twelve; the
   * same lesson the fold learned when it ran one per bucket.
   */
  year: Record<number, number>
  days_with_something: number
  days_in_month: number
  public_count: number
  summary: string | null
  summary_author: 'log' | 'operator'
  /** entry ids in citation order, so [n] can be resolved to a row. */
  cited: string[]
  /** True when entries have landed since the paragraph was written. */
  stale: boolean
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return ym
  return `${MONTHS[m - 1]} ${y}`
}

export function isValidYm(ym: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(ym)) return false
  const m = parseInt(ym.slice(5), 10)
  return m >= 1 && m <= 12
}

function boundsFor(ym: string): { from: string; to: string; days: number } {
  const [y, m] = ym.split('-').map(Number)
  const from = new Date(Date.UTC(y, m - 1, 1)).toISOString()
  const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)).toISOString()
  return { from, to, days: new Date(Date.UTC(y, m, 0)).getUTCDate() }
}

export async function loadMonth(
  db: D1Database,
  operatorId: string,
  ym: string,
): Promise<MonthView> {
  const { from, to, days: daysInMonth } = boundsFor(ym)

  const entries = await findMany<MonthEntry>(
    db,
    `SELECT id, text, detail,
            COALESCE(happened_at, occurred_at, created_at) AS happened_at,
            author, visibility, kind
       FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
        AND COALESCE(happened_at, occurred_at, created_at) >= ?
        AND COALESCE(happened_at, occurred_at, created_at) <= ?
      ORDER BY COALESCE(happened_at, occurred_at) DESC
      LIMIT 400`,
    operatorId, from, to,
  )

  const days: Record<number, number> = {}
  const by_day: Record<number, { n: number; pub: boolean; q: boolean }> = {}
  for (const e of entries) {
    const d = new Date(e.happened_at).getUTCDate()
    if (isNaN(d)) continue
    days[d] = (days[d] || 0) + 1
    const cell = by_day[d] || (by_day[d] = { n: 0, pub: false, q: false })
    cell.n++
    if (e.visibility === 'public') cell.pub = true
    // A question is an entry ending in `?` — the same rule `/asks` uses, and
    // the only one that needs no model. Whether it was ANSWERED needs the
    // `led_from` join `/asks` does; the month marks only that one was asked,
    // which is what the design's swatch says.
    if (e.text.trim().endsWith('?')) cell.q = true
  }

  const yearRows = await findMany<{ m: string; n: number }>(
    db,
    `SELECT substr(COALESCE(happened_at, occurred_at, created_at), 6, 2) AS m,
            COUNT(*) AS n
       FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
        AND substr(COALESCE(happened_at, occurred_at, created_at), 1, 4) = ?
      GROUP BY m`,
    operatorId, ym.slice(0, 4),
  )
  const year: Record<number, number> = {}
  for (const r of yearRows) {
    const m = parseInt(r.m, 10)
    if (m >= 1 && m <= 12) year[m] = r.n
  }

  const stored = await findOne<{
    summary: string | null; cited_json: string | null
    author: string; built_from: number
  }>(
    db,
    `SELECT summary, cited_json, author, built_from FROM month_summaries
      WHERE operator_id = ? AND ym = ?`,
    operatorId, ym,
  )

  let cited: string[] = []
  try { cited = JSON.parse(stored?.cited_json || '[]') } catch {}

  return {
    ym,
    label: monthLabel(ym),
    entries,
    days,
    by_day,
    year,
    days_with_something: Object.keys(days).length,
    days_in_month: daysInMonth,
    public_count: entries.filter(e => e.visibility === 'public').length,
    summary: stored?.summary || null,
    summary_author: (stored?.author === 'operator' ? 'operator' : 'log'),
    cited,
    // The paragraph was written from fewer entries than are here now.
    stale: !!stored?.summary
      && stored.author !== 'operator'
      && entries.length > (stored.built_from || 0),
  }
}

const SYSTEM = `You write one paragraph about one month of a person's own log, from that month's entries and nothing else.

Rules, and they are absolute:
- Every sentence ends with one or more citations in square brackets: [1], [2], [3][7]. A sentence you cannot cite is a sentence you do not write.
- Never cite a number you were not given.
- Use ONLY what is in the entries. No background, no inference about why he did something, no judgement about whether anything was good.
- Second person, past tense. "You started at Ancaster on the 31st."
- Say what the month was actually about, then the other things in it, then what was thin or missing if that is visible in the entries.
- Plain sentences. Subject, verb, object. No "isn't X — it's Y" constructions, no headlines, no hedged verbs like "ended up" or "worked out".
- One paragraph. Six sentences at most. No preamble, no title.`

/**
 * Write the month's paragraph, and store it only if it survives the citation
 * check. Refuses to overwrite one the operator has edited.
 */
export async function buildMonthSummary(
  env: { AI: { run: (m: any, a: any) => Promise<any> } },
  db: D1Database,
  operatorId: string,
  ym: string,
): Promise<{ summary: string | null; cited: string[]; dropped: number; skipped?: string }> {
  const view = await loadMonth(db, operatorId, ym)

  if (view.summary_author === 'operator') {
    return { summary: view.summary, cited: view.cited, dropped: 0, skipped: 'you wrote this one' }
  }
  if (!view.entries.length) {
    return { summary: null, cited: [], dropped: 0, skipped: 'nothing in this month' }
  }

  // Oldest first, so the paragraph can read forward through the month.
  const ordered = [...view.entries].reverse().slice(0, 120)
  const numbered = ordered.map((e, i) => {
    const d = new Date(e.happened_at).getUTCDate()
    const who = e.author === 'operator' ? 'you said' : 'the log wrote'
    return `[${i + 1}] the ${d}${e.visibility === 'public' ? ' · public' : ''} · ${who}\n${e.text.replace(/\s+/g, ' ').trim()}`
  }).join('\n\n')

  let text = ''
  try {
    const res = await callReasoning(env as any, {
      system: SYSTEM,
      user: `The month is ${view.label}. Its entries:\n\n${numbered}`,
      effort: 'medium',
      maxTokens: 700,
    })
    text = res.text || ''
  } catch {
    return { summary: null, cited: [], dropped: 0, skipped: 'the model could not be reached' }
  }

  // The citation check, in code — not trusted to the prompt.
  const valid = new Set(ordered.map((_, i) => i + 1))
  const sentences = text.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean)
  const kept: string[] = []
  let dropped = 0
  for (const s of sentences) {
    const cites = Array.from(s.matchAll(/\[(\d+)\]/g)).map(m => parseInt(m[1], 10))
    if (!cites.length || cites.some(c => !valid.has(c))) { dropped++; continue }
    kept.push(s)
  }

  const summary = kept.join(' ')
  const cited = ordered.map(e => e.id)

  await run(
    db,
    `INSERT INTO month_summaries (id, operator_id, ym, summary, cited_json, author, built_from, built_at)
     VALUES (?,?,?,?,?,'log',?,CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       summary = excluded.summary, cited_json = excluded.cited_json,
       built_from = excluded.built_from, built_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
     WHERE month_summaries.author <> 'operator'`,
    `${operatorId}:${ym}`, operatorId, ym,
    summary || null, JSON.stringify(cited), view.entries.length,
  )

  return { summary: summary || null, cited, dropped }
}

/** The operator rewriting the month's paragraph. After this the log leaves it. */
export async function setMonthSummary(
  db: D1Database, operatorId: string, ym: string, summary: string,
): Promise<void> {
  await run(
    db,
    `INSERT INTO month_summaries (id, operator_id, ym, summary, author, updated_at)
     VALUES (?,?,?,?,'operator',CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       summary = excluded.summary, author = 'operator', updated_at = CURRENT_TIMESTAMP`,
    `${operatorId}:${ym}`, operatorId, ym, summary.trim() || null,
  )
}
