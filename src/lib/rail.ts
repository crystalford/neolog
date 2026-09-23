/**
 * The four things beside the log, read once instead of fetched four times.
 *
 * ⚠️ 21 Sep. `/` became a Server Component on 20 Sep and reads the feed
 * straight out of D1 — 200 rows and 40 day dividers in the document, TTFB
 * 492ms warm, against ~1.7s to first content before. The RAIL did not move:
 * it still fired four separate requests on mount, each doing its own auth,
 * its own `readyDb`, its own queries, after the page had already rendered.
 *
 * So the operator's complaint — *"the content loads after the site"* —
 * was half fixed. The half that stayed is the half beside the feed.
 *
 * This runs all four on the server, in the same request that renders the
 * page, and hands the result to the client as `initial`. Nothing fetches on
 * mount any more; the cards are in the document.
 *
 * ── Why one function and not one endpoint ───────────────────────────────
 *
 * The obvious move is a single `/api/v2/rail` returning all four. That is a
 * fifth place the same four queries live, and it would still be a round
 * trip after the page. `feed.ts` already established the shape this repo
 * uses: **one function, called by the page and by the route.** Each of the
 * four routes stays exactly where it is and calls the function here, so
 * `/clear` and `/triage` and the rest keep working unchanged for the pages
 * that are about them.
 *
 * ── ⚠️ Every card still fails alone ──────────────────────────────────────
 *
 * This is load-bearing, and it is why each read is wrapped separately
 * rather than the whole thing in one try. `/api/v2/onthisday` returned 500
 * on every request for weeks and nobody knew, because the card caught its
 * own error and hid itself — the bug was bad, the hiding was right. A rail
 * that takes the page down with it is a worse failure than a rail with one
 * card missing, and the feed is what the page is for.
 */

import { findMany, findOne } from './d1'
import { presignGetUrl, type R2Env } from './r2'
import { clearSummary } from './keep'
import { openQuestions, type RecallQuestion } from './recall'
import type { D1Database } from '@cloudflare/workers-types'

export type RailEnv = R2Env

/** Nothing written for this long is what "away" means. */
export const MIN_GAP_DAYS = 3

export interface AwaySummary {
  away: boolean
  days?: number
  since?: string
  total?: number
  parts?: { label: string; n: number }[]
}

/**
 * How long since he last wrote something, and what arrived while he did not.
 *
 * ⚠️ The last thing he WROTE, not the last thing that arrived. A camera-roll
 * import would otherwise reset the clock on a month of silence, which is the
 * opposite of what this is measuring.
 *
 * Counts describe. This is never a queue and never a number to bring down.
 */
export async function awaySummary(
  db: D1Database,
  operatorId: string,
): Promise<AwaySummary> {
  const lastWritten = await findMany<{ at: string }>(
    db,
    `SELECT COALESCE(logged_at, created_at) AS at FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND author = 'operator'
      ORDER BY COALESCE(logged_at, created_at) DESC LIMIT 1`,
    operatorId,
  )
  if (!lastWritten.length) return { away: false }

  const since = lastWritten[0].at
  const days = Math.floor((Date.now() - new Date(since).getTime()) / 86400000)
  if (!isFinite(days) || days < MIN_GAP_DAYS) return { away: false }

  const [entries, vlogs, photos] = await Promise.all([
    findMany<{ n: number; source_kind: string }>(
      db,
      `SELECT COUNT(*) AS n, source_kind FROM log_entries
        WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
          AND author = 'log' AND COALESCE(logged_at, created_at) > ?
        GROUP BY source_kind`,
      operatorId, since,
    ),
    findMany<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM vlogs
        WHERE operator_id = ? AND deleted_at IS NULL AND created_at > ?`,
      operatorId, since,
    ),
    findMany<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM photos
        WHERE operator_id = ? AND deleted_at IS NULL AND created_at > ?`,
      operatorId, since,
    ),
  ])

  const parts: { label: string; n: number }[] = []
  const photoN = photos[0]?.n || 0
  const vlogN = vlogs[0]?.n || 0
  if (photoN) parts.push({ label: photoN === 1 ? 'photo' : 'photos', n: photoN })
  if (vlogN) parts.push({ label: vlogN === 1 ? 'recording' : 'recordings', n: vlogN })
  for (const e of entries) {
    if (!e.n) continue
    const label = e.source_kind === 'voice'
      ? (e.n === 1 ? 'voice note' : 'voice notes')
      : (e.n === 1 ? 'file' : 'files')
    parts.push({ label, n: e.n })
  }

  return {
    away: true, days, since,
    total: parts.reduce((n, p) => n + p.n, 0),
    parts,
  }
}

export interface OnThisDayEntry {
  id: string; text: string; detail: string | null
  happened_at: string; date_precision: string; author: string
  visibility: string; source_kind: string
  r: string | null; mime: string | null
  media_url: string | null
}
export interface OnThisDay {
  on: string
  years: { year: number; entries: OnThisDayEntry[] }[]
  empty_years: number
  first_year: number
}

