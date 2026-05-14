/**
 * GET /api/v2/system/ffmpeg-status
 *
 * Health probe for the FFmpeg Container Worker + a count of in-flight
 * workflows competing for container slots. When a re-extract feels stuck:
 *
 *   - If container.ok === false → the container is down. Re-bootstrap.
 *   - If container.ok === true and in_flight.total > 5 → saturated. Queue
 *     is draining, just wait. max_instances=5.
 *   - If container.ok === true and in_flight.total ≤ 5 and your row is
 *     still stuck → the workflow itself died. Hit Restart pipeline.
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  FFMPEG?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try {
    operator = await requireOperator(req, env)
  } catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  // 1. Container health probe
  let containerHealth: { ok: boolean; status?: number; body?: string; error?: string; ms?: number } = { ok: false }
  if (env.FFMPEG) {
    const t0 = Date.now()
    const ctl = new AbortController()
    const timeout = setTimeout(() => ctl.abort(), 5_000)
    try {
      const r = await env.FFMPEG.fetch('https://internal/health', { signal: ctl.signal } as RequestInit)
      clearTimeout(timeout)
      const body = await r.text().catch(() => '')
      containerHealth = { ok: r.ok, status: r.status, body: body.slice(0, 200), ms: Date.now() - t0 }
    } catch (err: any) {
      clearTimeout(timeout)
      containerHealth = {
        ok: false,
        error: err?.name === 'AbortError' ? 'health probe timed out after 5s' : (err?.message || String(err)),
        ms: Date.now() - t0,
      }
    }
  } else {
    containerHealth = { ok: false, error: 'FFMPEG binding missing on env' }
  }

  // 2. In-flight workflow count — anything not in a terminal state competes for container slots
  const db = getDb(env)
  const counts = await findOne<{
    transcoding: number
    transcribing: number
    extracting: number
    uploaded: number
  }>(
    db,
    `SELECT
        SUM(CASE WHEN pipeline_status = 'transcoding'  THEN 1 ELSE 0 END) AS transcoding,
        SUM(CASE WHEN pipeline_status = 'transcribing' THEN 1 ELSE 0 END) AS transcribing,
        SUM(CASE WHEN pipeline_status = 'extracting'   THEN 1 ELSE 0 END) AS extracting,
        SUM(CASE WHEN pipeline_status = 'uploaded'     THEN 1 ELSE 0 END) AS uploaded
       FROM vlogs
      WHERE operator_id = ? AND deleted_at IS NULL`,
    operator.id,
  )

  const inFlight = {
    transcoding: counts?.transcoding ?? 0,
    transcribing: counts?.transcribing ?? 0,
    extracting: counts?.extracting ?? 0,
    uploaded: counts?.uploaded ?? 0,
    total: (counts?.transcoding ?? 0) + (counts?.transcribing ?? 0) + (counts?.extracting ?? 0) + (counts?.uploaded ?? 0),
  }

  return NextResponse.json({
    container: containerHealth,
    in_flight: inFlight,
    container_max_instances: 5,
    saturated: inFlight.total > 5,
  })
}
