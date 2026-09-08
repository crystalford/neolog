/**
 * Kick the post-upload pipeline for one recording. Both
 * `/api/v2/vlogs/[id]/process` and the bulk `/api/v2/admin/reprocess-vlogs`
 * call this, so re-running one recording and re-running two hundred take the
 * identical path.
 *
 * Two backends: the PIPELINE Durable Object (which skips audio extraction and
 * transcription when their artifacts already exist) and the PROCESS_UPLOAD
 * Workflow (the full run from the file).
 *
 * Fire-and-forget: it returns once the dispatch call returns OK; the run
 * happens asynchronously.
 *
 * `mode` and `passes` used to choose an extraction tier and a subset of the
 * four passes. There are no passes now — the last step reads the transcript
 * with no model in it — so they survive only as the shape the DO and the
 * Workflow still accept, and neither changes what is produced.
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
  /** Vestigial: the pipeline has no tiers left. Kept for the DO's payload. */
  mode?: 'cheap' | 'premium'
  passes?: string[]
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
