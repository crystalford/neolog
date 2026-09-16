/**
 * The machine layer — the same log, collected into lists a machine can read.
 *
 * `SPEC.md` §3: "Two pages a person reads, and an unlisted layer a machine
 * reads. **Nothing is written for a surface**; everything is rendered from
 * the log." And the nav rule: "a stranger chooses between two things.
 * Anything a stranger wouldn't click on — lists, data, feeds — exists at a
 * stable address one click below, unlisted."
 *
 * So there is no authoring here and no model. Four lists, each a query:
 *
 *   the glossary   the pages that are terms and subjects — a name, the
 *                  sentence it was first said in, and every use since.
 *   the questions  entries that ARE questions, with the answer he later
 *                  gave attached by `led_from`. Open ones are shown as open.
 *   the numbers    counted from dated rows, each one carrying the count it
 *                  came from so it can be re-derived rather than believed.
 *   the facts      the dossier: what the log can state about him from rows,
 *                  and nothing else.
 *
 * ── What is deliberately NOT here ─────────────────────────────────────────
 *
 * `asks.html` shows answers written in prose, with sub-questions fanned out
 * beneath them. That page is below the drafting fence: a model writing an
 * answer in his voice is exactly what `SPEC.md` §0 rule 3 forbids on a
 * surface that presents itself as a record. What is built instead is the
 * honest half — the question as he asked it, the answer as he later gave
 * it, both his, both dated. `/search` is where a written answer lives, and
 * it checks every sentence's citations before showing it.
 *
 * `numbers.html` likewise shows numbers with a written interpretation under
 * each. The number is kept; the interpretation is not. A count is a fact; a
 * sentence about what the count means is a reading, and the log does not
 * comment (§0 rule 2).
 */

import { findMany, findOne } from './d1'
import type { D1Database } from '@cloudflare/workers-types'

// ── Terms and subjects ───────────────────────────────────────────────────

export interface GlossaryItem {
  id: string
  name: string
  kind: string
  /** The log's paragraph, or his once he has edited it. */
  summary: string | null
  summary_author: 'log' | 'operator'
  /** The sentence the name was first used in, and when. */
  first_said: string | null
  first_said_at: string | null
  first_said_id: string | null
  entry_count: number
  span_start: string | null
  span_end: string | null
  /** True when the log picked the name rather than the operator. */
  named_by_system: boolean
  href: string
}

/**
 * The glossary, `source.html` — every term and subject, with the sentence it
 * was coined in.
 *
 * A term's point is its FIRST use (`src/lib/pages.ts`), so the coining
 * sentence is fetched with it: the earliest public entry attached to the
 * page. One query for the pages, one for all their first entries — not one
 * per page.
 */
export async function loadGlossary(
  db: D1Database,
  operatorId: string,
  opts: { kinds?: string[]; limit?: number } = {},
): Promise<GlossaryItem[]> {
  const kinds = opts.kinds?.length ? opts.kinds : ['term', 'subject', 'project', 'thing']
  const limit = Math.min(500, Math.max(1, opts.limit ?? 300))
  const ph = kinds.map(() => '?').join(',')

  const pages = await findMany<{
    id: string; name: string; kind: string; summary: string | null
    summary_author: string; span_start: string | null; span_end: string | null
    entry_count: number; named_by_system: number
  }>(
    db,
    `SELECT id, name, kind, summary, summary_author, span_start, span_end,
            entry_count, named_by_system
       FROM pages
      WHERE operator_id = ? AND deleted_at IS NULL AND merged_into IS NULL
        AND kind IN (${ph})
      ORDER BY name COLLATE NOCASE ASC
      LIMIT ?`,
    operatorId, ...kinds, limit,
  )
  if (!pages.length) return []

  // The coining sentence for every page at once. `MIN(happened_at)` per page
  // in one pass — the alternative is one query per term, which is the shape
  // that made the fold slow before it was fixed.
  const pph = pages.map(() => '?').join(',')
  const firsts = await findMany<{
    page_id: string; id: string; text: string; happened_at: string
  }>(
    db,
    `SELECT pe.page_id, le.id, le.text,
            COALESCE(le.happened_at, le.occurred_at, le.created_at) AS happened_at
       FROM page_entries pe
       JOIN log_entries le ON le.id = pe.entry_id
      WHERE pe.page_id IN (${pph}) AND pe.entry_kind = 'entry'
        AND le.operator_id = ? AND le.deleted_at IS NULL AND le.buried_at IS NULL
        AND le.visibility = 'public' AND le.author = 'operator'
      ORDER BY COALESCE(le.happened_at, le.occurred_at, le.created_at) ASC
      LIMIT 4000`,
    ...pages.map(p => p.id), operatorId,
  )
  // Rows arrive oldest first, so the first one seen for a page is its first.
  const firstFor = new Map<string, { id: string; text: string; at: string }>()
  for (const f of firsts) {
    if (!firstFor.has(f.page_id)) firstFor.set(f.page_id, { id: f.id, text: f.text, at: f.happened_at })
  }

  return pages.map(p => {
    const f = firstFor.get(p.id) || null
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      summary: p.summary,
      summary_author: (p.summary_author === 'operator' ? 'operator' : 'log') as 'log' | 'operator',
      first_said: f?.text ?? null,
      first_said_at: f?.at ?? null,
      first_said_id: f?.id ?? null,
      entry_count: p.entry_count ?? 0,
      span_start: p.span_start,
      span_end: p.span_end,
      named_by_system: !!p.named_by_system,
      href: `/page/${p.id}`,
    }
  })
}

