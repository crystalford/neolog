/**
 * Recall — filling in what was never written down.
 *
 * SPEC §1 defines it as a verb, not a place: "a question appears where it
 * belongs (the log's rail, a page, a thin year) and is answered there, by
 * voice, typing, a choice, or 'don't remember'." `recall.html` was deleted on
 * 5 Sep for exactly this reason — a page of questions is a to-do list, and a
 * to-do list is a thing you avoid.
 *
 * ── What the log is allowed to ask ───────────────────────────────────────
 *
 * SPEC §1 names four things it must NEVER guess at, because a wrong guess
 * there is not a correctable mistake but the tool putting words in his
 * mouth: what a recording MEANS, WHY he did something, whether something was
 * GOOD, and who someone IS to him.
 *
 * So generation here is deliberately narrow. Every question is about a date
 * or a name — facts with one right answer that only he holds — and every one
 * is composed from real rows by the code below. **No model writes a
 * question.** That is not a cost saving; a model asking about a life is
 * exactly how this becomes something he avoids opening.
 *
 * ── How often ────────────────────────────────────────────────────────────
 *
 * "The log is quiet. It asks roughly one question a month, straight."
 *
 * Showing open questions in the rail is not asking — nothing is pushed,
 * nothing interrupts, and the rail is where he already is. What is rationed
 * is how many exist at once: the rail shows at most three, and generation
 * stops once there are enough. It never says how many times something has
 * come up.
 *
 * ── Answering ────────────────────────────────────────────────────────────
 *
 * An answer becomes an entry like any other: his words, dated to what he
 * picked, marked `from memory` by its precision. "Don't remember" is a
 * complete answer and closes the question for good — the log never asks
 * about a part he has said he doesn't know.
 */

import { findMany, run } from '@/lib/d1'
import { ulid } from '@/lib/ulid'
import type { DatePrecision } from '@/lib/log-entry'
import type { D1Database } from '@cloudflare/workers-types'

export type RecallKind = 'entry_date' | 'thin_year' | 'page_name' | 'photo_date'

export interface RecallQuestion {
  id: string
  kind: RecallKind
  question: string
  because: string | null
  target_kind: string | null
  target_id: string | null
  status: string
  created_at: string
}

/** At most this many open at once. The log is quiet. */
const MAX_OPEN = 3

/**
 * Look for gaps and write questions for them.
 *
 * Idempotent through `dedupe_key`: the same gap is one question forever, and
 * one he dismissed or said he doesn't remember never comes back.
 */
