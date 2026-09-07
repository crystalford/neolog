/**
 * Relog — putting the recordings that already exist onto the log.
 *
 * ── The problem this solves ───────────────────────────────────────────────
 *
 * Three hundred-odd vlogs are already in D1, already transcribed, already
 * extracted. The feed reads them, so each one shows as a single line:
 * "Recorded 22 minutes of video." That is true and it is nearly useless —
 * a 22-minute recording in which the operator worked out four things, told
 * a story and changed his mind once appears on his log as one row that says
 * he pressed record.
 *
 * What he actually said is already sitting in `threads`: one row per take,
 * each with `topic`, `take`, verbatim `key_quotes`, a `register`, an
 * `utterance_kind`, and — the part that makes this work — a
 * `transcript_span_start` in seconds.
 *
 * So a vlog's entries can be placed at `recorded_at + span_start`, and a
 * day's log reads in the order things were actually said.
 *
 * ── Whose words end up on the log ─────────────────────────────────────────
 *
 * `SPEC.md` §0 rule 3 — "Only what was said. Nothing is inferred or filled
 * in" — and `LLM-PIPELINE.md` §1 — "verbatim spans are the only ground
 * truth; every summary is an index into them" — decide the shape. Three
 * tiers, in order, and the first one that yields a line wins:
 *
 *   1. A `key_quote` that is VERIFIED VERBATIM against the recording's own
 *      transcript. His sentence, from his mouth: `author='operator'`.
 *
 *      The check is not optional and it is not inherited. An extraction model
 *      wrote these "quotes", and an earlier version of this file trusted them
 *      — so a paraphrase, or an outright invention, would have been stored as
 *      the operator's own words. That is the worst thing this product can do.
 *
 *   2. THE SPAN ITSELF. When no quote survives the check, the log does not
 *      reach for the model's prose — it goes and gets what he actually said.
 *      The thread carries `transcript_span_start`/`_end` in seconds, and
 *      `transcript_words` carries every word Whisper heard with its own
 *      timestamp, so the span can be read back word for word. Also his:
 *      `author='operator'`.
 *
 *      This tier is why the fallback below is rare. A failed quote check
 *      means the extraction model paraphrased; it does not mean the operator
 *      said nothing. His words are still there, at a known second.
 *
 *   3. Only when there is no span, or no word-level transcript to read it
 *      out of, does the `take` become the line — and then it is the log's
 *      line, `author='log'`, which the feed labels "arrived". A model's
 *      summary is never shown as his.
 *
 * Nothing here calls a model. Every value is copied or computed from rows
 * that already exist, which is why relog is cheap, repeatable, and cannot
 * put words in his mouth.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────
 *
 * Every written entry carries `source_ref = 'thread:<id>'` under a unique
 * index, and the insert is `INSERT OR IGNORE`. Running relog twice writes
 * nothing the second time. Re-extracting a vlog and relogging it again adds
 * only the new threads.
 */

import { findMany, run, batch as d1Batch } from '@/lib/d1'
import { buildTranscriptFourGrams, isGrounded, isFullyGrounded } from '@/lib/validator'
import { ulid } from '@/lib/ulid'
import type { EntryKind, DatePrecision } from '@/lib/log-entry'
import type { D1Database } from '@cloudflare/workers-types'

export interface RelogResult {
  vlogs_seen: number
  threads_seen: number
  entries_written: number
  skipped_existing: number
  /** Vlogs with no threads — nothing was extracted from them yet. */
  vlogs_without_threads: number
  /**
   * Whose words each line came from, so the operator can see it rather than
   * take it on faith. `from_take` is the only one that is not him, and a
   * number there that isn't near zero means a recording lost its word-level
   * transcript.
   */
  lines: { from_quote: number; from_span: number; from_take: number }
  next_cursor: string | null
}

/**
 * The shape of the thought maps onto the seven kinds. `utterance_kind` is
 * structural (what sort of thing was said), which is exactly what the kinds
 * are, so this is a rename rather than a judgement.
 */
