/**
 * GET /api/v2/admin/pipeline-state
 *
 * Read-only diagnostic. Aggregate counts of the recordings by what state
 * they are actually in. ZERO dispatch, ZERO model calls, ZERO container
 * starts — costs nothing to run. Called through the admin bridge before a
 * bulk run, so the operator can see what is there before starting one.
 *
 * ⚠️ Its buckets used to be the extraction engine's — `complete_with_data`,
 * `complete_no_data` and `b_roll` were all decided by joining
 * `extraction_runs`, a table dropped on 8 Sep, so the query threw
 * `no such table` on every call. `check-sql-columns.mjs` could not see it:
 * MIGRATIONS is append-only, so that table's columns are still known.
 *
 * The buckets are now the two questions this product actually asks of a
 * recording — **does it have word timings**, and **has it been read onto
 * the log** — because those are what decide whether it is one line saying
 * he recorded, or the things he said.
 *
 * Response shape:
 *   {
 *     total: number,
 *     by_status: {
 *       read: number,                  // read onto the log; entries exist
 *       transcribed_only: number,      // has word timings, not read yet
 *       words_missing: number,         // a transcript, but no word timings —
 *                                      //   these can never be read, and are
 *                                      //   exactly what needs Whisper again
 *       untranscribed: number,         // nothing at all yet
 *       stuck_in_flight: number,       // in flight for > 5 min
 *       in_flight_recent: number,
 *       archived: number,              // uploaded with auto-processing off
 *       failed: number,
 *     },
 *     stuck_examples: [{ id, status, stuck_minutes }, ...]   // first 5
 *   }
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

const STUCK_MIN_MINUTES = 5
const IN_FLIGHT_STATUSES = ['transcoding', 'transcribing', 'extracting', 'reading', 'uploaded']

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const db = getDb(env)

  try {
    // One big SELECT counts everything in one round-trip. CASE expressions
    // map each vlog row into exactly one bucket. Reuses pipeline_status +
    // transcript_text + the existence of an is_active=1 extraction_runs row.
    const inFlightSet = IN_FLIGHT_STATUSES.map(s => `'${s}'`).join(',')
    const rows = await findMany<{
      bucket: string
      n: number
    }>(
      db,
      // ⚠️ `words_missing` is the bucket worth having. A recording can
      // carry prose in `transcript_text` and no `transcript_words` — an
      // older Whisper call, or one that lost its timings — and
      // `read-recording.ts` writes NOTHING from one of those rather than
      // dating its passages by guess. Counting it as "transcribed" is how
      // four hundred recordings sit at "transcribed" and produce no entries
      // with nothing on any screen saying why.
      `WITH classified AS (
         SELECT v.id,
                CASE
                  WHEN v.pipeline_status IN (${inFlightSet})
                       AND v.updated_at < datetime('now', '-${STUCK_MIN_MINUTES} minutes')
                    THEN 'stuck_in_flight'
                  WHEN v.pipeline_status IN (${inFlightSet})
                    THEN 'in_flight_recent'
                  WHEN v.pipeline_status = 'failed'
                    THEN 'failed'
                  WHEN v.read_at IS NOT NULL
                    THEN 'read'
                  WHEN EXISTS (SELECT 1 FROM transcript_words w WHERE w.vlog_id = v.id)
                    THEN 'transcribed_only'
                  WHEN LENGTH(COALESCE(v.transcript_text, '')) >= 20
                    THEN 'words_missing'
                  WHEN v.pipeline_status = 'archived'
                    THEN 'archived'
                  ELSE 'untranscribed'
                END AS bucket
           FROM vlogs v
          WHERE v.operator_id = ? AND v.deleted_at IS NULL
       )
       SELECT bucket, COUNT(*) AS n FROM classified GROUP BY bucket`,
      operator.id,
    )

    // A zero is shown as a zero: the set of buckets must not change shape
    // depending on the answer, or a missing one reads as "not measured".
    const by_status: Record<string, number> = {
      read: 0,
      transcribed_only: 0,
      words_missing: 0,
      untranscribed: 0,
      stuck_in_flight: 0,
      in_flight_recent: 0,
      archived: 0,
      failed: 0,
    }
    let total = 0
    for (const row of rows) {
      by_status[row.bucket] = row.n
      total += row.n
    }

    // Failure breakdown: pull the latest failed_terminal pipeline_event
    // per failed vlog and classify by substring match. Lets the operator
    // see why things failed instead of a single "Failed: 35" number.
    const FAILURE_CATEGORIES: Array<{ id: string; match: RegExp; label: string }> = [
      { id: 'short_transcript', match: /transcript_text missing or too short|transcript_too_short/i, label: 'Transcript too short' },
      { id: 'whisper_timeout', match: /whisper.*timed?\s*out|workers.*timeout|exceeded the allowed/i, label: 'Whisper timeout' },
      { id: 'whisper_empty', match: /whisper returned empty/i, label: 'Whisper returned empty' },
      { id: 'ffmpeg_503', match: /ffmpeg.*503|container failed to start|durable object is overloaded/i, label: 'FFmpeg container failure' },
      { id: 'llm_degraded', match: /suspiciously short|JSON but lacks expected keys|both providers failed/i, label: 'LLM degraded response' },
      { id: 'restart_limit', match: /auto-restart limit reached/i, label: 'Stuck → healer gave up' },
    ]
    const failure_breakdown: Record<string, number> = {}
    try {
      const failedEvents = await findMany<{ vlog_id: string; error_full_text: string | null }>(
        db,
        `WITH latest AS (
           SELECT vlog_id, MAX(started_at) AS last_failed_at
             FROM pipeline_events
            WHERE operator_id = ? AND status IN ('failed', 'failed_terminal')
            GROUP BY vlog_id
         )
         SELECT pe.vlog_id, pe.error_full_text
           FROM pipeline_events pe
           JOIN latest l ON l.vlog_id = pe.vlog_id AND l.last_failed_at = pe.started_at
          WHERE pe.operator_id = ?
            AND pe.vlog_id IN (
              SELECT id FROM vlogs WHERE operator_id = ? AND pipeline_status = 'failed' AND deleted_at IS NULL
            )`,
        operator.id, operator.id, operator.id,
      )
      for (const ev of failedEvents) {
        const text = ev.error_full_text || ''
        let matched = false
        for (const cat of FAILURE_CATEGORIES) {
          if (cat.match.test(text)) {
            failure_breakdown[cat.id] = (failure_breakdown[cat.id] ?? 0) + 1
            matched = true
            break
          }
        }
        if (!matched) {
          failure_breakdown.other = (failure_breakdown.other ?? 0) + 1
        }
      }
    } catch (err: any) {
      console.warn('[pipeline-state] failure_breakdown failed:', err?.message || err)
    }

    // First few stuck examples so the operator can spot-check what they are.
    const stuck_examples = await findMany<{ id: string; status: string; stuck_minutes: number }>(
      db,
      `SELECT id, pipeline_status AS status,
              CAST((julianday('now') - julianday(updated_at)) * 24 * 60 AS INTEGER) AS stuck_minutes
         FROM vlogs
        WHERE operator_id = ? AND deleted_at IS NULL
          AND pipeline_status IN (${inFlightSet})
          AND updated_at < datetime('now', '-${STUCK_MIN_MINUTES} minutes')
        ORDER BY updated_at ASC
        LIMIT 5`,
      operator.id,
    )

    // What a run would touch. ⚠️ The dollar estimate that used to be here
    // ($0.02 an extract, $0.10 a full pipeline) was priced off the cost
    // table in `src/lib/llm.ts`, and both the table and the extraction
    // passes it priced are gone. There is no per-recording model cost left
    // to quote — Whisper and FFmpeg are Cloudflare's own billing, which this
    // route cannot see. A made-up figure on a page the operator uses to
    // decide whether to start a four-hundred-recording run is worse than no
    // figure, so it is a count of recordings and nothing else.
    const needsWhisper =
      (by_status.untranscribed ?? 0) +
      (by_status.words_missing ?? 0) +
      (by_status.archived ?? 0) +
      (by_status.stuck_in_flight ?? 0) +
      (by_status.failed ?? 0)
    const readyToRead = by_status.transcribed_only ?? 0

    return NextResponse.json({
      total,
      by_status,
      failure_breakdown,
      stuck_examples,
      counts_for_run: {
        // Needs Whisper again before anything can be read out of it.
        needs_transcribing: needsWhisper,
        // Has word timings and has not been read onto the log yet.
        ready_to_read: readyToRead,
      },
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'pipeline-state failed', details: err?.message || String(err) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