// ── Questions ────────────────────────────────────────────────────────────

export interface AskItem {
  id: string
  question: string
  asked_at: string
  /** The answer he later gave, attached to the question by `led_from`. */
  answers: { id: string; text: string; at: string; author: string }[]
  href: string
}

/**
 * The questions, `asks.html` — but only the half that is his.
 *
 * A question is an entry he wrote that ends in a question mark. An answer is
 * an entry that `led_from` it — the thread column, which is how every other
 * continuation in the log is expressed, so a question needs no new table and
 * no new field. A question with no continuation is open, and the page says
 * so rather than hiding it: `asks.html` keeps "questions I've asked myself
 * and not answered" as a section of its own, because an open question is a
 * fact about him too.
 */
export async function loadAsks(
  db: D1Database,
  operatorId: string,
  opts: { limit?: number; publicOnly?: boolean } = {},
): Promise<{ answered: AskItem[]; open: AskItem[] }> {
  const limit = Math.min(400, Math.max(1, opts.limit ?? 200))
  const vis = opts.publicOnly === false ? '' : `AND visibility = 'public'`

  const questions = await findMany<{ id: string; text: string; happened_at: string }>(
    db,
    `SELECT id, text, COALESCE(happened_at, occurred_at, created_at) AS happened_at
       FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
        AND author = 'operator' ${vis}
        AND rtrim(text) LIKE '%?'
      ORDER BY COALESCE(happened_at, occurred_at, created_at) DESC
      LIMIT ?`,
    operatorId, limit,
  )
  if (!questions.length) return { answered: [], open: [] }

  const ph = questions.map(() => '?').join(',')
  const replies = await findMany<{
    led_from: string; id: string; text: string; happened_at: string; author: string
  }>(
    db,
    `SELECT led_from, id, text,
            COALESCE(happened_at, occurred_at, created_at) AS happened_at, author
       FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
        AND led_from IN (${ph}) ${vis}
      ORDER BY COALESCE(happened_at, occurred_at, created_at) ASC
      LIMIT 2000`,
    operatorId, ...questions.map(q => q.id),
  )
  const byQuestion = new Map<string, AskItem['answers']>()
  for (const r of replies) {
    const list = byQuestion.get(r.led_from) ?? []
    list.push({ id: r.id, text: r.text, at: r.happened_at, author: r.author })
    byQuestion.set(r.led_from, list)
  }

  const answered: AskItem[] = []
  const open: AskItem[] = []
  for (const q of questions) {
    const item: AskItem = {
      id: q.id,
      question: q.text,
      asked_at: q.happened_at,
      answers: byQuestion.get(q.id) ?? [],
      href: `/entry/${q.id}`,
    }
    ;(item.answers.length ? answered : open).push(item)
  }
  return { answered, open }
}

