/**
 * POST /api/v2/admin/regenerate-thumbnails
 *
 * REPURPOSED: this endpoint used to dispatch FFmpeg thumbnail-only Workflows
 * across the archive. That approach was wrong — the locked transcode-first
 * step meant each thumbnail took ~10 min, the FFmpeg container max_instances
 * is 5, and the operator was left with hundreds of "TRANSCODING" tiles stuck
 * for hours with no way to cancel.
 *
 * Now it just resets stuck `pipeline_status='transcoding'` rows back to
 * `archived` so the UI is honest. The 101 in-flight Workflows from the old
 * batch keep running on Cloudflare's side (no terminate API exists); when
 * each one finishes it'll write thumbnail_url normally. The reset just
 * makes the UI stop lying about an in-progress state we have no control over.
 *
 * Thumbnails are now handled by the video-element auto-poster on /uploads
 * (Layer 2) — no backend needed for the common case.
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(req: NextRequest) {
  try {
    return await handle(req)
  } catch (err: any) {
    return NextResponse.json(
      { error: `Crashed: ${err?.message || String(err)}` },
      { status: 500 },
    )
  }
}

async function handle(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  // Reset any row stuck in transcoding back to archived. Idempotent.
  // The D1 .run() result includes meta.changes — the number of rows touched.
  const result: any = await env.DB.prepare(
    `UPDATE vlogs
        SET pipeline_status = 'archived',
            pipeline_error = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE operator_id = ?
        AND deleted_at IS NULL
        AND pipeline_status = 'transcoding'`,
  ).bind(operator.id).run()

  const reset = result?.meta?.changes ?? result?.changes ?? 0

  return NextResponse.json({
    ok: true,
    reset,
    message: reset === 0
      ? 'No rows were stuck on transcoding.'
      : `Reset ${reset} row${reset === 1 ? '' : 's'} from transcoding → archived. Any in-flight Workflows will continue on Cloudflare's side; they'll write thumbnails when they finish.`,
  })
}