export async function generateQuestions(
  db: D1Database,
  operatorId: string,
): Promise<{ made: number; open: number }> {
  const openNow = await findMany<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM recall_questions
      WHERE operator_id = ? AND status = 'open'`,
    operatorId,
  )
  let open = openNow[0]?.n || 0
  if (open >= MAX_OPEN) return { made: 0, open }

  const candidates: {
    kind: RecallKind
    question: string
    because: string
    target_kind: string
    target_id: string
    dedupe_key: string
  }[] = []

  // ── 1. An entry the log had to place by inference ──────────────────────
  // This is the sharpest kind of gap: the entry exists, he wrote it, and the
  // only missing thing is when. A year would do.
  const fuzzy = await findMany<{ id: string; text: string; happened_at: string; date_precision: string }>(
    db,
    `SELECT id, text, COALESCE(happened_at, occurred_at) AS happened_at, date_precision
       FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
        AND date_precision IN ('approx', 'year')
        AND author = 'operator'
        AND id NOT IN (
          SELECT target_id FROM recall_questions
           WHERE operator_id = ? AND target_kind = 'entry' AND target_id IS NOT NULL
        )
      ORDER BY LENGTH(text) DESC
      LIMIT 5`,
    operatorId, operatorId,
  )
  for (const e of fuzzy) {
    candidates.push({
      kind: 'entry_date',
      question: 'When did this happen?',
      // What the log already has, said plainly. Never a nudge.
      because: `"${firstWords(e.text, 14)}" sits at ${new Date(e.happened_at).getUTCFullYear()}, placed by the log rather than by you. A year would do.`,
      target_kind: 'entry',
      target_id: e.id,
      dedupe_key: `entry_date:${e.id}`,
    })
  }

  // ── 1b. A picture with no date in the file ─────────────────────────────
  // `anchors.html`: "A scan has the scanner's date, not the picture's. So it
  // can't be placed. Instead of leaving it undated in a pile, the log shows
  // it to you and asks the two things only you can answer. One photo at a
  // time, when you feel like it — never a queue you owe."
  //
  // It asks WHEN and nothing else. Who is in it is one of the four things
  // SPEC §1 forbids the log to guess at, and a question about it here would
  // be the log fishing for an answer it intends to use.
  const undatedPictures = await findMany<{ id: string; text: string; happened_at: string }>(
    db,
    `SELECT id, text, COALESCE(happened_at, occurred_at) AS happened_at
       FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
        AND r2_key IS NOT NULL AND mime LIKE 'image/%'
        AND date_precision = 'approx'
        AND id NOT IN (
          SELECT target_id FROM recall_questions
           WHERE operator_id = ? AND target_kind = 'entry' AND target_id IS NOT NULL
        )
      ORDER BY COALESCE(happened_at, occurred_at) DESC
      LIMIT 3`,
    operatorId, operatorId,
  )
  for (const p of undatedPictures) {
    candidates.push({
      kind: 'photo_date',
      question: 'When was this picture taken?',
      because: 'The file had no date in it, so the log put it at the time it arrived. A scan carries the scanner\'s date, not the picture\'s.',
      target_kind: 'entry',
      target_id: p.id,
      dedupe_key: `photo_date:${p.id}`,
    })
  }

  // ── 2. A year with nothing in it, between years that have something ────
  // Only the gaps inside the range he has actually written about. The log
  // does not ask about 1975 because it has no reason to think anything
  // belongs there.
  const years = await findMany<{ y: string; n: number }>(
    db,
    `SELECT strftime('%Y', COALESCE(happened_at, occurred_at, created_at)) AS y, COUNT(*) AS n
       FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
      GROUP BY y ORDER BY y ASC`,
    operatorId,
  )
  const withEntries = years.map(r => parseInt(r.y, 10)).filter(y => !isNaN(y))
  if (withEntries.length >= 2) {
    const first = withEntries[0]
    const last = withEntries[withEntries.length - 1]
    const have = new Set(withEntries)
    for (let y = first + 1; y < last; y++) {
      if (have.has(y)) continue
      candidates.push({
        kind: 'thin_year',
        question: `What happened in ${y}?`,
        because: `Nothing on the log for that year, and there is something either side of it.`,
        target_kind: 'year',
        target_id: String(y),
        dedupe_key: `thin_year:${y}`,
      })
    }
  }

  // ── 3. A page the log named and he has never renamed ───────────────────
  // The log is asking about its own guess, which is the one thing it is
  // always safe to ask about.
  const guessed = await findMany<{ id: string; name: string; entry_count: number }>(
    db,
    `SELECT id, name, entry_count FROM pages
      WHERE operator_id = ? AND deleted_at IS NULL AND merged_into IS NULL
        AND named_by_system = 1 AND entry_count >= 3
        AND id NOT IN (
          SELECT target_id FROM recall_questions
           WHERE operator_id = ? AND target_kind = 'page' AND target_id IS NOT NULL
        )
      ORDER BY entry_count DESC
      LIMIT 3`,
    operatorId, operatorId,
  )
  for (const p of guessed) {
    candidates.push({
      kind: 'page_name',
      question: `Is "${p.name}" what you'd call it?`,
      because: `The log picked that name itself. ${p.entry_count} entries are under it.`,
      target_kind: 'page',
      target_id: p.id,
      dedupe_key: `page_name:${p.id}`,
    })
  }

  // Write up to the ceiling, oldest gaps first.
  let made = 0
  for (const c of candidates) {
    if (open >= MAX_OPEN) break
    const res: any = await run(
      db,
      `INSERT OR IGNORE INTO recall_questions
         (id, operator_id, kind, question, because, target_kind, target_id, dedupe_key)
       VALUES (?,?,?,?,?,?,?,?)`,
      ulid(), operatorId, c.kind, c.question, c.because,
      c.target_kind, c.target_id, c.dedupe_key,
    )
    const changed = res?.meta?.changes ?? 0
    made += changed
    open += changed
  }

  return { made, open }
}

/** The open ones, for the rail. Never more than the ceiling. */
export async function openQuestions(db: D1Database, operatorId: string): Promise<RecallQuestion[]> {
  return findMany<RecallQuestion>(
    db,
    `SELECT id, kind, question, because, target_kind, target_id, status, created_at
       FROM recall_questions
      WHERE operator_id = ? AND status = 'open'
      ORDER BY created_at ASC
      LIMIT ?`,
    operatorId, MAX_OPEN,
  )
}

/**
 * Answer one. The answer becomes an entry — his words, dated to what he
 * picked, and marked from memory by its precision, because that is what it
 * is.
 *
 * `dont_remember` closes the question with nothing written. The log does not
 * record a non-answer as an answer, and it never asks again.
 */
