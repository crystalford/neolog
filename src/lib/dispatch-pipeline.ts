/**
 * Shared dispatch primitive for kicking the post-upload pipeline for a
 * single vlog. Both the per-vlog `/api/v2/vlogs/[id]/process` route and
 * the bulk `/api/v2/admin/reprocess-vlogs` route call this — keeps the
 * dispatch path identical so a re-extract works the same whether the
 * operator triggers one vlog from the detail page or 200 from the bulk
 * action.
 *
 * Two backends:
 *   - PIPELINE (DO) `/reextract/:id` — skips audio_extract + transcribe
 *     if their artifacts already exist on R2 / in D1; runs the unified
 *     extract step against the stored transcript.
 *   - PROCESS_UPLOAD (Workflow) `/dispatch` — legacy fallback, supports
 *     per-pass subset via `passes`. Used when caller asks for legacy
 *     mode explicitly (e.g. re-running just `threads`).
 *
 * The function is fire-and-forget per vlog: it returns once the dispatch
 * call returns OK; the actual run happens asynchronously in the DO/Workflow.
 */

import { run } from './d1'
import type { D1Database } from '@cloudflare/workers-types'

export interface DispatchEnv {
  DB: D1Database
  PROCESS_UPLOAD?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  PIPELINE?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  HEARTBEAT_TOKEN?: string
}

export interface DispatchInput {
  vlog_id: string
  operator_id: string
  mode: 'cheap' | 'premium'
  passes?: ('threads' | 'clip_candidates' | 'creative_elements' | 'entities')[]
  reset?: boolean
  // When true, dispatch /start (full pipeline from audio_extract). When
  // false/undefined, dispatch /reextract (jumps straight to the LLM
  // extract step). Bulk reprocess sets this per-vlog based on whether
  // the vlog has a transcript: untranscribed → useStart, transcribed →
  // reextract (faster + cheaper).
  useStart?: boolean
}

export interface DispatchResult {
  ok: boolean
  vlog_id: string
  backend: 'pipeline_do' | 'process_upload' | 'none'
  error?: string
}

export async function dispatchPipeline(env: DispatchEnv, input: DispatchInput): Promise<DispatchResult> {
  const { vlog_id, operator_id, mode, passes } = input
  const wantsLegacyPasses = Array.isArray(passes) && passes.length > 0 && passes.length < 4
  const tier: 'free' | 'premium' = mode === 'premium' ? 'premium' : 'free'

  if (input.reset !== false) {
    try {
      await run(
        env.DB,
        `UPDATE vlogs SET pipeline_status = 'uploaded', pipeline_error = NULL,
           extraction_outcomes = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND operator_id = ?`,
        vlog_id, operator_id,
      )
    } catch (err: any) {
      return { ok: false, vlog_id, backend: 'none', error: `reset failed: ${err?.message || err}` }
    }
  }

  if (env.PIPELINE && env.HEARTBEAT_TOKEN && !wantsLegacyPasses) {
    // Untranscribed vlogs need the full pipeline (audio_extract →
    // transcribe → extract). Transcribed vlogs can skip straight to
    // the extract step via /reextract. Both go through the new gated
    // DO pipeline; neither hits the legacy process-upload Workflow.
    const route = input.useStart ? 'start' : 'reextract'
    try {
      const res = await env.PIPELINE.fetch(`https://internal/${route}/${vlog_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Heartbeat-Token': env.HEARTBEAT_TOKEN,
        },
        body: JSON.stringify({ operator_id, mode, force: true }),
      })
      if (!res.ok) {
        const errBody = await res.text()
        const msg = `pipeline /${route} failed (${res.status}): ${errBody.slice(0, 400)}`
        await run(
          env.DB,
          `UPDATE vlogs SET pipeline_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          msg, vlog_id,
        )
        return { ok: false, vlog_id, backend: 'pipeline_do', error: msg }
      }
      return { ok: true, vlog_id, backend: 'pipeline_do' }
    } catch (err: any) {
      const msg = err?.message || String(err)
      await run(
        env.DB,
        `UPDATE vlogs SET pipeline_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        `Pipeline /${route} failed: ${msg}`, vlog_id,
      )
      return { ok: false, vlog_id, backend: 'pipeline_do', error: msg }
    }
  }

  if (env.PROCESS_UPLOAD) {
    try {
      const res = await env.PROCESS_UPLOAD.fetch('https://internal/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vlog_id, operator_id, tier, passes }),
      })
      if (!res.ok) {
        const errBody = await res.text()
        const msg = `dispatch failed (${res.status}): ${errBody.slice(0, 500)}`
        await run(
          env.DB,
          `UPDATE vlogs SET pipeline_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          msg, vlog_id,
        )
        return { ok: false, vlog_id, backend: 'process_upload', error: msg }
      }
      return { ok: true, vlog_id, backend: 'process_upload' }
    } catch (err: any) {
      const msg = err?.message || String(err)
      return { ok: false, vlog_id, backend: 'process_upload', error: msg }
    }
  }

  return { ok: false, vlog_id, backend: 'none', error: 'no pipeline binding available' }
}
