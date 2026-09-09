/**
 * GET   /api/v2/vlogs/[id]/transcript-words
 * PATCH /api/v2/vlogs/[id]/transcript-words — fix one word Whisper misheard
 *
 * `fix.html`: *"Whisper heard 'leaf.' You said 'Leif.' Fixing it is one
 * click."* The audio does not change and the timings are kept; only the
 * reading of it changes.
 *
 * Three things happen on a correction, and the page names all three:
 *
 *   what changed          the word, and `vlogs.transcript_text` rebuilt from
 *                         the words so no reader sees the corrected line and
 *                         the uncorrected one on the same screen
 *   what was kept         an `entry_revisions` row carrying what Whisper
 *                         heard, dated — *"so you can see the machine's
 *                         version if you ever doubt yours"*
 *   what re-checked       every entry read out of the span containing that
 *                         word is rebuilt from the words and gets its own
 *                         revision row. *"Anything built on the words you
 *                         changed re-reads them and says so. Never
 *                         silently."* The response returns the count so the
 *                         page can say it out loud.
 *
 * ⚠️ **An entry's text must stay a substring of the transcript.** That is the
 * invariant the whole read path exists to hold, so the rebuild joins the
 * words in the span rather than doing a find-and-replace on the entry text —
 * a replace would also hit an identical word the correction was not about.
 *
 * One word at a time, enforced. A whole sentence pasted in here would be an
 * edit pretending to be a correction, and the operator's own words have
 * their own surface for that (`entry_revisions` via `PATCH /api/v2/log/[id]`).
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany, run } from '@/lib/d1'
import { ulid } from '@/lib/ulid'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

// A 20-minute vlog at ~150-180 wpm is roughly 3000-3600 words; this cap
// just guards against a pathological outlier, not normal vlog length.
const WORDS_LIMIT = 20000

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)

  const vlog = await findOne<{
    id: string; title: string | null; duration_seconds: number | null
    cut_ranges_json: string | null; cut_ranges_updated_at: string | null
  }>(
    db,
    `SELECT id, title, duration_seconds, cut_ranges_json, cut_ranges_updated_at
       FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!vlog) return NextResponse.json({ error: 'Vlog not found' }, { status: 404 })

  const words = await findMany<{ word: string; start_time: number; end_time: number }>(
    db,
    `SELECT word, start_time, end_time FROM transcript_words
      WHERE vlog_id = ?
      ORDER BY word_index ASC
      LIMIT ?`,
    params.id, WORDS_LIMIT,
  )

  let cutRanges: Array<{ start_word_index: number; end_word_index: number }> = []
  if (vlog.cut_ranges_json) {
    try {
      const parsed = JSON.parse(vlog.cut_ranges_json)
      if (Array.isArray(parsed)) cutRanges = parsed
    } catch {}
  }

  return NextResponse.json({
    vlog_id: vlog.id,
    vlog_title: vlog.title,
    duration_seconds: vlog.duration_seconds,
    words,
    cut_ranges: cutRanges,
    cut_ranges_updated_at: vlog.cut_ranges_updated_at,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

/**
 * PATCH — fix one word.
 *
 * `fix.html`: "Whisper heard 'leaf.' You said 'Leif.' Fixing it is one
 * click... **The audio doesn't change; the reading of it does.**"
 *
 * Whisper is good, not perfect, and names and jargon are exactly where it
 * slips — which matters here more than in most products, because the whole
 * log is built on 320 recordings of one person saying names.
 *
 * What this does and does not touch:
 *   - the word in `transcript_words` changes, and the timings do NOT. The
 *     word was said at that second whatever it was heard as.
 *   - `vlogs.transcript_text` is rebuilt so search finds the right word.
 *   - the audio is untouched. It always was the ground truth.
 *   - what Whisper heard is KEPT, in `entry_revisions`, so he can see the
 *     machine's version if he ever doubts his own.
 *
 * Body: { word_index: number, word: string }
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)

  const body = await req.json().catch(() => ({})) as { word_index?: number; word?: string }
  const idx = typeof body.word_index === 'number' ? body.word_index : null
  const next = (body.word || '').trim()
  if (idx === null || idx < 0) return NextResponse.json({ error: 'word_index required' }, { status: 400 })
  if (!next) return NextResponse.json({ error: 'word required' }, { status: 400 })
  // One word, not a rewrite of the line. A whole sentence pasted in here
  // would be an edit pretending to be a correction.
  if (/\s/.test(next) || next.length > 60) {
    return NextResponse.json({ error: 'one word at a time' }, { status: 400 })
  }

  const owned = await findOne<{ id: string }>(
    db,
    `SELECT id FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!owned) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const existing = await findOne<{ word: string }>(
    db,
    `SELECT word FROM transcript_words
      WHERE vlog_id = ? AND operator_id = ? AND word_index = ?`,
    params.id, operator.id, idx,
  )
  if (!existing) return NextResponse.json({ error: 'no word at that position' }, { status: 404 })
  if (existing.word === next) return NextResponse.json({ ok: true, unchanged: true })

  await run(
    db,
    `UPDATE transcript_words SET word = ?
      WHERE vlog_id = ? AND operator_id = ? AND word_index = ?`,
    next, params.id, operator.id, idx,
  )

  // Rebuild the flat transcript so search and every reader agree with the
  // words. Leaving it stale is how the corrected line and the uncorrected
  // one end up on the same screen.
  const all = await findMany<{ word: string }>(
    db,
    `SELECT word FROM transcript_words
      WHERE vlog_id = ? AND operator_id = ? ORDER BY word_index ASC LIMIT ?`,
    params.id, operator.id, WORDS_LIMIT,
  )
  const rebuilt = all.map(w => w.word).join(' ').replace(/\s+([,.!?;:])/g, '$1').trim()
  await run(
    db,
    `UPDATE vlogs SET transcript_text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    rebuilt, params.id,
  )

  // What the machine heard is kept, dated, so he can check his own memory
  // against it later.
  await run(
    db,
    `INSERT INTO entry_revisions (id, operator_id, entry_id, field, old_value, new_value)
     VALUES (?,?,?,'transcript_word',?,?)`,
    ulid(), operator.id, params.id,
    `Whisper heard "${existing.word}" at word ${idx}`,
    `you corrected it to "${next}"`,
  )

  // ── What re-checked itself ────────────────────────────────────────────
  //
  // An entry read out of this recording is a run of these words, and it
  // carries the seconds that run covers (`span_start` / `span_end`). So the
  // entries affected by one corrected word are exactly those whose span
  // contains the second that word was said — found by the timings, not by
  // searching the text for the old spelling, which would also hit an
  // identical word the correction was not about.
  //
  // ⚠️ `grounded = 1` is part of the search, not a detail of it. That column
  // means "this text IS the transcript's words for this span", which is true
  // of an entry the log read and false the moment he rewrites the line or
  // cuts it in two. Rebuilding one of those would replace HIS wording with
  // the machine's — the exact direction this product does not go — and it
  // would silently undo a split by putting both halves back.
  const at = await findOne<{ start_time: number }>(
    db,
    `SELECT start_time FROM transcript_words
      WHERE vlog_id = ? AND operator_id = ? AND word_index = ?`,
    params.id, operator.id, idx,
  )

  let rechecked = 0
  if (at) {
    const affected = await findMany<{ id: string; text: string; span_start: number; span_end: number }>(
      db,
      `SELECT id, text, span_start, span_end FROM log_entries
        WHERE operator_id = ? AND vlog_id = ? AND deleted_at IS NULL
          AND grounded = 1
          AND span_start IS NOT NULL AND span_end IS NOT NULL
          AND span_start <= ? AND span_end >= ?`,
      operator.id, params.id, at.start_time, at.start_time,
    )

    for (const e of affected) {
      const span = await findMany<{ word: string }>(
        db,
        `SELECT word FROM transcript_words
          WHERE vlog_id = ? AND operator_id = ?
            AND start_time >= ? AND start_time <= ?
          ORDER BY word_index ASC LIMIT ?`,
        params.id, operator.id, e.span_start, e.span_end, WORDS_LIMIT,
      )
      const rebuilt = span.map(w => w.word).join(' ').replace(/\s+([,.!?;:])/g, '$1').trim()
      if (!rebuilt || rebuilt === e.text) continue

      // The old wording is kept first, always — the same rule a correction
      // to his own line follows. Nothing overwrites without the replaced
      // value being written down.
      await run(
        db,
        // ⚠️ `by_whom = 'log'`, and it is the whole difference between the
        // two kinds of changed text. He rewriting his own line and the log
        // rebuilding an entry after he fixed a word are both a new `text`,
        // and the corrections record would otherwise put this one behind
        // his name — a change the log made, signed by him.
        `INSERT INTO entry_revisions (id, operator_id, entry_id, field, old_value, new_value, by_whom)
         VALUES (?,?,?,'text',?,?,'log')`,
        ulid(), operator.id, e.id, e.text, rebuilt,
      )
      await run(
        db,
        `UPDATE log_entries SET text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        rebuilt, e.id,
      )
      rechecked++
    }
  }

  return NextResponse.json(
    { ok: true, was: existing.word, now: next, rechecked },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
