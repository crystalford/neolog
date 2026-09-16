/**
 * Reading a recording onto the log.
 *
 * ── Where one thing he said ends and the next begins ─────────────────────
 *
 * A 20-minute recording is 3,000 words of continuous talking. Putting it on
 * the log means deciding where the seams are, and that decision is the whole
 * of this file.
 *
 * `LLM-PIPELINE.md` §8 stage 01 specifies it: split by subject, schema
 * `{subjects:[{label, span_range}]}`, **extractive boundaries**. `branch.html`
 * demonstrates it — one 2:14 voice note carrying a question, a position, a
 * theory, a preference and a phenomenon, split five ways, and the page is
 * explicit that "you sorted none of them."
 *
 * So the seams come from `splitNote` (`src/lib/split-note.ts`), which was
 * already in this repo doing exactly this for typed and spoken notes and had
 * simply never been pointed at the recordings.
 *
 * ── Why this is not the thing he stopped trusting ────────────────────────
 *
 * The old extraction passes WROTE. A model read a recording and produced its
 * own sentence about what he meant — a `take` — and that sentence went on the
 * log under `author='operator'`. His verdict: *"the problem with the old
 * system was i didn't trust its output anyway."*
 *
 * Nothing here writes. The model is asked one question and may answer it only
 * by copying: the first six to ten words of each thread, character for
 * character. Those anchors are located in the transcript by exact match and
 * the entries are the slices between them. **Every entry is therefore a
 * substring of what he actually said, always.** An anchor the model invented
 * is not found and that seam is dropped, so the failure mode is *fewer
 * splits*, never *words he did not say*.
 *
 * ── The fallback, and why it is not the default ──────────────────────────
 *
 * `cutIntoPassages` cuts at his own pauses — a 2.5-second gap between two
 * words. It is honest and needs no model, and it was the default until
 * 8 Sep, when running it against `branch.html`'s own example showed the
 * problem: he said all five of those things without stopping, so a pause
 * cutter makes ONE entry out of the design's flagship five-way split. It
 * still runs when there is no model available or the split returns nothing,
 * because a coarse entry of his words beats no entry at all.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────
 *
 * Every entry carries `source_ref = 'said:<vlog_id>:<first word index>'`.
 * The word index is stable for a given transcript, so reading the same
 * recording twice writes nothing the second time. Re-splitting after a
 * re-transcribe adds only what moved.
 */

import { findMany, findOne, run, batch as d1Batch } from '@/lib/d1'
import { splitNote } from '@/lib/split-note'
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

/**
 * Words per window handed to the splitter.
 *
 * `splitNote` returns at most eight seams per call, so a whole 3,000-word
 * recording in one call would land as eight ~375-word entries. Windowing at
 * 700 gives roughly the density `branch.html` shows — several things out of
 * a couple of minutes — without asking the model to hold the whole recording
 * at once, which `LLM-PIPELINE.md` §2.1 warns against anyway.
 */
const WINDOW_WORDS = 700

interface SplitEnv { AI?: { run: (m: any, a: any) => Promise<any> } }

/**
 * Where the seams are, per `LLM-PIPELINE.md` §8 stage 01.
 *
 * The model sees the transcript and answers only with the first few words of
 * each thread, copied exactly. `splitNote` locates those anchors by exact
 * match and returns the slices between them, so a part is always a substring
 * of the transcript. This function's job is to turn those character offsets
 * back into WORD ranges, because a word carries the second it was said and a
 * character does not.
 *
 * Returns null when the model produced no usable seam — the caller then cuts
 * at his pauses instead. An empty result is never an error: it means the
 * recording is one thing, or the model invented anchors that were not found.
 */
async function splitByMeaning(env: SplitEnv, words: Word[]): Promise<Passage[] | null> {
  if (!env.AI || words.length < MIN_PASSAGE_WORDS) return null

  const passages: Passage[] = []

  for (let base = 0; base < words.length; base += WINDOW_WORDS) {
    const window = words.slice(base, base + WINDOW_WORDS)
    if (window.length < MIN_PASSAGE_WORDS) {
      // A tail too short to split is one passage, not a dropped one.
      passages.push(passageFrom(window))
      continue
    }

    // The exact string splitNote will cut, and the character offset of every
    // word in it — so a returned offset resolves to a word, and therefore to
    // a second.
    const offsets: number[] = []
    let text = ''
    for (const w of window) {
      if (text) text += ' '
      offsets.push(text.length)
      text += w.word
    }

    let parts: { text: string; at: number }[]
    try {
      parts = await splitNote(env as { AI: { run: (m: any, a: any) => Promise<any> } }, text)
    } catch {
      // The model is not a dependency of reading a recording. A failure here
      // falls through to the pause cutter for the whole recording.
      return null
    }

    // One part means the window is one thing — keep it whole rather than
    // pretending the split found something.
    const cuts = parts.length >= 2 ? parts.map(p => p.at) : [0]

    for (let i = 0; i < cuts.length; i++) {
      // Character offset back to a word index. Anchors land on word
      // boundaries by construction, so this is a lookup rather than a guess;
      // the search is defensive against an offset landing mid-word.
      const from = wordIndexAt(offsets, cuts[i])
      const to = i + 1 < cuts.length ? wordIndexAt(offsets, cuts[i + 1]) : window.length
      const slice = window.slice(from, to)
      if (slice.length < MIN_PASSAGE_WORDS) continue

      // A thread longer than the ceiling is still cut at his pauses inside
      // itself — the seam is the model's, the subdivision is his silence.
      if (slice.length > HARD_MAX_WORDS) passages.push(...cutIntoPassages(slice))
      else passages.push(passageFrom(slice))
    }
  }

  return passages.length ? passages : null
}

/** The largest word index whose character offset is at or before `at`. */
function wordIndexAt(offsets: number[], at: number): number {
  let lo = 0, hi = offsets.length - 1, best = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (offsets[mid] <= at) { best = mid; lo = mid + 1 } else hi = mid - 1
  }
  return best
}

/** A run of words, as a passage. The text is the words, joined — never anything else. */
function passageFrom(words: Word[]): Passage {
  return {
    text: words.map(w => w.word).join(' ').replace(/\s+/g, ' ').trim(),
    start: words[0].start_time,
    end: words[words.length - 1].end_time,
    first_index: words[0].word_index,
    words: words.length,
  }
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
  /**
   * Which decided where one thing he said ended: the splitter, or his own
   * pauses. Reported rather than hidden — the two produce noticeably
   * different entries and he should be able to tell which he is looking at.
   */
  cut_by: 'meaning' | 'pauses'
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
  /**
   * Optional. With it, the seams come from the splitter (the spec's stage
   * 01). Without it, from his pauses. Optional rather than required so that
   * reading never becomes something that cannot happen when the model is
   * unavailable.
   */
  env?: SplitEnv | null,
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
  if (!vlog) return { vlog_id: vlogId, passages: 0, cut_by: 'pauses', entries_written: 0, skipped_existing: 0, no_words: true }

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
    return { vlog_id: vlogId, passages: 0, cut_by: 'pauses', entries_written: 0, skipped_existing: 0, no_words: true }
  }

  // The seams: the splitter first, his pauses as the fallback.
  let passages: Passage[] | null = null
  let cutBy: 'meaning' | 'pauses' = 'meaning'
  if (env?.AI) passages = await splitByMeaning(env, words)
  if (!passages || !passages.length) {
    passages = cutIntoPassages(words)
    cutBy = 'pauses'
  }
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
    cut_by: cutBy,
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
