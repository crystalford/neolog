/**
 * Auto-healing sweep for the post-upload pipeline.
 *
 * Finds vlogs that have been "in a step" for longer than the step's healthy
 * checkpoint window, then either:
 *   - re-dispatches if pipeline_restart_count < MAX_RESTARTS
 *   - marks the row failed with a clear message otherwise
 *
 * ⚠️ **IT DOES NOT RUN ON A SCHEDULE.** `crons = []` in this worker's
 * wrangler.toml, disabled deliberately: a five-minute sweep is 8,640
 * invocations a month of ambient cost on a single-operator app. This header
 * said "Runs every 5 minutes… stuck workflows now self-recover" until
 * 9 Sep, and four other files described it the same way. It was not true,
 * and the sentence being in five places is why nobody noticed.
 *
 * The equivalent from the app side is `POST /api/v2/admin/reset-stuck` — a
 * pure D1 UPDATE, no model calls, no container starts — and it is a button
 * on `/settings` ("wedged half-way"), which is the shape every maintenance
 * job takes here because the operator has no terminal. This worker stays
 * deployed for the case where the DO itself needs re-arming, and its `fetch`
 * handler runs the same sweep on demand.
 *
 * If a four-hundred-recording run is coming, turning the cron back on for
 * the duration is the operator's call and one line in the toml.
 *
 * Concurrency: cron handlers are single-instance per minute boundary, so two
 * healer runs can't race on the same row. Each row is processed sequentially
 * within a single invocation.
 */

import type {
  D1Database,
  ExecutionContext,
  ScheduledController,
} from '@cloudflare/workers-types'

import { IN_FLIGHT_STATUSES } from '../../../src/lib/pipeline-status'

interface Env {
  DB: D1Database
  PROCESS_UPLOAD: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  PIPELINE?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  HEARTBEAT_TOKEN?: string
}

/**
 * ⚠️ Imported, never re-declared. This list was one of five copies and it was
 * short: `reading` — the pipeline's last step since the read path replaced
 * extraction on 8 Sep — was missing, and the healer is the only thing that
 * makes a four-hundred-recording run self-recover. A recording that hung on
 * the way onto the log stayed hung, forever, with nothing re-dispatching it,
 * and nothing anywhere reported it: every copy was internally valid and one
 * was short. `src/lib/pipeline-status.ts` is the one list now.
 *
 * ⚠️ `IN_FLIGHT_STATUSES`, not `OCCUPIED_STATUSES`. This job RE-DISPATCHES,
 * and `uploaded` covers a row the browser is still pushing bytes into —
 * re-dispatching there turns a slow upload into a broken one.
 */
const STUCK_STATUSES = IN_FLIGHT_STATUSES
// Base stuck threshold. Large files (>500 MB) get a longer grace window
// since their FFmpeg audio extract + Whisper transcribe can legitimately
// take 15-20 min on a 1+ GB vlog.
const STUCK_AFTER_MINUTES = 10
const STUCK_AFTER_MINUTES_LARGE = 25
const LARGE_FILE_BYTES = 500 * 1024 * 1024
// Bumped 3 → 6 because large vlogs need more retry budget. With chunked
// audio + Whisper retries internally, a single overall pipeline attempt
// can take 10+ min on its own.
const MAX_RESTARTS = 6

interface StuckRow {
  id: string
  operator_id: string
  pipeline_status: string
  pipeline_restart_count: number
  updated_at: string
  file_size_bytes: number | null
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(sweep(env))
  },

  // Allow manual trigger via HTTP for debugging. The cron is the production
  // path; this just lets the operator hit `/api/v2/admin/healer-tick` (or a
  // direct dispatch from a Pages route binding) to validate health without
  // waiting up to 5 minutes.
  async fetch(_req: Request, env: Env): Promise<Response> {
    const result = await sweep(env)
    return new Response(JSON.stringify(result, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    })
  },
}

async function sweep(env: Env): Promise<{
  scanned: number
  restarted: string[]
  marked_failed: string[]
  errors: Array<{ id: string; error: string }>
}> {
  const placeholders = STUCK_STATUSES.map(() => '?').join(',')
  // Use a size-aware cutoff: small/medium files use the base
  // STUCK_AFTER_MINUTES; files over LARGE_FILE_BYTES get the longer
  // STUCK_AFTER_MINUTES_LARGE window. A 1 GB vlog with 30 min of audio
  // legitimately takes ~15-20 min for FFmpeg + Whisper to finish.
  const stmt = env.DB.prepare(
    `SELECT id, operator_id, pipeline_status, pipeline_restart_count, updated_at,
            file_size_bytes
       FROM vlogs
      WHERE pipeline_status IN (${placeholders})
        AND deleted_at IS NULL
        AND (
          (COALESCE(file_size_bytes, 0) >= ?
            AND updated_at < datetime('now', ?))
          OR
          (COALESCE(file_size_bytes, 0) < ?
            AND updated_at < datetime('now', ?))
        )
      ORDER BY updated_at ASC
      LIMIT 50`,
  ).bind(
    ...STUCK_STATUSES,
    LARGE_FILE_BYTES, `-${STUCK_AFTER_MINUTES_LARGE} minutes`,
    LARGE_FILE_BYTES, `-${STUCK_AFTER_MINUTES} minutes`,
  )

  const rows = (await stmt.all<StuckRow>()).results ?? []

  const result = {
    scanned: rows.length,
    restarted: [] as string[],
    marked_failed: [] as string[],
    errors: [] as Array<{ id: string; error: string }>,
  }

  for (const row of rows) {
    try {
      if (row.pipeline_restart_count >= MAX_RESTARTS) {
        await env.DB.prepare(
          `UPDATE vlogs
              SET pipeline_status = 'failed',
                  pipeline_error = ?,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
        ).bind(
          // ⚠️ This used to say "Click Re-extract on the vlog page", and
          // that button went with the extraction dashboard on 8 Sep. A
          // failure message naming a control that does not exist is worse
          // than one naming none. What DOES retry this row is Settings →
          // transcribe the untranscribed: a failed row is not 'complete',
          // so the dry run picks it up.
          `Auto-restart limit reached (${MAX_RESTARTS} attempts). ` +
          `Was stuck in '${row.pipeline_status}' since ${row.updated_at}. ` +
          `Settings → "transcribe the untranscribed" will send it again.`,
          row.id,
        ).run()
        result.marked_failed.push(row.id)
        continue
      }

      // Prefer the DO pipeline /heal path (re-arms its alarm), fall back
      // to the legacy workflow dispatch for vlogs that hadn't migrated yet.
      let dispatched: Response
      if (env.PIPELINE && env.HEARTBEAT_TOKEN) {
        dispatched = await env.PIPELINE.fetch(`https://internal/heal/${row.id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Heartbeat-Token': env.HEARTBEAT_TOKEN,
          },
          body: JSON.stringify({ vlog_id: row.id, operator_id: row.operator_id }),
        })
      } else {
        dispatched = await env.PROCESS_UPLOAD.fetch('https://internal/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vlog_id: row.id, operator_id: row.operator_id }),
        })
      }

      if (!dispatched.ok) {
        result.errors.push({ id: row.id, error: `heal/dispatch ${dispatched.status}` })
        continue
      }

      await env.DB.prepare(
        `UPDATE vlogs
            SET pipeline_restart_count = pipeline_restart_count + 1,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
      ).bind(row.id).run()
      result.restarted.push(row.id)
    } catch (err: any) {
      result.errors.push({ id: row.id, error: err?.message || String(err) })
    }
  }

  return result
}
