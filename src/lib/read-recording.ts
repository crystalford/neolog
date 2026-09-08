/**
 * Reading a recording onto the log.
 *
 * ── What this replaces ────────────────────────────────────────────────────
 *
 * Until 8 Sep a recording reached the log through the extraction passes: a
 * model read the transcript and wrote `threads` — a `topic`, a `take`, some
 * `key_quotes` — and relog turned those into entries. The operator's verdict
 * on that, in his words: *"the problem with the old system was i didn't
 * trust its output anyway."*
 *
 * He was right to distrust it, and the fix is not a better prompt. It is
 * removing the model from the path. Everything in this file is arithmetic
 * over `transcript_words`. **No model is called here and none may be added.**
 * What lands on the log is what he said, in the order he said it, at the
 * second he said it.
 *
 * ── Where a passage ends ─────────────────────────────────────────────────
 *
 * The one real question is where to cut, because a recording is not a list
 * of entries and 3,000 words is not one either.
 *
 * The cut is **his own silence.** `transcript_words` carries a start and an
 * end for every word, so a gap between them is a fact about the recording —
 * he stopped talking for two and a half seconds. That is where one thing he
 * was saying ends and the next begins, and it is in the data rather than in
 * anyone's judgement about what his thoughts are. A sentence end is a
 * second, weaker cut, used only when a passage has run long enough to need
 * one.
 *
 * The consequence worth stating: a passage can be a false unit. He pauses
 * mid-thought; he runs two thoughts together without breathing. The log is
 * wrong about the boundary sometimes and never wrong about the words —
 * which is the right way round, and is why merge and split on an entry
 * exist. A model would be wrong about the words too.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────
 *
 * Every entry carries `source_ref = 'said:<vlog_id>:<first word index>'`.
 * The word index is stable for a given transcript, so reading the same
 * recording twice writes nothing the second time, and re-transcribing it
 * and reading again adds only what changed.
 */

import { findMany, findOne, run, batch as d1Batch } from '@/lib/d1'
import { ulid } from '@/lib/ulid'
import { RELATION_DEFAULT } from '@/lib/log-entry'
import type { DatePrecision } from '@/lib/log-entry'
import type { D1Database } from '@cloudflare/workers-types'

/** He stopped talking for this long: one thing ended. */
export const PAUSE_SECONDS = 2.5
/** Below this a passage is a fragment, and it joins the one before it. */
export const MIN_PASSAGE_WORDS = 8
/** Above this a passage stops being a line, so a sentence end will do. */
export const MAX_PASSAGE_WORDS = 90
/** A hard ceiling, for a recording with no punctuation and no pauses. */
export const HARD_MAX_WORDS = 140

export interface Word { word: string; start_time: number; end_time: number; word_index: number }

export interface Passage {
  text: string
  /** Seconds into the recording. */
  start: number
  end: number
  /** The index of its first word — the stable half of its source_ref. */
  first_index: number
  words: number
}

const ENDS_SENTENCE = /[.!?]["'”’)\]]?$/

/**
 * Cut a recording's words into passages at his own pauses.
 *
 * Pure arithmetic over the timings, exported so the test can hold it to
 * that: given the same words it must always cut in the same places, and it
 * must never drop or reorder a word.
 */
export function cutIntoPassages(words: Word[]): Passage[] {
  const out: Passage[] = []
  let cur: Word[] = []

  const flush = () => {
    if (!cur.length) return
    const text = cur.map(w => w.word).join(' ').replace(/\s+/g, ' ').trim()
    if (text) {
      out.push({
        text,
        start: cur[0].start_time,
        end: cur[cur.length - 1].end_time,
        first_index: cur[0].word_index,
        words: cur.length,
      })
    }
    cur = []
  }

  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    cur.push(w)
    const next = words[i + 1]
    if (!next) break

    const gap = next.start_time - w.end_time
    const long = cur.length >= MAX_PASSAGE_WORDS

    // His silence, first and always.
    if (gap >= PAUSE_SECONDS && cur.length >= MIN_PASSAGE_WORDS) { flush(); continue }
    // Then a sentence end, but only once the passage has grown long enough
    // that it would otherwise be a wall.
    if (long && ENDS_SENTENCE.test(w.word)) { flush(); continue }
    // Then the ceiling, for a stretch with neither.
    if (cur.length >= HARD_MAX_WORDS) { flush(); continue }
  }
  flush()

  // A fragment left by a pause in the wrong place joins what came before it
  // rather than standing on the log as half a sentence.
  const merged: Passage[] = []
  for (const p of out) {
    const last = merged[merged.length - 1]
    if (p.words < MIN_PASSAGE_WORDS && last && last.words + p.words <= HARD_MAX_WORDS) {
      last.text = `${last.text} ${p.text}`
      last.end = p.end
      last.words += p.words
      continue
    }
    merged.push(p)
  }
  return merged
}