function kindForUtterance(u: string | null): EntryKind {
  switch ((u || '').toLowerCase()) {
    case 'story':         return 'happened'   // he is recounting an event
    case 'claim':
    case 'open_question':
    case 'intention':     return 'ideas'      // a position, a question, a plan
    case 'observation':
    case 'feeling':       return 'said'
    default:              return 'said'
  }
}

/** A recording's date is only as good as the pipeline's source for it. */
function precisionForVlog(recordedAt: string | null, source: string | null): DatePrecision {
  if (!recordedAt) return 'approx'
  switch ((source || '').toLowerCase()) {
    case 'pre_extracted':
    case 'mvhd':                 return 'exact'
    case 'filename':             return 'day'
    case 'upload_time_default':  return 'approx'
    default:                     return 'day'
  }
}

/** A line has to survive on its own on the feed. Six words is the floor. */
const MIN_LINE_WORDS = 6
/** Above this, a line stops being a line and becomes a wall. */
const MAX_LINE_WORDS = 60
/**
 * How far past a span's start the log will read. A thread's span can be
 * minutes long; the line only needs the top of it, and the rest of that
 * stretch is the next thread's material anyway.
 */
const MAX_SPAN_SECONDS = 90
/** Words kept per thread once fetched — line plus whatever trails it. */
const MAX_SPAN_WORDS = 200
const MAX_DETAIL_CHARS = 1200

export interface ChosenLine {
  text: string
  author: 'operator' | 'log'
  detail: string | null
  grounded: number | null
}

