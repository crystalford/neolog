/**
 * pipeline_events helper — the single source of truth for "what happened
 * to this vlog at this step." Every step of the upload + extraction pipeline
 * writes one row here with FULL UNTRUNCATED error text.
 *
 * Why this exists: the old `extraction_outcomes` JSON column on `vlogs`
 * truncated errors to 40-80 characters and was scattered across multiple
 * writers (the workflow, the healer cron, manual re-extract). When the
 * FFmpeg container had a Node syntax error and silently refused to start,
 * the only signal upstream was a generic 503 from the service binding —
 * the actual `SyntaxError: Unexpected token '}'` never surfaced anywhere
 * the operator could see. This table makes that impossible going forward.
 *
 * Schema: see migration `2026-05-18_pipeline_events` in migration-runner.ts.
 *
 * Usage:
 *   const ev = await beginEvent(db, { vlogId, operatorId, step: 'transcribe', runtime: 'pages', workerVersion: BUILD })
 *   try {
 *     // do work
 *     await okEvent(db, ev, { detail: { chunks: 3 } })
 *   } catch (err) {
 *     await failEvent(db, ev, err)
 *     throw err
 *   }
 *
 * For workflow steps that wrap their own retries, use `recordCompletedStep`
 * which writes a single row representing the final outcome (so you don't
 * pollute the log with every retry attempt).
 */

import type { D1Database } from '@cloudflare/workers-types'
import { ulid } from './ulid'

export interface BeginEventArgs {
  vlogId: string
  operatorId: string
  step: string
  runtime: 'pages' | 'workflow' | 'container' | 'cron' | 'browser'
  workerVersion?: string | null
  requestId?: string | null
}

export interface EventHandle {
  id: string
  vlogId: string
  step: string
  startedAtMs: number
}

/**
 * Insert a 'started' row and return a handle for later finalization.
 * Cheap (single INSERT). If the work crashes mid-flight without calling
 * okEvent or failEvent, the row stays at status='started' which the UI
 * surfaces as "in progress (orphaned)" — a clear signal that the runtime
 * died, not that we don't know what happened.
 */
export async function beginEvent(db: D1Database, args: BeginEventArgs): Promise<EventHandle> {
  const id = ulid()
  await db.prepare(
    `INSERT INTO pipeline_events
       (id, vlog_id, operator_id, step, status, runtime, worker_version, request_id, started_at)
     VALUES (?, ?, ?, ?, 'started', ?, ?, ?, CURRENT_TIMESTAMP)`,
  ).bind(
    id, args.vlogId, args.operatorId, args.step,
    args.runtime, args.workerVersion ?? null, args.requestId ?? null,
  ).run()
  return { id, vlogId: args.vlogId, step: args.step, startedAtMs: Date.now() }
}

/**
 * Finalize an event as successful. detail is JSON-serialized for posterity
 * (chunk counts, output sizes, model used, etc).
 */
export async function okEvent(
  db: D1Database,
  handle: EventHandle,
  opts: { detail?: Record<string, unknown> } = {},
): Promise<void> {
  const detailJson = opts.detail ? JSON.stringify(opts.detail) : null
  const durationMs = Date.now() - handle.startedAtMs
  await db.prepare(
    `UPDATE pipeline_events
        SET status = 'ok',
            completed_at = CURRENT_TIMESTAMP,
            duration_ms = ?,
            detail_json = ?
      WHERE id = ?`,
  ).bind(durationMs, detailJson, handle.id).run()
}

/**
 * Finalize an event as failed. error_full_text gets the COMPLETE error
 * message + stack, no truncation. This is the row the operator opens when
 * debugging and copies verbatim.
 */
export async function failEvent(
  db: D1Database,
  handle: EventHandle,
  err: unknown,
  opts: { detail?: Record<string, unknown> } = {},
): Promise<void> {
  const detailJson = opts.detail ? JSON.stringify(opts.detail) : null
  const durationMs = Date.now() - handle.startedAtMs
  const errText = formatError(err)
  await db.prepare(
    `UPDATE pipeline_events
        SET status = 'failed',
            completed_at = CURRENT_TIMESTAMP,
            duration_ms = ?,
            error_full_text = ?,
            detail_json = ?
      WHERE id = ?`,
  ).bind(durationMs, errText, detailJson, handle.id).run()
}