/** A recording's date is only as good as the pipeline's source for it. */
function precisionFor(recordedAt: string | null, source: string | null): DatePrecision {
  if (!recordedAt) return 'approx'
  switch ((source || '').toLowerCase()) {
    case 'pre_extracted':
    case 'mvhd':                 return 'exact'
    case 'filename':             return 'day'
    case 'upload_time_default':  return 'approx'
    default:                     return 'day'
  }
}

export interface ReadResult {
  vlog_id: string
  passages: number
  entries_written: number
  skipped_existing: number
  /** No word timings: nothing can be placed, so nothing is written. */
  no_words: boolean
}

/**
 * Read one recording onto the log.
 *
 * A recording with no word-level transcript writes **nothing**. It could
 * fall back to splitting `transcript_text` on punctuation, and then every
 * entry would carry a date the log invented — which is the failure mode this
 * whole product is built against. A recording that has not been transcribed
 * stays one line saying he recorded, until it has been.
 */
export async function readRecording(
  db: D1Database,
  operatorId: string,
  vlogId: string,
): Promise<ReadResult> {
  const vlog = await findOne<{
    id: string; recorded_at: string | null; recorded_at_source: string | null
    created_at: string
  }>(
    db,
    `SELECT id, recorded_at, recorded_at_source, created_at
       FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    vlogId, operatorId,
  )
  if (!vlog) return { vlog_id: vlogId, passages: 0, entries_written: 0, skipped_existing: 0, no_words: true }

  const words = await findMany<Word>(
    db,
    `SELECT word, start_time, end_time, word_index
       FROM transcript_words
      WHERE vlog_id = ? AND operator_id = ?
      ORDER BY word_index ASC
      LIMIT 20000`,
    vlogId, operatorId,
  )
  if (words.length < MIN_PASSAGE_WORDS) {
    return { vlog_id: vlogId, passages: 0, entries_written: 0, skipped_existing: 0, no_words: true }
  }

  const passages = cutIntoPassages(words)
  const base = vlog.recorded_at || vlog.created_at
  const baseMs = new Date(base).getTime()
  const precision = precisionFor(vlog.recorded_at, vlog.recorded_at_source)
  const loggedAt = new Date().toISOString()

  const INSERT = `INSERT OR IGNORE INTO log_entries
    (id, operator_id, text, detail, occurred_at, happened_at, logged_at,
     date_precision, kind, visibility, author, source_kind, source_ref,
     vlog_id, span_start, span_end, grounded, relation)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`

  const statements = passages.map(p => {
    const at = isNaN(baseMs)
      ? vlog.created_at
      : new Date(baseMs + p.start * 1000).toISOString()
    return {
      sql: INSERT,
      binds: [
        ulid(), operatorId, p.text, null,
        at, at, loggedAt,
        precision,
        // He said it. That is the whole of what the log knows and all it
        // claims.
        'said',
        'public',
        'operator',
        'vlog',
        `said:${vlogId}:${p.first_index}`,
        vlogId,
        p.start, p.end,
        // Grounded by construction: these ARE the transcript's words.
        1,
        RELATION_DEFAULT,
      ],
    }
  })

  let written = 0
  for (let i = 0; i < statements.length; i += 40) {
    const res = await d1Batch(db, statements.slice(i, i + 40))
    for (const r of res) written += (r as any)?.meta?.changes ?? 0
  }

  // The recording's own row says what came out of it, so the entries are
  // not a surprise on the feed.
  if (written > 0) {
    await run(
      db,
      `UPDATE vlogs SET read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      vlogId,
    )
  }

  return {
    vlog_id: vlogId,
    passages: passages.length,
    entries_written: written,
    skipped_existing: Math.max(0, passages.length - written),
    no_words: false,
  }
}

/** How much of the corpus the log has read, without changing anything. */
export async function readStatus(db: D1Database, operatorId: string): Promise<{
  recordings: number
  transcribed: number
  read: number
  entries: number
}> {
  const r = await findOne<{ recordings: number; transcribed: number; read: number; entries: number }>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM vlogs WHERE operator_id = ?1 AND deleted_at IS NULL) AS recordings,
       (SELECT COUNT(DISTINCT vlog_id) FROM transcript_words WHERE operator_id = ?1) AS transcribed,
       (SELECT COUNT(*) FROM vlogs WHERE operator_id = ?1 AND deleted_at IS NULL AND read_at IS NOT NULL) AS read,
       (SELECT COUNT(*) FROM log_entries
         WHERE operator_id = ?1 AND deleted_at IS NULL AND source_ref LIKE 'said:%') AS entries`,
    operatorId,
  )
  return r || { recordings: 0, transcribed: 0, read: 0, entries: 0 }
}
