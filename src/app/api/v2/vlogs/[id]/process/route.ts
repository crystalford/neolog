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
import { getDb, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { dispatchPipeline } from '@/lib/dispatch-pipeline'
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
    const passes = body?.passes

    const db = getDb(env)
    const vlog = await findOne<{ id: string; pipeline_status: string }>(
      db,
      'SELECT id, pipeline_status FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL',
      params.id, operator.id,
    )
    if (!vlog) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (vlog.pipeline_status === 'complete' && !body?.mode && !body?.tier) {
      // No-op only when caller didn't ask for a specific re-run.
      return NextResponse.json({ ok: true, already_complete: true })
    }

    const result = await dispatchPipeline(env, {
      vlog_id: params.id,
      operator_id: operator.id,
      mode,
      passes,
    })
    if (!result.ok) {
      return NextResponse.json(
        { error: `Dispatch failed via ${result.backend}`, details: result.error },
        { status: 500 },
      )
    }
    return NextResponse.json({ ok: true, backend: result.backend })
  } catch (err: any) {
    // Catch-all so the operator never sees a bare 500 with no body.
    return NextResponse.json(
      { error: 'Unhandled error in /process', details: err?.message || String(err) },
      { status: 500 },
    )
  }
}
