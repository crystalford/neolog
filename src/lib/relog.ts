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
 * ── What it writes, and whose words they are ──────────────────────────────
 *
 * `SPEC.md` §0 rule 3 — "Only what was said. Nothing is inferred or filled
 * in" — and `LLM-PIPELINE.md` §1 — "verbatim spans are the only ground
 * truth; every summary is an index into them" — decide the shape:
 *
 *   - Where a thread has a verbatim `key_quote`, THAT is the entry's line,
 *     and `author` is `operator`. It is his sentence, from his mouth.
 *   - The `take` — which an extraction model wrote — goes in `detail` and
 *     the entry is marked as carrying the log's summary.
 *   - Where a thread has no usable quote, the take becomes the line and
 *     `author` is `log`. The row then says "arrived" in the feed, which is
 *     the honest label for a line the operator did not write.
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

/**
 * Pick the line that goes on the log.
 *
 * Prefers the longest verbatim quote, because the longest one is the one
 * that can stand alone as a sentence — a three-word fragment cannot. Quotes
 * that are too short to mean anything on their own are rejected rather than
 * padded out.
 */
function chooseLine(
  keyQuotesJson: string | null,
  take: string | null,
): { text: string; author: 'operator' | 'log'; detail: string | null } | null {
  let quotes: string[] = []
  try {
    const parsed = JSON.parse(keyQuotesJson || '[]')
    if (Array.isArray(parsed)) {
      quotes = parsed
        .map(q => (typeof q === 'string' ? q : (q && typeof q.quote === 'string' ? q.quote : '')))
        .map(q => q.trim())
        .filter(Boolean)
    }
  } catch { /* a malformed key_quotes column falls through to the take */ }

  // A line has to survive on its own on the feed. Six words is the floor.
  const usable = quotes
    .filter(q => q.split(/\s+/).length >= 6 && q.length <= 600)
    .sort((a, b) => b.length - a.length)

  if (usable.length) {
    const quote = usable[0]
    const summary = (take || '').trim()
    return {
      text: quote,
      author: 'operator',
      // Don't repeat the quote back as its own summary.
      detail: summary && summary !== quote ? summary : null,
    }
  }

  const t = (take || '').trim()
  if (!t) return null
  return { text: t, author: 'log', detail: null }
}

interface VlogRow {
  id: string
  recorded_at: string | null
  recorded_at_source: string | null
  created_at: string
  duration_seconds: number | null
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
    `SELECT id, recorded_at, recorded_at_source, created_at, duration_seconds
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
      skipped_existing: 0, vlogs_without_threads: 0, next_cursor: null,
    }
  }

  const ids = vlogs.map(v => v.id)
  const placeholders = ids.map(() => '?').join(',')
  const threads = await findMany<ThreadRow>(
    db,
    `SELECT id, vlog_id, topic, take, key_quotes, register, utterance_kind,
            strength, transcript_span_start
       FROM threads
      WHERE operator_id = ? AND deleted_at IS NULL AND vlog_id IN (${placeholders})
      ORDER BY vlog_id ASC, transcript_span_start ASC`,
    operatorId, ...ids,
  )

  const byVlog = new Map<string, VlogRow>(vlogs.map(v => [v.id, v]))
  const withThreads = new Set(threads.map(t => t.vlog_id))

  const INSERT = `INSERT OR IGNORE INTO log_entries
    (id, operator_id, text, detail, occurred_at, happened_at, logged_at,
     date_precision, kind, visibility, held_reason, author, source_kind,
     source_ref, vlog_id, duration_seconds)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`

  const statements: { sql: string; binds: unknown[] }[] = []
  let considered = 0

  for (const t of threads) {
    const v = byVlog.get(t.vlog_id)
    if (!v) continue
    const line = chooseLine(t.key_quotes, t.take)
    if (!line) continue
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
