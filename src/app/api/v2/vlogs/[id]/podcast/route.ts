/**
 * POST /api/v2/vlogs/[id]/podcast { include: boolean }
 *
 * Toggle whether this vlog appears in /podcast.xml. Independent of
 * visibility — a vlog can be in the feed without being public on the
 * web, and vice versa.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { dispatchPipeline } from '@/lib/dispatch-pipeline'
import { type R2Env } from '@/lib/r2'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  PROCESS_UPLOAD?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  PIPELINE?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  HEARTBEAT_TOKEN?: string
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const { id: vlog_id } = await ctx.params
  if (!vlog_id) return NextResponse.json({ error: 'vlog id required' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { include?: boolean }
  const include = body.include === true

  const db = getDb(env)
  const vlog = await findOne<{
    id: string
    operator_id: string
    mime_type: string
    transcript_text: string | null
    audio_chunks_json: string | null
  }>(
    db,
    `SELECT id, operator_id, mime_type, transcript_text, audio_chunks_json
       FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    vlog_id, operator.id,
  )
  if (!vlog) return NextResponse.json({ error: 'not found' }, { status: 404 })

  await run(
    db,
    `UPDATE vlogs SET is_podcast = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ?`,
    include ? 1 : 0, vlog_id, operator.id,
  )

  // When adding to the feed: make sure the stitched MP3 exists. /podcast/audio
  // 503s without it. Kick off the pipeline (which will skip every step except
  // the missing artifact) so the operator doesn't have to click Re-extract too.
  let stitchTriggered = false
  if (include) {
    const mp3Key = `${vlog.operator_id}/audio/${vlog.id}/mp3.full`
    let hasMp3 = false
    try {
      hasMp3 = (await env.VIDEOS.head(mp3Key)) != null
    } catch {}
    if (!hasMp3) {
      try {
        await dispatchPipeline(env, {
          vlog_id, operator_id: operator.id, mode: 'cheap', useStart: true, reset: false,
        })
        stitchTriggered = true
      } catch (err: any) {
        console.warn(`[podcast toggle] dispatch failed: ${err?.message || err}`)
      }
    }
  }

  return NextResponse.json({
    ok: true, vlog_id, is_podcast: include,
    stitch_triggered: stitchTriggered,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
