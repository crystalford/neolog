/**
 * POST /api/v2/log/[id]/split — one entry is two things.
 *
 * The read path has one honest limitation and this is its remedy.
 * `read-recording.ts` cuts a recording at seams the splitter found, or at his
 * own pauses when it found none, and both can MISS one: he changes subject
 * mid-breath and two thoughts land in a single entry. Merge already handles
 * the other direction — "wrong split → merge, thread intact" (`wrong.html`)
 * — and this is the half that was missing.
 *
 * Body: { at_word } — the index, within this entry's own words, of the word
 * that BEGINS the second part. One number, because the operator is pointing
 * at a word on the page, not describing a range.
 *
 * ⚠️ Nothing here writes a word. Both halves are the entry's own words,
 * re-joined at the cut. That is the invariant the whole read path exists to
 * hold, and a split is the one correction most likely to break it, because
 * it is the one that makes a NEW row.
 *
 * There are two ways to cut and the response says which one ran, the same
 * way `/clear` names the check it used:
 *
 *   'timings'  the entry is still exactly what the recording says for its
 *              span, so the cut is made in `transcript_words`. Both halves
 *              get a real span and the second half gets the second it was
 *              actually said. Its `source_ref` is the one `read-recording`
 *              would have written for that seam, so re-reading the recording
 *              will not undo the split.
 *   'text'     everything else — a typed note, a paste, or a line he has
 *              since rewritten. The words are cut where he pointed and the
 *              second half carries no span, because the log does not know
 *              what second it was said at and will not invent one.
 *
 * ⚠️ A 'text' cut also clears `grounded` on the half that keeps the row.
 * Its text is no longer the transcript's words for its span — we just cut it
 * — and the transcript-fix rebuild rewrites a grounded entry from the words
 * in its span, which would silently put the two halves back together.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany, batch as d1Batch } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { ulid } from '@/lib/ulid'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { RELATION_DEFAULT } from '@/lib/log-entry'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

/** Same ceiling `read-recording.ts` reads a recording's words under. */
const WORDS_LIMIT = 20000

interface Row {
  id: string; text: string; detail: string | null
  occurred_at: string; happened_at: string | null; logged_at: string | null
  created_at: string; date_precision: string; kind: string; visibility: string
  author: string; source_kind: string; source_ref: string | null
  vlog_id: string | null; span_start: number | null; span_end: number | null
  grounded: number | null; led_from: string | null; relation: string | null
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = await readyDb(getDb(env), 'entry-split')
  const id = params.id

  const body = await req.json().catch(() => ({})) as { at_word?: number }
  const at = Number(body.at_word)
  if (!Number.isInteger(at) || at < 1) {
    return NextResponse.json({ error: 'at_word must be the index of the word the second part starts on' }, { status: 400 })
  }