export async function answerQuestion(
  db: D1Database,
  operatorId: string,
  questionId: string,
  answer: { text?: string; year?: number; precision?: DatePrecision; dont_remember?: boolean },
): Promise<{ ok: boolean; entry_id: string | null }> {
  const rows = await findMany<RecallQuestion & { dedupe_key: string }>(
    db,
    `SELECT id, kind, question, because, target_kind, target_id, status, created_at, dedupe_key
       FROM recall_questions WHERE id = ? AND operator_id = ?`,
    questionId, operatorId,
  )
  const q = rows[0]
  if (!q) return { ok: false, entry_id: null }

  if (answer.dont_remember) {
    await run(
      db,
      `UPDATE recall_questions SET status = 'dont_remember', answered_at = CURRENT_TIMESTAMP
        WHERE id = ? AND operator_id = ?`,
      questionId, operatorId,
    )
    return { ok: true, entry_id: null }
  }

  // A date answer corrects the thing it was about rather than adding a
  // second entry saying the same thing in different words.
  if ((q.kind === 'entry_date' || q.kind === 'photo_date') && q.target_id && answer.year) {
    const iso = new Date(Date.UTC(answer.year, 6, 1, 12)).toISOString()
    await run(
      db,
      `UPDATE log_entries
          SET happened_at = ?, occurred_at = ?, date_precision = 'year',
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND operator_id = ?`,
      iso, iso, q.target_id, operatorId,
    )
    await run(
      db,
      `INSERT INTO entry_revisions (id, operator_id, entry_id, field, old_value, new_value)
       VALUES (?,?,?,'date','placed by the log',?)`,
      ulid(), operatorId, q.target_id, `${answer.year} (year, from memory)`,
    )
    await run(
      db,
      `UPDATE recall_questions SET status = 'answered', answered_at = CURRENT_TIMESTAMP
        WHERE id = ? AND operator_id = ?`,
      questionId, operatorId,
    )
    return { ok: true, entry_id: q.target_id }
  }

  // A page-name answer renames the page. His name, so it stops being the
  // log's guess.
  if (q.kind === 'page_name' && q.target_id && answer.text?.trim()) {
    await run(
      db,
      `UPDATE pages SET name = ?, named_by_system = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND operator_id = ?`,
      answer.text.trim(), q.target_id, operatorId,
    )
    await run(
      db,
      `UPDATE recall_questions SET status = 'answered', answered_at = CURRENT_TIMESTAMP
        WHERE id = ? AND operator_id = ?`,
      questionId, operatorId,
    )
    return { ok: true, entry_id: null }
  }

  // Everything else becomes an entry. A year-only answer is stored mid-year
  // so ordering works, and the precision is what says not to believe the day.
  const text = (answer.text || '').trim()
  if (!text) return { ok: false, entry_id: null }

  const year = answer.year
  const precision: DatePrecision = answer.precision
    || (q.kind === 'thin_year' ? 'year' : 'approx')
  const happenedAt = year
    ? new Date(Date.UTC(year, 6, 1, 12)).toISOString()
    : q.kind === 'thin_year' && q.target_id
      ? new Date(Date.UTC(parseInt(q.target_id, 10), 6, 1, 12)).toISOString()
      : new Date().toISOString()

  const entryId = ulid()
  const now = new Date().toISOString()
  await run(
    db,
    `INSERT INTO log_entries
       (id, operator_id, text, detail, occurred_at, happened_at, logged_at,
        date_precision, kind, visibility, author, source_kind)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    entryId, operatorId, text, null,
    happenedAt, happenedAt, now,
    precision, 'happened', 'public', 'operator', 'recall',
  )
  await run(
    db,
    `UPDATE recall_questions
        SET status = 'answered', answered_at = CURRENT_TIMESTAMP, answer_entry_id = ?
      WHERE id = ? AND operator_id = ?`,
    entryId, questionId, operatorId,
  )
  return { ok: true, entry_id: entryId }
}

/** Put one aside. It does not come back. */
export async function dismissQuestion(
  db: D1Database, operatorId: string, questionId: string,
): Promise<boolean> {
  const res: any = await run(
    db,
    `UPDATE recall_questions SET status = 'dismissed', answered_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ? AND status = 'open'`,
    questionId, operatorId,
  )
  return (res?.meta?.changes ?? 0) > 0
}

/** The first n words of a line, for quoting it back in a question. */
function firstWords(s: string, n: number): string {
  const words = s.trim().split(/\s+/)
  return words.length <= n ? s.trim() : `${words.slice(0, n).join(' ')}…`
}