// ── Numbers ──────────────────────────────────────────────────────────────

export interface LogNumber {
  key: string
  /** The number itself. */
  value: number
  /** What it counts, as a sentence with a subject and a verb. */
  label: string
  /** The exact rule it was counted by, so it can be checked rather than believed. */
  counted: string
  unit?: string
}

/**
 * The numbers, `numbers.html` — counted, never asserted.
 *
 * Every one of these is a `COUNT` or a `MIN`/`MAX` over dated rows, and each
 * carries the rule it was counted by. `numbers.html` puts a written reading
 * under each number; that is not built, because a sentence about what a
 * count MEANS is a comment on the log, and the log does not comment.
 *
 * One query. These used to be the sort of thing that becomes eleven.
 */
export async function loadNumbers(db: D1Database, operatorId: string): Promise<{
  numbers: LogNumber[]
  first_at: string | null
  last_at: string | null
  generated_at: string
}> {
  const row = await findOne<{
    entries: number; public_entries: number; days: number
    approx: number; held: number
    first_at: string | null; last_at: string | null
    vlogs: number; recorded_seconds: number | null
    photos: number; pages: number
  }>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM log_entries
         WHERE operator_id = ?1 AND deleted_at IS NULL AND buried_at IS NULL) AS entries,
       (SELECT COUNT(*) FROM log_entries
         WHERE operator_id = ?1 AND deleted_at IS NULL AND buried_at IS NULL
           AND visibility = 'public') AS public_entries,
       (SELECT COUNT(DISTINCT date(COALESCE(happened_at, occurred_at, created_at)))
          FROM log_entries
         WHERE operator_id = ?1 AND deleted_at IS NULL AND buried_at IS NULL) AS days,
       (SELECT COUNT(*) FROM log_entries
         WHERE operator_id = ?1 AND deleted_at IS NULL AND buried_at IS NULL
           AND date_precision = 'approx') AS approx,
       (SELECT COUNT(*) FROM log_entries
         WHERE operator_id = ?1 AND deleted_at IS NULL AND buried_at IS NULL
           AND visibility = 'held') AS held,
       (SELECT MIN(COALESCE(happened_at, occurred_at, created_at)) FROM log_entries
         WHERE operator_id = ?1 AND deleted_at IS NULL AND buried_at IS NULL) AS first_at,
       (SELECT MAX(COALESCE(happened_at, occurred_at, created_at)) FROM log_entries
         WHERE operator_id = ?1 AND deleted_at IS NULL AND buried_at IS NULL) AS last_at,
       (SELECT COUNT(*) FROM vlogs WHERE operator_id = ?1 AND deleted_at IS NULL) AS vlogs,
       (SELECT COALESCE(SUM(duration_seconds), 0) FROM vlogs
         WHERE operator_id = ?1 AND deleted_at IS NULL) AS recorded_seconds,
       (SELECT COUNT(*) FROM photos WHERE operator_id = ?1 AND deleted_at IS NULL) AS photos,
       (SELECT COUNT(*) FROM pages
         WHERE operator_id = ?1 AND deleted_at IS NULL AND merged_into IS NULL) AS pages`,
    operatorId,
  )
  const r = row || {
    entries: 0, public_entries: 0, days: 0, approx: 0, held: 0,
    first_at: null, last_at: null, vlogs: 0, recorded_seconds: 0, photos: 0, pages: 0,
  }

  const years = r.first_at && r.last_at
    ? new Date(r.last_at).getUTCFullYear() - new Date(r.first_at).getUTCFullYear() + 1
    : 0

  const numbers: LogNumber[] = [
    {
      key: 'entries', value: r.entries,
      label: 'things are on the log.',
      counted: 'Rows in log_entries that have not been buried.',
    },
    {
      key: 'public_entries', value: r.public_entries,
      label: 'of them are public.',
      counted: "Of those rows, the ones with visibility = 'public'.",
    },
    {
      key: 'days', value: r.days,
      label: 'separate days have something on them.',
      counted: 'Distinct calendar days across every entry, by the date it happened.',
    },
    {
      key: 'years', value: years, unit: 'years',
      label: 'years lie between the first thing and the last.',
      counted: 'The year of the newest entry minus the year of the oldest, inclusive.',
    },
    {
      key: 'recordings', value: r.vlogs,
      label: 'recordings are in the archive.',
      counted: 'Rows in vlogs that have not been deleted.',
    },
    {
      key: 'recorded_hours', value: Math.round((r.recorded_seconds || 0) / 360) / 10, unit: 'hours',
      label: 'hours of it were recorded out loud.',
      counted: 'The sum of every recording’s duration, in hours, to one decimal.',
    },
    {
      key: 'photos', value: r.photos,
      label: 'photographs are kept here.',
      counted: 'Rows in photos that have not been deleted.',
    },
    {
      key: 'pages', value: r.pages,
      label: 'names have a page of their own.',
      counted: 'Rows in pages that have not been buried or merged into another.',
    },
    {
      key: 'approx', value: r.approx,
      label: 'entries carry a date the log had to guess.',
      counted: "Entries whose date_precision is 'approx'.",
    },
    {
      key: 'held', value: r.held,
      label: 'were held back by the log after looking at them.',
      counted: "Entries whose visibility is 'held'.",
    },
  ]

  return {
    numbers,
    first_at: r.first_at,
    last_at: r.last_at,
    generated_at: new Date().toISOString(),
  }
}

// ── The one stamp every page in this layer carries ───────────────────────

/**
 * `SPEC.md` §3: "Every page carries a *last changed* stamp." The honest
 * value is the newest `updated_at`/`created_at` the layer draws from, not
 * the time the request was served — a page that says it changed just now
 * every time it is loaded is saying nothing.
 */
export async function lastChanged(db: D1Database, operatorId: string): Promise<string | null> {
  const row = await findOne<{ at: string | null }>(
    db,
    `SELECT MAX(at) AS at FROM (
       SELECT MAX(COALESCE(updated_at, created_at)) AS at FROM log_entries
        WHERE operator_id = ?1 AND deleted_at IS NULL AND buried_at IS NULL
       UNION ALL
       SELECT MAX(COALESCE(updated_at, created_at)) FROM pages
        WHERE operator_id = ?1 AND deleted_at IS NULL
     )`,
    operatorId,
  )
  return row?.at ?? null
}

// ── The feeds ────────────────────────────────────────────────────────────

export interface FeedRow {
  id: string
  text: string
  detail: string | null
  happened_at: string
  logged_at: string
  date_precision: string
  kind: string
  author: string
}

/**
 * The rows every feed is built from.
 *
 * `visibility = 'public'` is the whole gate, and it is applied here rather
 * than in each feed, so a new feed cannot be written that forgets it. The
 * feeds are served without auth — the same shape as `/podcast.xml` — so this
 * one clause is what stands between the operator's log and the open web.
 * Held-back and private entries are not filtered out downstream; they are
 * never selected.
 */
export async function loadPublicFeed(
  db: D1Database,
  operatorId: string,
  limit = 200,
): Promise<FeedRow[]> {
  return findMany<FeedRow>(
    db,
    `SELECT id, text, detail,
            COALESCE(happened_at, occurred_at, created_at) AS happened_at,
            COALESCE(logged_at, created_at) AS logged_at,
            COALESCE(date_precision, 'exact') AS date_precision,
            COALESCE(kind, 'said') AS kind,
            COALESCE(author, 'operator') AS author
       FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
        AND visibility = 'public'
      ORDER BY COALESCE(happened_at, occurred_at, created_at) DESC
      LIMIT ?`,
    operatorId, Math.min(500, Math.max(1, limit)),
  )
}

/**
 * The single operator row, without auth — the same choice `/podcast.xml`
 * makes, and for the same reason: this app has one operator, and a feed a
 * podcast client can't fetch is not a feed.
 */
export async function soleOperator(db: D1Database): Promise<{
  id: string; display_name: string | null; handle: string | null; bio: string | null
} | null> {
  return findOne<{ id: string; display_name: string | null; handle: string | null; bio: string | null }>(
    db,
    `SELECT id, display_name, handle, bio FROM operator ORDER BY created_at ASC LIMIT 1`,
  )
}

/** XML text, escaped once, in one place. */
export const xmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
