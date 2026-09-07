/**
 * The walk — a thought as a route, not a point.
 *
 * `walk.html`: "The log kept the five places your thought arrived. It should
 * also keep the route it took to get there... A page is a pile — everything
 * about one thing, newest first. A thread is a path — this led to that."
 *
 * ── Why there is no thread table ──────────────────────────────────────────
 *
 * There is one column, `log_entries.led_from`, and a thread is that column
 * followed either way. No thread id, no membership rows, no second place for
 * the truth to live. The design's own accounting agrees: "that's one link
 * per step, made when the note is split. Cheap."
 *
 * The consequence is that a thread has no name of its own and cannot be
 * renamed, and that is correct — `walk.html` renames its own example mid-page
 * ("Renamed 'a thread' later that day, so the surname wouldn't set the
 * vocabulary. The story stays."). What is kept is the route. A thread is
 * addressed by any turn on it, and every turn resolves to the same walk.
 *
 * ── The three things this has to keep that a list cannot ─────────────────
 *
 * **Loops.** A turn whose `led_from` is not the turn immediately before it in
 * time is a loop back to something earlier, and the design keeps them: "the
 * second-life page led from where it started, not from the step before it."
 * So `led_from` is followed as a real edge, never inferred from order.
 *
 * **Turns from outside the note.** The naming turn came three hours after
 * the note ended, from reading the log rather than from the shower. It is on
 * the thread. So there is no window and no session: anything that leads from
 * any turn is a turn, whenever it happened.
 *
 * **Wrong turns.** Nothing is pruned. A dead end is part of how he got there.
 */

import { findMany } from './d1'
import { RELATION_DEFAULT, type Relation } from './log-entry'
import type { D1Database } from '@cloudflare/workers-types'

export interface Turn {
  id: string
  text: string
  detail: string | null
  happened_at: string
  logged_at: string
  kind: string
  author: string
  visibility: string
  /** The turn this came out of. Null on the start. */
  led_from: string | null
  /**
   * The column's own two values, not new words for them: `led_from` is a
   * turn (a new event), `reflects` is a later thought about that turn.
   * `src/app/api/v2/log/route.ts` folds a `reflects` row into a layer under
   * its target rather than giving it a row, and the column defaults to
   * `led_from`.
   */
  relation: Relation
  /** Seconds after the start of the walk. */
  offset_seconds: number
  /**
   * True when `led_from` is not the turn immediately before this one in
   * time — the thread came back to something earlier.
   */
  loop: boolean
  /**
   * True when this turn happened long enough after the previous one that it
   * is a return rather than a continuation. Rendered as "3 hours later"
   * instead of "+2:05 into the note".
   */
  returned: boolean
  /** What this turn made: the pages it is attached to. */
  made: { id: string; name: string; kind: string }[]
  /** Whether the words are corrected, and what they replaced. */
  revised_at: string | null
  href: string
}

export interface Walk {
  /** The turn the walk starts from. */
  start: Turn | null
  turns: Turn[]
  /** Nothing has led from the last turn yet — the thread is still open. */
  open: boolean
}

/** Long enough after the previous turn to be a return, not a continuation. */
const RETURN_GAP_SECONDS = 45 * 60

/**
 * Every turn on the walk that the given entry is on, in the order they
 * happened.
 *
 * Two recursive walks in one query: up from the entry to the start, then
 * down from the start over everything that led from it. `UNION` (not `UNION
 * ALL`) on the descent so a `led_from` cycle terminates instead of running
 * to the depth cap, and a depth cap on the ascent for the same reason.
 */
