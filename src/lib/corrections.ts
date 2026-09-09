/**
 * The log's record of its own mistakes (`wrong.html` §2).
 *
 * ── Why this is a surface and not a detail ───────────────────────────────
 *
 * `wrong.html` §1 is the argument: the log guesses roughly twenty times a
 * day, it cannot be built on being right, so it is built on being cheap to
 * correct. §2 is the part that makes the argument checkable —
 *
 *   "Every correction is itself an entry. So the log keeps a dated record
 *    of its own mistakes. This is the part no other tool does, and it is
 *    the only honest answer to 'will it be smart enough.' You do not have
 *    to trust it."
 *
 * `entry_revisions` has held every one since the first correction shipped,
 * and nothing read them log-wide: an entry's own page shows its own history,
 * so a mistake was only visible to someone who already knew where it was.
 *
 * ⚠️ Two things this deliberately does NOT do, both from §0.
 *
 * The design's `.rate` block carries "↓ 2.1× wrong attaches, compared with
 * the first week". A trend is the log telling him whether it is getting
 * better, which is a reading of the numbers and not a number (§0 rule 2 —
 * the log never comments). The counts below are counts, and each carries the
 * rule it was counted by, the way `/numbers` does.
 *
 * And the line describing a correction is composed by the log from the field
 * and the two values — so it is marked as the log's, always (§0 rule 3). The
 * words that were replaced and the words that replaced them are shown
 * underneath, and those are his.
 */

import { findMany, findOne } from './d1'
import type { D1Database } from '@cloudflare/workers-types'

/** Who made a correction. The column has carried this since it was made. */
export type CorrectedBy = 'operator' | 'log'

export interface Correction {
  id: string
  entry_id: string
  /** The `entry_revisions.field` this row corrected. */
  field: string
  /** What the row used to say. Kept first, always — nothing overwrites. */
  old_value: string | null
  /** What it says now. */
  new_value: string | null
  at: string
  by: CorrectedBy
  /** The log's one line about what happened. Marked as the log's on screen. */
  line: string
  /** The short tag beside it — `.k` in the design. */
  kind: string
  /** The entry's current line, so a correction is not an orphan id. */
  entry_text: string | null
  /** Null when the entry has since been buried; the row still shows. */
  entry_buried: boolean
}

/**
 * field → what to call it, and what the log says happened.
 *
 * ⚠️ `text` is two different events depending on who did it, which is why
 * `by_whom` is read rather than assumed. He rewriting his own line and the
 * log rebuilding an entry after he fixed a misheard word are both a changed
 * `text`, and calling the second one "you rewrote this" would put a change
 * the log made behind his name.
 */
const WHAT: Record<string, { kind: string; operator: string; log: string }> = {
  text: {
    kind: 'wrong words',
    operator: 'You rewrote the line.',
    log: 'The log rebuilt the line from the transcript, after you fixed a word in it.',
  },
  detail: {
    kind: 'wrong description',
    operator: 'You said what the picture actually shows.',
    log: 'The log described the picture.',
  },
  date: {
    kind: 'wrong date',
    operator: 'You changed when it happened.',
    log: 'The log changed when it happened.',
  },
  visibility: {
    kind: 'wrong side',
    operator: 'You changed who can see it.',
    log: 'The log held it back.',
  },
  author: {
    kind: 'wrong hand',
    operator: 'You said the words were yours.',
    log: 'The log took the line back.',
  },
  bury: {
    kind: 'buried',
    operator: 'You buried it, or dug it back up.',
    log: 'The log buried it.',
  },
  merge: {
    kind: 'wrong split',
    operator: 'You said two entries were one thing.',
    log: 'The log joined two entries.',
  },
  split: {
    kind: 'missed seam',
    operator: 'You cut one entry into two.',
    log: 'The log cut one entry into two.',
  },
  kind: {
    kind: 'wrong kind',
    operator: 'You said what kind of thing it is.',
    log: 'The log refiled it.',
  },
  transcript_word: {
    kind: 'misheard',
    operator: 'You fixed a word the machine misheard.',
    log: 'The log changed a word.',
  },
}

