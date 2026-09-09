/**
 * POST /api/v2/admin/reset-to-recordings — throw away everything the old
 * system wrote, and keep the recordings.
 *
 * The operator, 8 Sep: *"just save the vlogs only.. don't even bother saving
 * the transcript or anything that the old system extracted, or wrote, or the
 * threads or any of that shit"* — and the reason: *"the problem with the old
 * system was i didn't trust its output anyway. so we are going to redo all
 * that."*
 *
 * ── What survives ────────────────────────────────────────────────────────
 *
 * **The files in R2. Nothing in R2 is touched by this route at all** — there
 * is no `deleteObject` call in it and there must never be one. The 11.67 GB
 * of recordings is the only irreplaceable thing this product holds.
 *
 * The `vlogs` rows survive too, because a row is how a file is found: it
 * carries `r2_key`, and `recorded_at` with the tier that derived it. Their
 * DERIVED columns are cleared — transcript, vision, pipeline state — so the
 * log re-reads each recording from the file rather than trusting anything
 * the old passes wrote about it.
 *
 * ── What goes ────────────────────────────────────────────────────────────
 *
 * Every extraction output, every subject, every production, and every entry
 * that came from one. Also the operator's derived profile — the digest and
 * the spark seeds were a model's description of him, which is exactly the
 * output he did not trust.
 *
 * ── Why this is a route he presses and not a migration ───────────────────
 *
 * A migration runs on the first request after a deploy, unattended, with no
 * way to say no. This is irreversible for D1, so it is an act, with a
 * confirmation token in the body, and it reports what it removed.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, run, findOne } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'
import { DROPPED_TABLES } from '@/lib/dropped-tables'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

/**
 * Everything the old system wrote. Dropped, not emptied: an empty table of a
 * shape nothing reads is the "evidence of the old site" this is removing.
 */
/**
 * The tables to drop. Shared with the migration runner via
 * `src/lib/dropped-tables.ts` — the runner needs the same list to recognise
 * a migration that can never apply again, and two copies would drift.
 */
const OLD_TABLES = DROPPED_TABLES

/** Derived on `vlogs`: cleared so each recording is read again from the file. */
const VLOG_DERIVED = [
  'transcript_text', 'transcript_provider', 'transcript_completed_at',
  // ⚠️ `title` and `summary` are here for the same reason: the extraction
  // engine's last pass wrote "an AI-written title and summary back onto the
  // recording", and nothing has written either since 8 Sep. They are listed
  // in `MODEL_WRITTEN_COLUMNS` and nothing reads them any more; this is
  // where they are actually emptied, by his own act.
  'title', 'summary',
  'extraction_outcomes', 'vision_description', 'vision_tags',
  'vision_model', 'vision_status', 'read_at',
]

/** Derived on `operator`: a model's description of him. */
const OPERATOR_DERIVED = ['profile_digest', 'profile_refreshed_at', 'spark_seeds_json', 'spark_seeds_refreshed_at']

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const body = await req.json().catch(() => ({})) as { confirm?: string }
  if (body.confirm !== 'keep the recordings') {
    return NextResponse.json(
      {
        error: 'This is irreversible for the log. The recordings in R2 are untouched either way.',
        send: { confirm: 'keep the recordings' },
      },
      { status: 428 },
    )
  }

  const db = await readyDb(getDb(env), 'reset')
  const before = await findOne<{ recordings: number; entries: number }>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM vlogs WHERE operator_id = ?1) AS recordings,
       (SELECT COUNT(*) FROM log_entries WHERE operator_id = ?1) AS entries`,
    operator.id,
  )

  const dropped: string[] = []
  const failed: { table: string; why: string }[] = []
  for (const t of OLD_TABLES) {
    try { await run(db, `DROP TABLE IF EXISTS ${t}`); dropped.push(t) }
    catch (e: any) { failed.push({ table: t, why: e?.message || String(e) }) }
  }

  // The words go too — they were written by the old pipeline's run and will
  // be written again by this one. Keeping them would mean the log's entries
  // cite timings nobody re-checked.
  let words = 0
  try {
    const res: any = await run(db, `DELETE FROM transcript_words WHERE operator_id = ?`, operator.id)
    words = res?.meta?.changes ?? 0
  } catch { /* the table may already be gone */ }

  // Every entry that came out of a recording. What he typed by hand stays:
  // `source_kind = 'vlog'` and a `thread:`/`said:` ref are the old reader's
  // marks, and nothing he wrote carries either.
  const entries: any = await run(
    db,
    `UPDATE log_entries SET deleted_at = CURRENT_TIMESTAMP
      WHERE operator_id = ? AND deleted_at IS NULL
        AND (source_ref LIKE 'thread:%' OR source_ref LIKE 'said:%')`,
    operator.id,
  )

  for (const col of VLOG_DERIVED) {
    try { await run(db, `UPDATE vlogs SET ${col} = NULL WHERE operator_id = ?`, operator.id) } catch { /* column may not exist */ }
  }
  // ⚠️ This wrote `'pending'`, which is not a status anything recognises.
  // `pipelineLine` in the feed switches over every real value and falls
  // through to null on that one, so after Start again all four hundred
  // recordings showed no state at all — not "just arrived", not anything.
  // `uploaded` is what they actually are: the file is in R2 and nothing has
  // been read out of it, which is the state that says "Just arrived. Nothing
  // read yet." `scripts/check-enum-values.mjs` now holds this column.
  try {
    await run(db, `UPDATE vlogs SET pipeline_status = 'uploaded' WHERE operator_id = ?`, operator.id)
  } catch { /* fine */ }
  for (const col of OPERATOR_DERIVED) {
    try { await run(db, `UPDATE operator SET ${col} = NULL WHERE id = ?`, operator.id) } catch { /* fine */ }
  }

  return NextResponse.json(
    {
      ok: true,
      kept: {
        // Said explicitly, because this is the whole promise of the route.
        r2: 'untouched — this route contains no R2 delete',
        recordings: before?.recordings ?? 0,
      },
      removed: {
        tables: dropped,
        transcript_words: words,
        entries_from_recordings: entries?.meta?.changes ?? 0,
        vlog_columns_cleared: VLOG_DERIVED,
      },
      failed: failed.length ? failed : undefined,
      next: 'Re-transcribe from /vlogs, then read them onto the log.',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
