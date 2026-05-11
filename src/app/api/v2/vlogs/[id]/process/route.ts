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
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try {
    operator = await requireOperator(req, env)
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }

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

  // Reset status; the Workflow's first step will move it to 'transcoding'
  await run(
    db,
    `UPDATE vlogs SET pipeline_status = 'uploaded', pipeline_error = NULL,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    params.id,
  )

  // Dispatch the Workflow via the service binding to neolog-process-upload.
  if (env.PROCESS_UPLOAD) {
    try {
      const res = await env.PROCESS_UPLOAD.fetch('https://internal/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vlog_id: params.id, operator_id: operator.id }),
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
    console.warn('[vlogs/[id]/process] PROCESS_UPLOAD binding missing; status reset only')
  }

  return NextResponse.json({ ok: true })
}
