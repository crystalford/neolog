/**
 * Cross-runtime helper for emitting a pipeline event from a Worker or Pages
 * Function to the VlogPipelineDO. Used by:
 *   - workers/process-upload/src/workflow.ts (per-step status)
 *   - workers/ffmpeg/server.js (container heartbeats — uses a JS variant)
 *   - workers/extract worker (LLM call progress)
 *
 * The DO inserts the event into D1's pipeline_events table AND fans it out
 * to any connected WebSocket clients on /api/v2/vlogs/[id]/ws.
 *
 * If the PIPELINE service binding isn't present (older deploys), we fall
 * back to direct D1 insert so live progress is degraded-but-not-broken.
 */

import type { D1Database } from '@cloudflare/workers-types'

export type PipelineStatus = 'starting' | 'running' | 'ok' | 'error' | 'retrying' | 'failed_terminal' | 'skipped'

export interface EmitOpts {
  vlog_id: string
  operator_id: string
  step: 'audio_extract' | 'transcribe' | 'extract' | string
  sub_step?: string | null
  status: PipelineStatus
  detail?: Record<string, unknown>
  duration_ms?: number | null
  error_full_text?: string | null
  attempt?: number
}

interface EmitEnv {
  PIPELINE?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  HEARTBEAT_TOKEN?: string
  DB?: D1Database
}

/**
 * Emit one event. Returns immediately on success; logs but does not throw
 * on failure — pipeline progress is observability, not correctness.
 */
export async function emitPipelineEvent(env: EmitEnv, opts: EmitOpts): Promise<void> {
  const event = {
    operator_id: opts.operator_id,
    step: opts.step,
    sub_step: opts.sub_step ?? null,
    status: opts.status,
    detail_json: JSON.stringify(opts.detail ?? {}),
    duration_ms: opts.duration_ms ?? null,
    error_full_text: opts.error_full_text ?? null,
    attempt: opts.attempt ?? 1,
    ts: Date.now(),
  }

  // Preferred path: POST to the pipeline DO worker, which inserts to D1
  // AND broadcasts to connected WS clients.
  if (env.PIPELINE && env.HEARTBEAT_TOKEN) {
    try {
      const res = await env.PIPELINE.fetch(`https://internal/event/${opts.vlog_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Heartbeat-Token': env.HEARTBEAT_TOKEN,
        },
        body: JSON.stringify(event),
      })
      if (res.ok) return
      // fall through to direct D1 insert
    } catch {
      // fall through
    }
  }

  // Fallback: direct D1 insert. UI won't see the event live, but it
  // will appear on next /events poll or page reload.
  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO pipeline_events
           (vlog_id, operator_id, step, sub_step, status, started_at, ts,
            duration_ms, detail_json, error_full_text, attempt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        opts.vlog_id, opts.operator_id, opts.step, opts.sub_step ?? null,
        opts.status, event.ts, event.ts, opts.duration_ms ?? null,
        event.detail_json, opts.error_full_text ?? null, opts.attempt ?? 1,
      ).run()
    } catch (err: any) {
      console.error('[emitPipelineEvent] D1 fallback failed:', err?.message || err)
    }
  }
}