export async function loadWalk(
  db: D1Database,
  operatorId: string,
  entryId: string,
): Promise<Walk> {
  const rows = await findMany<{
    id: string; text: string; detail: string | null
    happened_at: string; logged_at: string
    kind: string; author: string; visibility: string
    led_from: string | null; relation: string | null
  }>(
    db,
    `WITH RECURSIVE
       anc(id, led_from, depth) AS (
         SELECT id, led_from, 0 FROM log_entries
          WHERE id = ?1 AND operator_id = ?2 AND deleted_at IS NULL
         UNION ALL
         SELECT e.id, e.led_from, anc.depth + 1
           FROM log_entries e JOIN anc ON e.id = anc.led_from
          WHERE e.operator_id = ?2 AND e.deleted_at IS NULL AND anc.depth < 64
       ),
       root(id) AS (SELECT id FROM anc ORDER BY depth DESC LIMIT 1),
       tree(id) AS (
         SELECT id FROM root
         UNION
         SELECT e.id FROM log_entries e JOIN tree ON e.led_from = tree.id
          WHERE e.operator_id = ?2 AND e.deleted_at IS NULL AND e.buried_at IS NULL
       )
     SELECT le.id, le.text, le.detail,
            COALESCE(le.happened_at, le.occurred_at, le.created_at) AS happened_at,
            COALESCE(le.logged_at, le.created_at) AS logged_at,
            COALESCE(le.kind, 'said') AS kind,
            COALESCE(le.author, 'operator') AS author,
            COALESCE(le.visibility, 'public') AS visibility,
            le.led_from,
            COALESCE(le.relation, 'led_from') AS relation
       FROM log_entries le JOIN tree ON tree.id = le.id
      WHERE le.buried_at IS NULL
      ORDER BY COALESCE(le.happened_at, le.occurred_at, le.created_at) ASC
      LIMIT 500`,
    entryId, operatorId,
  )

  if (!rows.length) return { start: null, turns: [], open: false }

  // What each turn made. One query for all of them.
  const ph = rows.map(() => '?').join(',')
  const [made, revisions] = await Promise.all([
    findMany<{ entry_id: string; id: string; name: string; kind: string }>(
      db,
      `SELECT pe.entry_id, p.id, p.name, p.kind
         FROM page_entries pe
         JOIN pages p ON p.id = pe.page_id
        WHERE pe.entry_kind = 'entry' AND pe.entry_id IN (${ph})
          AND p.operator_id = ? AND p.deleted_at IS NULL AND p.merged_into IS NULL
        LIMIT 500`,
      ...rows.map(r => r.id), operatorId,
    ),
    findMany<{ entry_id: string; at: string }>(
      db,
      `SELECT entry_id, MAX(created_at) AS at FROM entry_revisions
        WHERE operator_id = ? AND field = 'text' AND entry_id IN (${ph})
        GROUP BY entry_id`,
      operatorId, ...rows.map(r => r.id),
    ),
  ])
  const madeFor = new Map<string, { id: string; name: string; kind: string }[]>()
  for (const m of made) {
    const list = madeFor.get(m.entry_id) ?? []
    list.push({ id: m.id, name: m.name, kind: m.kind })
    madeFor.set(m.entry_id, list)
  }
  const revisedFor = new Map(revisions.map(r => [r.entry_id, r.at]))

  const startMs = new Date(rows[0].happened_at).getTime()
  const turns: Turn[] = rows.map((r, i) => {
    const ms = new Date(r.happened_at).getTime()
    const prev = i > 0 ? rows[i - 1] : null
    const prevMs = prev ? new Date(prev.happened_at).getTime() : ms
    return {
      id: r.id,
      text: r.text,
      detail: r.detail,
      happened_at: r.happened_at,
      logged_at: r.logged_at,
      kind: r.kind,
      author: r.author,
      visibility: r.visibility,
      led_from: r.led_from,
      relation: (r.relation as Relation) || RELATION_DEFAULT,
      offset_seconds: isNaN(ms) || isNaN(startMs) ? 0 : Math.round((ms - startMs) / 1000),
      // A loop is a real edge that skips back past the previous turn. The
      // order alone never decides this.
      loop: !!(prev && r.led_from && r.led_from !== prev.id),
      returned: !!(prev && !isNaN(ms) && !isNaN(prevMs) && (ms - prevMs) / 1000 > RETURN_GAP_SECONDS),
      made: madeFor.get(r.id) ?? [],
      revised_at: revisedFor.get(r.id) ?? null,
      href: `/entry/${r.id}`,
    }
  })

  return { start: turns[0] ?? null, turns, open: true }
}