/** The quotes an extraction pass claimed, cleaned but not yet believed. */
function parseQuotes(keyQuotesJson: string | null): string[] {
  try {
    const parsed = JSON.parse(keyQuotesJson || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(q => (typeof q === 'string' ? q : (q && typeof q.quote === 'string' ? q.quote : '')))
      .map(q => q.trim())
      .filter(Boolean)
  } catch {
    // A malformed key_quotes column is not evidence of anything. Fall through.
    return []
  }
}

/**
 * Tier 1 — a quote the recording actually contains.
 *
 * Prefers the longest surviving quote, because the longest one is the one
 * that can stand alone as a sentence; a three-word fragment cannot. Without
 * a transcript to check against there is no evidence, so nothing is
 * attributed to him.
 */
function quoteLine(keyQuotesJson: string | null, take: string | null, fourGrams: Set<string> | null): ChosenLine | null {
  if (!fourGrams) return null
  const usable = parseQuotes(keyQuotesJson)
    .filter(q => q.split(/\s+/).length >= MIN_LINE_WORDS && q.length <= 600)
    .filter(q => isGrounded(q, fourGrams))
    .sort((a, b) => b.length - a.length)
  if (!usable.length) return null

  const quote = usable[0]
  const summary = (take || '').trim()
  return {
    text: quote,
    author: 'operator',
    // Don't repeat the quote back as its own summary.
    detail: summary && summary !== quote ? summary : null,
    grounded: 1,
  }
}

/**
 * Cut a run of spoken words into a line and whatever trails it.
 *
 * Takes as many WHOLE sentences as fit under the cap — rule 4 of §0 is that
 * every line is a sentence, and a line that stops mid-clause fails it. When
 * the stretch carries no sentence end at all (Whisper does this on a long
 * unbroken thought) the cap is the cut, which is the honest failure: the log
 * would rather show sixty of his words than sixty words of anyone else's.
 */
export function cutSpokenLine(words: string[]): { line: string; rest: string } | null {
  const clean = words.map(w => w.trim()).filter(Boolean).slice(0, MAX_SPAN_WORDS)
  if (clean.length < MIN_LINE_WORDS) return null

  const head = clean.slice(0, MAX_LINE_WORDS)
  let end = head.length
  for (let i = head.length - 1; i >= MIN_LINE_WORDS - 1; i--) {
    if (/[.!?]["'”’)\]]?$/.test(head[i])) { end = i + 1; break }
  }
  return {
    line: clean.slice(0, end).join(' '),
    rest: clean.slice(end).join(' ').slice(0, MAX_DETAIL_CHARS),
  }
}

/**
 * Tier 2 — the span itself, read back out of `transcript_words`.
 *
 * The words came from the recording, so the check here is not "did he say
 * something like this" but "are these two columns the same recording":
 * `transcript_text` and `transcript_words` are written from one Whisper
 * result, so a contiguous run of the words satisfies `isFullyGrounded`
 * against the text by construction, and fails only if the two disagree —
 * a re-transcribe that updated one and not the other. Failing there costs a
 * line; passing there wrongly puts words in his mouth, so it fails closed.
 *
 * When there is no `transcript_text` to check against, the words stand on
 * their own: they ARE the transcript, at the second they were spoken.
 */
function spanLine(words: string[], fourGrams: Set<string> | null): ChosenLine | null {
  const cut = cutSpokenLine(words)
  if (!cut) return null
  if (fourGrams) {
    const whole = cut.rest ? `${cut.line} ${cut.rest}` : cut.line
    if (!isFullyGrounded(whole, fourGrams)) return null
  }
  return {
    text: cut.line,
    author: 'operator',
    // What trails the line is also his, so it is the detail. The model's
    // `take` is not offered here — this row has no need of a paraphrase.
    detail: cut.rest || null,
    grounded: 1,
  }
}

/**
 * Tier 3 — the take, and it is the log's line, not his.
 *
 * Reached only when the extraction model paraphrased AND there is no span to
 * read, which means no word-level transcript for that recording. The feed
 * marks the row "arrived", which is the honest label for a line the operator
 * did not write.
 */
function takeLine(take: string | null, fourGrams: Set<string> | null): ChosenLine | null {
  const t = (take || '').trim()
  if (!t) return null
  return { text: t, author: 'log', detail: null, grounded: fourGrams ? 0 : null }
}

interface VlogRow {
  id: string
  recorded_at: string | null
  recorded_at_source: string | null
  created_at: string
  duration_seconds: number | null
  transcript_text: string | null
}

interface ThreadRow {
  id: string
  vlog_id: string
  topic: string | null
  take: string | null
  key_quotes: string | null
  register: string | null
  utterance_kind: string | null
  strength: number | null
  transcript_span_start: number | null
  transcript_span_end: number | null
}

/**
 * Read the spoken words back for a set of spans on ONE recording.
 *
 * One query per recording, not one per thread. A page of 20 vlogs whose
 * quotes all failed would otherwise be ~160 round trips inside a single
 * Function invocation; this is 20-ish. The ranges are OR'd into one WHERE
 * and the words are assigned to their thread in memory.
 *
 * Each range is clamped to `MAX_SPAN_SECONDS` so a thread that claims four
 * minutes cannot drag the whole recording back.
 */
async function readSpans(
  db: D1Database,
  operatorId: string,
  vlogId: string,
  spans: { id: string; start: number; end: number }[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  const CHUNK = 10
  for (let i = 0; i < spans.length; i += CHUNK) {
    const group = spans.slice(i, i + CHUNK)
    const where = group.map(() => '(w.start_time >= ? AND w.start_time < ?)').join(' OR ')
    const binds: unknown[] = [vlogId, operatorId]
    for (const s of group) binds.push(s.start, s.end)
    let rows: { word: string; start_time: number }[] = []
    try {
      rows = await findMany<{ word: string; start_time: number }>(
        db,
        `SELECT w.word, w.start_time
           FROM transcript_words w
          WHERE w.vlog_id = ? AND w.operator_id = ? AND (${where})
          ORDER BY w.word_index ASC
          LIMIT 3600`,
        ...binds,
      )
    } catch {
      // A recording with no word-level transcript is not an error — it is a
      // recording that predates word timestamps. Its threads fall to tier 3.
      continue
    }
    for (const s of group) {
      const words = rows
        .filter(r => r.start_time >= s.start && r.start_time < s.end)
        .map(r => r.word)
      if (words.length) out.set(s.id, words)
    }
  }
  return out
}

/**
 * Relog one page of vlogs. Paged rather than all-at-once so it runs inside a
 * Pages Function without hitting the time budget — the caller keeps passing
 * `next_cursor` back until it comes back null.
 */
export async function relogBatch(
  db: D1Database,
  operatorId: string,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<RelogResult> {
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20))
  const cursor = opts.cursor || null

  // Oldest first, so a partial run leaves the log filled from the beginning
  // rather than with a hole in the middle.
  const vlogs = await findMany<VlogRow>(
    db,
    `SELECT id, recorded_at, recorded_at_source, created_at, duration_seconds,
            transcript_text
       FROM vlogs
      WHERE operator_id = ? AND deleted_at IS NULL
        ${cursor ? 'AND id > ?' : ''}
      ORDER BY id ASC
      LIMIT ?`,
    ...(cursor ? [operatorId, cursor, limit] : [operatorId, limit]),
  )

  if (!vlogs.length) {
    return {
      vlogs_seen: 0, threads_seen: 0, entries_written: 0,
      skipped_existing: 0, vlogs_without_threads: 0,
      lines: { from_quote: 0, from_span: 0, from_take: 0 },
      next_cursor: null,
    }
  }

  const ids = vlogs.map(v => v.id)
  const placeholders = ids.map(() => '?').join(',')
  const threads = await findMany<ThreadRow>(
    db,
    `SELECT id, vlog_id, topic, take, key_quotes, register, utterance_kind,
            strength, transcript_span_start, transcript_span_end
       FROM threads
      WHERE operator_id = ? AND deleted_at IS NULL AND vlog_id IN (${placeholders})
      ORDER BY vlog_id ASC, transcript_span_start ASC`,
    operatorId, ...ids,
  )

  const byVlog = new Map<string, VlogRow>(vlogs.map(v => [v.id, v]))
  // One 4-gram set per recording, built once and reused for all its threads.
  const gramsByVlog = new Map<string, Set<string> | null>(
    vlogs.map(v => [
      v.id,
      v.transcript_text && v.transcript_text.trim()
        ? buildTranscriptFourGrams(v.transcript_text)
        : null,
    ]),
  )
  const withThreads = new Set(threads.map(t => t.vlog_id))

  const INSERT = `INSERT OR IGNORE INTO log_entries
    (id, operator_id, text, detail, occurred_at, happened_at, logged_at,
     date_precision, kind, visibility, held_reason, author, source_kind,
     source_ref, vlog_id, duration_seconds, span_start, span_end, grounded)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`

  const statements: { sql: string; binds: unknown[] }[] = []
  let considered = 0
  const counts = { from_quote: 0, from_span: 0, from_take: 0 }

  // Pass 1 — the quotes, which need no further reads. Whatever fails the
  // check leaves a span to go and read, grouped by recording.
  const lines = new Map<string, ChosenLine>()
  const spansToRead = new Map<string, { id: string; start: number; end: number }[]>()

  for (const t of threads) {
    if (!byVlog.has(t.vlog_id)) continue
    const grams = gramsByVlog.get(t.vlog_id) ?? null
    const fromQuote = quoteLine(t.key_quotes, t.take, grams)
    if (fromQuote) { lines.set(t.id, fromQuote); counts.from_quote++; continue }

    // A span start of 0 is legitimate — it is the first thing said — so the
    // test is on the type, not on truthiness.
    const s = t.transcript_span_start
    const e = t.transcript_span_end
    if (typeof s !== 'number' || s < 0) continue
    const end = typeof e === 'number' && e > s ? Math.min(e, s + MAX_SPAN_SECONDS) : s + MAX_SPAN_SECONDS
    const list = spansToRead.get(t.vlog_id) ?? []
    list.push({ id: t.id, start: s, end })
    spansToRead.set(t.vlog_id, list)
  }

  // Pass 2 — read those spans out of the recording, one query per recording.
  for (const [vlogId, spans] of spansToRead) {
    const words = await readSpans(db, operatorId, vlogId, spans)
    const grams = gramsByVlog.get(vlogId) ?? null
    for (const s of spans) {
      const w = words.get(s.id)
      if (!w) continue
      const fromSpan = spanLine(w, grams)
      if (fromSpan) { lines.set(s.id, fromSpan); counts.from_span++ }
    }
  }

  for (const t of threads) {
    const v = byVlog.get(t.vlog_id)
    if (!v) continue
    let line = lines.get(t.id)
    if (!line) {
      // Pass 3 — nothing of his was recoverable for this thread, so the
      // model's summary goes in as the log's own line.
      const fromTake = takeLine(t.take, gramsByVlog.get(t.vlog_id) ?? null)
      if (!fromTake) continue
      line = fromTake
      counts.from_take++
    }
    considered++

    // Place it at the moment it was said. A span start of 0 is legitimate
    // (the first thing said), so only a missing value falls back.
    const base = v.recorded_at || v.created_at
    const baseMs = new Date(base).getTime()
    const offsetSec = typeof t.transcript_span_start === 'number' && t.transcript_span_start >= 0
      ? t.transcript_span_start
      : 0
    const happenedAt = isNaN(baseMs)
      ? v.created_at
      : new Date(baseMs + offsetSec * 1000).toISOString()

    statements.push({
      sql: INSERT,
      binds: [
        ulid(), operatorId, line.text, line.detail,
        happenedAt, happenedAt, v.created_at,
        precisionForVlog(v.recorded_at, v.recorded_at_source),
        kindForUtterance(t.utterance_kind),
        'public', null,
        line.author,
        'vlog',
        `thread:${t.id}`,
        t.vlog_id,
        null,
        t.transcript_span_start ?? null,
        t.transcript_span_end ?? null,
        line.grounded,
      ],
    })
  }

  let written = 0
  if (statements.length) {
    // D1 batches are capped in practice; chunk so a big vlog can't blow one.
    for (let i = 0; i < statements.length; i += 40) {
      const chunk = statements.slice(i, i + 40)
      const res = await d1Batch(db, chunk)
      for (const r of res) written += (r as any)?.meta?.changes ?? 0
    }
  }

  return {
    vlogs_seen: vlogs.length,
    threads_seen: threads.length,
    entries_written: written,
    // INSERT OR IGNORE silently does nothing for a thread already relogged.
    skipped_existing: Math.max(0, considered - written),
    vlogs_without_threads: vlogs.filter(v => !withThreads.has(v.id)).length,
    lines: counts,
    next_cursor: vlogs.length === limit ? vlogs[vlogs.length - 1].id : null,
  }
}

/**
 * How much of the corpus is on the log, without changing anything. This is
 * what the operator sees before he decides to run it.
 */
export async function relogStatus(db: D1Database, operatorId: string): Promise<{
  vlogs: number
  threads: number
  relogged: number
  remaining: number
}> {
  const rows = await findMany<{ vlogs: number; threads: number; relogged: number }>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM vlogs   WHERE operator_id = ? AND deleted_at IS NULL) AS vlogs,
       (SELECT COUNT(*) FROM threads WHERE operator_id = ? AND deleted_at IS NULL) AS threads,
       (SELECT COUNT(*) FROM log_entries
         WHERE operator_id = ? AND deleted_at IS NULL
           AND source_ref LIKE 'thread:%') AS relogged`,
    operatorId, operatorId, operatorId,
  )
  const r = rows[0] || { vlogs: 0, threads: 0, relogged: 0 }
  return { ...r, remaining: Math.max(0, r.threads - r.relogged) }
}

/**
 * Undo a relog completely. Every relogged entry is identifiable by its
 * `source_ref`, so this removes exactly what relog added and nothing the
 * operator typed himself.
 */
export async function unrelogAll(db: D1Database, operatorId: string): Promise<number> {
  const res: any = await run(
    db,
    `UPDATE log_entries SET deleted_at = CURRENT_TIMESTAMP
      WHERE operator_id = ? AND deleted_at IS NULL AND source_ref LIKE 'thread:%'`,
    operatorId,
  )
  return res?.meta?.changes ?? 0
}