  const row = await findOne<Row>(
    db,
    `SELECT id, text, detail, occurred_at, happened_at, logged_at, created_at,
            date_precision, kind, visibility, author, source_kind, source_ref,
            vlog_id, span_start, span_end, grounded, led_from, relation
       FROM log_entries
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    id, operator.id,
  )
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const own = row.text.trim().split(/\s+/).filter(Boolean)
  if (own.length < 2) {
    return NextResponse.json({ error: 'one word is not two things' }, { status: 400 })
  }
  if (at >= own.length) {
    return NextResponse.json({ error: 'that word is past the end of the entry' }, { status: 400 })
  }

  // ── Can this be cut in the recording's own timings? ──────────────────
  //
  // Only when the entry is still, character for character, what the words
  // in its span say. A line he has rewritten is not, and cutting THAT by
  // word index would put the machine's wording back on the page.
  const said = /^said:(.+):(\d+)$/.exec(row.source_ref || '')
  let words: { word: string; start_time: number; end_time: number; word_index: number }[] = []
  if (said && row.vlog_id && row.span_start != null && row.span_end != null && row.grounded === 1) {
    words = await findMany<{ word: string; start_time: number; end_time: number; word_index: number }>(
      db,
      `SELECT word, start_time, end_time, word_index
         FROM transcript_words
        WHERE vlog_id = ? AND operator_id = ? AND word_index >= ?
        ORDER BY word_index ASC
        LIMIT ?`,
      row.vlog_id, operator.id, Number(said[2]), Math.min(own.length, WORDS_LIMIT),
    )
    // The join has to equal the entry, or the mapping from "his fifth word"
    // to "the transcript's fifth word" is a guess.
    const joined = words.map(w => w.word).join(' ').replace(/\s+/g, ' ').trim()
    if (words.length !== own.length || joined !== own.join(' ')) words = []
  }

  const newId = ulid()
  const nowIso = new Date().toISOString()
  const firstText = own.slice(0, at).join(' ')
  const secondText = own.slice(at).join(' ')

  const statements: { sql: string; binds: unknown[] }[] = []
  let cutBy: 'timings' | 'text'

  if (words.length) {
    cutBy = 'timings'
    const cut = words[at]
    const lastOfFirst = words[at - 1]
    // The recording's clock, the same one `read-recording.ts` places every
    // passage by. Never the wall clock.
    const vlog = await findOne<{ recorded_at: string | null; created_at: string }>(
      db,
      `SELECT recorded_at, created_at FROM vlogs WHERE id = ? AND operator_id = ?`,
      row.vlog_id, operator.id,
    )
    const baseMs = new Date(vlog?.recorded_at || vlog?.created_at || '').getTime()
    const secondAt = isNaN(baseMs)
      ? (row.happened_at || row.occurred_at)
      : new Date(baseMs + cut.start_time * 1000).toISOString()

    statements.push({
      sql: `UPDATE log_entries
               SET text = ?, span_end = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND operator_id = ?`,
      binds: [firstText, lastOfFirst.end_time, id, operator.id],
    })
    statements.push({
      sql: `INSERT INTO log_entries
              (id, operator_id, text, detail, occurred_at, happened_at, logged_at,
               date_precision, kind, visibility, author, source_kind, source_ref,
               vlog_id, span_start, span_end, grounded, led_from, relation)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      binds: [
        newId, operator.id, secondText, null,
        secondAt, secondAt, nowIso,
        row.date_precision, row.kind, row.visibility, row.author, row.source_kind,
        // The seam `read-recording` would have written had it found this
        // one, so reading the recording again skips it instead of writing a
        // third copy of these words.
        `said:${row.vlog_id}:${cut.word_index}`,
        row.vlog_id, cut.start_time, row.span_end,
        1,
        // Both halves came out of the same moment, so both point where the
        // whole did. A split is not a turn.
        row.led_from, row.relation || RELATION_DEFAULT,
      ],
    })
  } else {
    cutBy = 'text'
    statements.push({
      sql: `UPDATE log_entries
               SET text = ?, grounded = 0, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND operator_id = ?`,
      binds: [firstText, id, operator.id],
    })
    statements.push({
      sql: `INSERT INTO log_entries
              (id, operator_id, text, detail, occurred_at, happened_at, logged_at,
               date_precision, kind, visibility, author, source_kind, source_ref,
               vlog_id, span_start, span_end, grounded, led_from, relation)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      binds: [
        newId, operator.id, secondText, null,
        row.happened_at || row.occurred_at, row.happened_at || row.occurred_at, nowIso,
        row.date_precision, row.kind, row.visibility, row.author, row.source_kind,
        // No `said:` ref: this half has no seam in the recording, and the
        // column is uniquely indexed anyway.
        null,
        // It did come out of that recording, so the way back to the file is
        // kept even though the second is not known.
        row.vlog_id, null, null,
        0,
        row.led_from, row.relation || RELATION_DEFAULT,
      ],
    })
  }

  // Both wordings kept, on both rows. The entry that keeps the id records
  // what it used to say; the new one records where it came from.
  statements.push({
    sql: `INSERT INTO entry_revisions (id, operator_id, entry_id, field, old_value, new_value)
          VALUES (?,?,?,'split',?,?)`,
    binds: [ulid(), operator.id, id, row.text, firstText],
  })
  statements.push({
    sql: `INSERT INTO entry_revisions (id, operator_id, entry_id, field, old_value, new_value)
          VALUES (?,?,?,'split',?,?)`,
    binds: [ulid(), operator.id, newId, `split off ${id}`, secondText],
  })

  await d1Batch(db, statements)

  return NextResponse.json(
    { ok: true, id, new_id: newId, cut_by: cutBy },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
