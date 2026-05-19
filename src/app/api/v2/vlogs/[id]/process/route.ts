/**
 * POST /api/v2/vlogs/[id]/process
 *
 * Kicks off post-upload processing for a vlog that was either uploaded in
 * archive mode (status='archived') or hit an error and needs a retry.
 *
 * Resets the row to pipeline_status='uploaded' and dispatches the
 * process-upload Cloudflare Workflow. The Workflow is the long-running
 * orchestration that transcodes, extracts thumbnail, transcribes via
 * Workers AI Whisper, and (in a later commit) fans out to the three
 * extraction passes.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  // Service binding to the neolog-process-upload Worker. We can't bind the
  // workflow directly from Pages (Pages config doesn't yet support
  // [[workflows]]), so we fetch the worker's /dispatch endpoint instead and
  // it creates the workflow instance.
  PROCESS_UPLOAD?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  PIPELINE?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  HEARTBEAT_TOKEN?: string
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env

  try {
    let operator
    try {
      operator = await requireOperator(req, env)
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
      }
      throw e
    }

    // mode picks the LLM stack: `cheap` = Workers AI (Llama/Kimi),
    // `premium` = Anthropic Sonnet 4.6. Two modes only — operator collapsed
    // the prior free/auto/max picker into this. `tier` is accepted as a
    // legacy alias so cached client bundles don't break.
    const body = await req.json().catch(() => null) as {
      mode?: 'cheap' | 'premium';
      tier?: 'free' | 'premium' | 'max' | 'cheap' | 'auto';
      passes?: ('threads' | 'clip_candidates' | 'creative_elements' | 'entities')[];
    } | null
    const rawMode = body?.mode ?? body?.tier ?? 'cheap'
    const mode: 'cheap' | 'premium' = rawMode === 'premium' || rawMode === 'max' ? 'premium' : 'cheap'
    // Legacy callsites in this file still use `tier` for the PROCESS_UPLOAD
    // dispatch payload; map cheap→free, premium→premium for that path.
    const tier: 'free' | 'premium' = mode === 'premium' ? 'premium' : 'free'
    const passes = body?.passes

    const db = getDb(env)
    const vlog = await findOne<{ id: string; pipeline_status: string }>(
      db,
      'SELECT id, pipeline_status FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL',
      params.id, operator.id,
    )
    if (!vlog) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (vlog.pipeline_status === 'complete') {
      return NextResponse.json({ ok: true, already_complete: true })
    }

    // Reset status + clear stale extraction_outcomes so the new workflow
    // starts from a clean slate. Without clearing outcomes, the UI would
    // see leftover "running" entries from the prior (dead) workflow.
    try {
      await run(
        db,
        `UPDATE vlogs SET pipeline_status = 'uploaded', pipeline_error = NULL,
           extraction_outcomes = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        params.id,
      )
    } catch (err: any) {
      // Most likely cause: extraction_outcomes column missing in live D1
      // (migrations.sql wasn't fully applied). Surface the real error so we
      // know to run /api/v2/admin/run-migrations instead of guessing.
      return NextResponse.json(
        {
          error: 'Reset UPDATE failed',
          details: err?.message || String(err),
          hint: 'If this mentions a missing column, POST /api/v2/admin/run-migrations to apply pending D1 migrations.',
        },
        { status: 500 },
      )
    }

    // Prefer the DO pipeline. /reextract skips audio_extract + transcribe
    // (their artifacts exist) and runs the extract step against the
    // existing transcript. If the operator passes a passes[] subset, we
    // honor it by falling through to the legacy workflow for now (it
    // supports per-pass selection; the DO's extract step is unified).
    const wantsLegacyPasses = Array.isArray(passes) && passes.length > 0 && passes.length < 4
    if (env.PIPELINE && env.HEARTBEAT_TOKEN && !wantsLegacyPasses) {
      try {
        const res = await env.PIPELINE.fetch(`https://internal/reextract/${params.id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Heartbeat-Token': env.HEARTBEAT_TOKEN,
          },
          body: JSON.stringify({ operator_id: operator.id, mode, force: true }),
        })
        if (!res.ok) {
          const err = await res.text()
          throw new Error(`pipeline /reextract failed (${res.status}): ${err.slice(0, 400)}`)
        }
      } catch (err: any) {
        await run(
          db,
          `UPDATE vlogs SET pipeline_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          `Pipeline /reextract failed: ${err.message}`,
          params.id,
        )
        return NextResponse.json({ error: 'Pipeline dispatch failed', details: err.message }, { status: 500 })
      }
    } else if (env.PROCESS_UPLOAD) {
      try {
        const res = await env.PROCESS_UPLOAD.fetch('https://internal/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vlog_id: params.id, operator_id: operator.id, tier, passes }),
        })
        if (!res.ok) {
          const err = await res.text()
          throw new Error(`dispatch failed (${res.status}): ${err.slice(0, 500)}`)
        }
      } catch (err: any) {
        await run(
          db,
          `UPDATE vlogs SET pipeline_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          `Failed to dispatch process-upload Workflow: ${err.message}`,
          params.id,
        )
        return NextResponse.json({ error: 'Workflow dispatch failed', details: err.message }, { status: 500 })
      }
    } else {
      console.warn('[vlogs/[id]/process] Neither PIPELINE nor PROCESS_UPLOAD binding present; status reset only')
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    // Catch-all so the operator never sees a bare 500 with no body.
    return NextResponse.json(
      { error: 'Unhandled error in /process', details: err?.message || String(err) },
      { status: 500 },
    )
  }
}