/**
 * What the log says happened, and the short tag beside it. An unrecognised
 * field is described as unrecognised, never guessed at.
 *
 * Exported because the entry's own page shows the same rows for one entry
 * and the corrections record shows them for all of them. Two copies of this
 * map would drift, and the way it would drift is a revision the log made
 * reading as one he made.
 */
export function describeCorrection(field: string, by: CorrectedBy): { line: string; kind: string } {
  const w = WHAT[field]
  if (!w) return { line: 'Something on this entry changed.', kind: field }
  return { line: by === 'log' ? w.log : w.operator, kind: w.kind }
}

/** `by_whom` is TEXT with a default; anything unknown is the log's. */
export function asCorrectedBy(v: unknown): CorrectedBy {
  return v === 'operator' ? 'operator' : 'log'
}

export interface CorrectionCounts {
  /** How many corrections there have been, ever. */
  corrections: number
  /** How many of those he made himself. */
  by_him: number
  /**
   * How many guesses the log has made — the denominator, and the only
   * honest one. A guess is a specific, countable thing: an entry the log
   * had to place by inference, a line the log wrote rather than him, a
   * picture it held back, or a passage it cut out of a recording. The rule
   * is printed beside the number on the page, because a rate against an
   * unstated denominator is a claim rather than a count.
   */
  guesses: number
  /**
   * Corrections that lost something. Structurally zero: every one keeps its
   * old value first. Counted rather than asserted, so the page states a fact
   * it checked instead of repeating a promise.
   */
  lost: number
}

export interface CorrectionPage {
  corrections: Correction[]
  /** The oldest row returned, for the next page. */
  next_before: string | null
  counts: CorrectionCounts
}

const MAX_PER_PAGE = 100

export async function loadCorrections(
  db: D1Database,
  operatorId: string,
  opts: { limit?: number; before?: string | null } = {},
): Promise<CorrectionPage> {
  const limit = Math.min(Math.max(1, opts.limit || 40), MAX_PER_PAGE)
  const before = opts.before || null

  const rows = await findMany<{
    id: string; entry_id: string; field: string
    old_value: string | null; new_value: string | null
    created_at: string; by_whom: string | null
    entry_text: string | null; buried_at: string | null
  }>(
    db,
    `SELECT r.id, r.entry_id, r.field, r.old_value, r.new_value, r.created_at,
            r.by_whom, e.text AS entry_text, e.buried_at
       FROM entry_revisions r
       LEFT JOIN log_entries e
         ON e.id = r.entry_id AND e.operator_id = r.operator_id AND e.deleted_at IS NULL
      WHERE r.operator_id = ?${before ? ' AND r.created_at < ?' : ''}
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ?`,
    ...(before ? [operatorId, before, limit] : [operatorId, limit]),
  )

  const counts = await loadCorrectionCounts(db, operatorId)

  return {
    corrections: rows.map(r => {
      const by = asCorrectedBy(r.by_whom)
      const { line, kind } = describeCorrection(r.field, by)
      return {
        id: r.id,
        entry_id: r.entry_id,
        field: r.field,
        old_value: r.old_value,
        new_value: r.new_value,
        at: r.created_at,
        by,
        line,
        kind,
        entry_text: r.entry_text,
        entry_buried: !!r.buried_at,
      }
    }),
    next_before: rows.length === limit ? rows[rows.length - 1].created_at : null,
    counts,
  }
}

export async function loadCorrectionCounts(db: D1Database, operatorId: string): Promise<CorrectionCounts> {
  const row = await findOne<{
    corrections: number; by_him: number; lost: number; guesses: number
  }>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM entry_revisions WHERE operator_id = ?1) AS corrections,
       (SELECT COUNT(*) FROM entry_revisions
         WHERE operator_id = ?1 AND by_whom = 'operator') AS by_him,
       (SELECT COUNT(*) FROM entry_revisions
         WHERE operator_id = ?1 AND old_value IS NULL) AS lost,
       (SELECT COUNT(*) FROM log_entries
         WHERE operator_id = ?1 AND deleted_at IS NULL
           AND (date_precision <> 'exact'
                OR author <> 'operator'
                OR visibility = 'held'
                OR source_ref LIKE 'said:%')) AS guesses`,
    operatorId,
  )
  return {
    corrections: row?.corrections || 0,
    by_him: row?.by_him || 0,
    guesses: row?.guesses || 0,
    lost: row?.lost || 0,
  }
}