/**
 * Mark an event skipped (precondition not met, e.g. thumbnail already
 * exists). Useful so the timeline shows "skipped — already done" instead
 * of a gap.
 */
export async function skipEvent(
  db: D1Database,
  handle: EventHandle,
  reason: string,
): Promise<void> {
  await db.prepare(
    `UPDATE pipeline_events
        SET status = 'skipped',
            completed_at = CURRENT_TIMESTAMP,
            duration_ms = ?,
            detail_json = ?
      WHERE id = ?`,
  ).bind(Date.now() - handle.startedAtMs, JSON.stringify({ reason }), handle.id).run()
}

/**
 * One-shot helper for steps that don't need begin/end semantics — writes
 * a single row with started_at == completed_at. Used when emitting a
 * historical event from inside a softStep that already retried internally.
 */
export async function recordCompletedStep(
  db: D1Database,
  args: BeginEventArgs & {
    status: 'ok' | 'failed' | 'skipped'
    durationMs: number
    error?: unknown
    detail?: Record<string, unknown>
  },
): Promise<void> {
  const id = ulid()
  const errText = args.status === 'failed' && args.error !== undefined
    ? formatError(args.error)
    : null
  const detailJson = args.detail ? JSON.stringify(args.detail) : null
  await db.prepare(
    `INSERT INTO pipeline_events
       (id, vlog_id, operator_id, step, status, runtime, worker_version, request_id,
        started_at, completed_at, duration_ms, error_full_text, detail_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?,
             datetime('now', ?), CURRENT_TIMESTAMP, ?, ?, ?)`,
  ).bind(
    id, args.vlogId, args.operatorId, args.step, args.status,
    args.runtime, args.workerVersion ?? null, args.requestId ?? null,
    `-${Math.round(args.durationMs / 1000)} seconds`,
    args.durationMs, errText, detailJson,
  ).run()
}

/**
 * Read the event log for a vlog (most recent first). Used by the
 * /timeline/[id] detail page to render the pipeline status block.
 */
export async function getEventsForVlog(
  db: D1Database,
  vlogId: string,
  operatorId: string,
  limit = 200,
): Promise<PipelineEventRow[]> {
  // Restrict to events written by the new DO orchestrator. Legacy workflow
  // events used overlapping step names and would otherwise show up in the
  // /timeline/[id] live UI for already-finished vlogs.
  const rs = await db.prepare(
    `SELECT id, vlog_id, operator_id, step, sub_step, status, runtime, worker_version, request_id,
            started_at, completed_at, duration_ms, error_full_text, detail_json,
            COALESCE(ts, CAST(strftime('%s', started_at) AS INTEGER) * 1000) AS ts,
            COALESCE(attempt, 1) AS attempt
       FROM pipeline_events
      WHERE vlog_id = ? AND operator_id = ?
        AND step IN ('audio_extract', 'transcribe', 'extract')
        AND (runtime = 'pipeline' OR runtime IS NULL)
      ORDER BY ts ASC
      LIMIT ?`,
  ).bind(vlogId, operatorId, limit).all<PipelineEventRow>()
  return rs.results ?? []
}

export interface PipelineEventRow {
  id: string
  vlog_id: string
  operator_id: string
  step: string
  status: 'started' | 'ok' | 'failed' | 'skipped'
  runtime: string | null
  worker_version: string | null
  request_id: string | null
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  error_full_text: string | null
  detail_json: string | null
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    // Keep both message and stack — stack is invaluable for diagnosing
    // surprise rejections from upstream services.
    return err.stack || `${err.name}: ${err.message}`
  }
  if (typeof err === 'string') return err
  try { return JSON.stringify(err) } catch { return String(err) }
}