/**
 * The one permitted resurfacing. Shows; never says.
 *
 * ⚠️ An approximate date is excluded. Showing a "this day" entry whose day
 * the log guessed would be the log saying something it does not know, on the
 * one surface whose whole discipline is not saying.
 */
export async function onThisDay(
  db: D1Database,
  env: RailEnv,
  operatorId: string,
  on: string,
): Promise<OnThisDay> {
  const thisYear = new Date().getUTCFullYear()

  const rows = await findMany<Omit<OnThisDayEntry, 'media_url'>>(
    db,
    `SELECT id, text, detail,
            COALESCE(happened_at, occurred_at, created_at) AS happened_at,
            -- 20 Sep: this read a column named r, which does not exist, so
            -- every request threw "no such column: r". The rail card caught
            -- it and hid itself, and On This Day had silently never worked.
            -- The column is r2_key, aliased back to r because the rows are
            -- read below as r.r.
            date_precision, author, visibility, source_kind, r2_key AS r, mime
       FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
        AND substr(COALESCE(happened_at, occurred_at, created_at), 6, 5) = ?
        AND date_precision IN ('exact', 'day')
      ORDER BY COALESCE(happened_at, occurred_at) DESC
      LIMIT 60`,
    operatorId, on,
  )

  const byYear = new Map<number, typeof rows>()
  for (const r of rows) {
    const y = new Date(r.happened_at).getUTCFullYear()
    if (isNaN(y)) continue
    byYear.set(y, [...(byYear.get(y) || []), r])
  }

  const firstRow = await findMany<{ y: string }>(
    db,
    `SELECT MIN(substr(COALESCE(happened_at, occurred_at, created_at), 1, 4)) AS y
       FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL`,
    operatorId,
  )
  const firstYear = parseInt(firstRow[0]?.y || String(thisYear), 10)

  // Only the rows that survived the grouping are signed, the lesson the feed
  // learned; and a HELD row is never signed at all, because the log has not
  // looked at it and every failure path holds back (SPEC §0.2).
  const years = await Promise.all(
    Array.from(byYear.keys()).sort((a, b) => b - a).map(async y => ({
      year: y,
      entries: await Promise.all(byYear.get(y)!.map(async r => {
        let media_url: string | null = null
        if (r.r && (r.mime || '').startsWith('image/') && r.visibility !== 'held') {
          try { media_url = await presignGetUrl(env, r.r, 24 * 3600) } catch { media_url = null }
        }
        return { ...r, media_url }
      })),
    })),
  )

  const span = Math.max(0, thisYear - firstYear + 1)
  return {
    on, years,
    empty_years: Math.max(0, span - years.length),
    first_year: firstYear,
  }
}

/**
 * How many things arrived that he has not looked at.
 *
 * ⚠️ A COUNT, and nothing else. The rail card reads one field, and it used
 * to get it by fetching sixty full rows and signing sixty R2 URLs on every
 * home page load — 1.2s, the slowest thing on the page by a factor of six.
 */
export async function triageCount(db: D1Database, operatorId: string): Promise<number> {
  const n = await findOne<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
        AND author = 'log' AND triaged_at IS NULL`,
    operatorId,
  )
  return n?.n || 0
}

export interface RailPayload {
  away: AwaySummary | null
  onthisday: OnThisDay | null
  triage: number | null
  clear: Awaited<ReturnType<typeof clearSummary>> | null
  recall: RecallQuestion[] | null
}

/**
 * All four, in one pass, with each one failing alone.
 *
 * ⚠️ `Promise.all` over four `.catch(() => null)`s rather than one try
 * around the lot. A card that cannot read its data hides itself — that is
 * how `/api/v2/onthisday` returned 500 for weeks without taking anything
 * down — and a rail that fails whole would take the feed with it. `null`
 * for a card means "not shown", which is the state it was already designed
 * to handle.
 */
export async function loadRail(
  db: D1Database,
  env: RailEnv,
  operatorId: string,
): Promise<RailPayload> {
  const quiet = <T>(p: Promise<T>, what: string): Promise<T | null> =>
    p.catch(err => {
      console.warn(`[rail] ${what}: ${err?.message || err}`)
      return null
    })

  const [away, otd, triage, clear, recall] = await Promise.all([
    quiet(awaySummary(db, operatorId), 'away'),
    quiet(onThisDay(db, env, operatorId, new Date().toISOString().slice(5, 10)), 'onthisday'),
    quiet(triageCount(db, operatorId), 'triage'),
    quiet(clearSummary(db, operatorId), 'clear'),
    quiet(openQuestions(db, operatorId), 'recall'),
  ])

  return { away, onthisday: otd, triage, clear, recall }
}
