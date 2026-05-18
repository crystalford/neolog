/**
 * Cron-triggered auto-healing sweep for the post-upload pipeline.
 *
 * Runs every 5 minutes. Finds vlogs that have been "in a step" for longer
 * than the step's healthy checkpoint window, then either:
 *   - re-dispatches the workflow if pipeline_restart_count < MAX_RESTARTS
 *   - marks the row failed with a clear message otherwise
 *
 * This replaces the manual "Restart pipeline" / "Reset stuck transcoding
 * rows" buttons that used to ride on /uploads. Stuck workflows now
 * self-recover; the operator only sees failures that genuinely need
 * attention.
 *
 * Concurrency: cron handlers are single-instance per minute boundary,
 * so two healer runs can't race on the same row. Each row is processed
 * sequentially within a single invocation.
 */

import type {
  D1Database,
  ExecutionContext,
  ScheduledController,
} from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  PROCESS_UPLOAD: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
}

const STUCK_STATUSES = ['transcoding', 'transcribing', 'extracting'] as const
const STUCK_AFTER_MINUTES = 10
const MAX_RESTARTS = 3

interface StuckRow {
  id: string
  operator_id: string
  pipeline_status: string
  pipeline_restart_count: number
  updated_at: string
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
  // datetime('now','-10 minutes') is the SQLite idiom for "older than" —
  // compares against the timestamp stored in updated_at by every workflow
  // step. A healthy workflow updates this column at least once per minute.
  const cutoff = `-${STUCK_AFTER_MINUTES} minutes`

  const stmt = env.DB.prepare(
    `SELECT id, operator_id, pipeline_status, pipeline_restart_count, updated_at
       FROM vlogs
      WHERE pipeline_status IN (${placeholders})
        AND deleted_at IS NULL
        AND updated_at < datetime('now', ?)
      ORDER BY updated_at ASC
      LIMIT 50`,
  ).bind(...STUCK_STATUSES, cutoff)

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
          `Auto-restart limit reached (${MAX_RESTARTS} attempts). ` +
          `Was stuck in '${row.pipeline_status}' since ${row.updated_at}. ` +
          `Click Re-extract on the vlog page to retry manually.`,
          row.id,
        ).run()
        result.marked_failed.push(row.id)
        continue
      }

      const dispatched = await env.PROCESS_UPLOAD.fetch('https://internal/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vlog_id: row.id, operator_id: row.operator_id }),
      })

      if (!dispatched.ok) {
        result.errors.push({ id: row.id, error: `dispatch ${dispatched.status}` })
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
