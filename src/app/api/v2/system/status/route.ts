/**
 * GET /api/v2/system/status
 *
 * Single source of truth for "is the system healthy right now."
 *
 * Returns:
 *   - dependency health: D1, R2, FFmpeg container (/boot-info), Workers AI,
 *     PROCESS_UPLOAD workflow dispatch
 *   - per-row counts: vlogs by status, threads, clusters, prompts
 *   - recent pipeline failures (last 24h, untruncated error_full_text)
 *
 * The operator opens the /system page when something feels off and reads
 * THIS payload to know which service is down. AI assistant reads it too —
 * no more guessing from upstream 503s.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  VIDEOS?: any
  AI?: any
  FFMPEG?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  PROCESS_UPLOAD?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

interface DependencyResult {
  ok: boolean
  ms: number
  detail?: string
  error?: string
}

export async function GET(req: NextRequest) {
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

  const [
    d1Health, r2Health, ffmpegHealth, workersAiHealth, workflowHealth,
    counts,
    recentFailures,
  ] = await Promise.all([
    pingD1(db),
    pingR2(env),
    pingFfmpegContainer(env),
    pingWorkersAi(env),
    pingProcessUpload(env),
    loadCounts(db, operator.id),
    loadRecentFailures(db, operator.id),
  ])

  return NextResponse.json({
    dependencies: {
      d1: d1Health,
      r2: r2Health,
      ffmpeg_container: ffmpegHealth,
      workers_ai: workersAiHealth,
      workflow_dispatch: workflowHealth,
    },
    ...counts,
    recent_failures: recentFailures,
  })
}

async function pingD1(db: D1Database): Promise<DependencyResult> {
  const t0 = Date.now()
  try {
    await db.prepare('SELECT 1 AS n').first()
    return { ok: true, ms: Date.now() - t0 }
  } catch (err: any) {
    return { ok: false, ms: Date.now() - t0, error: err?.message || String(err) }
  }
}

async function pingR2(env: Env): Promise<DependencyResult> {
  const t0 = Date.now()
  try {
    if (!env.VIDEOS) return { ok: false, ms: 0, error: 'VIDEOS binding missing' }
    await env.VIDEOS.list({ limit: 1 })
    return { ok: true, ms: Date.now() - t0 }
  } catch (err: any) {
    return { ok: false, ms: Date.now() - t0, error: err?.message || String(err) }
  }
}

async function pingFfmpegContainer(env: Env): Promise<DependencyResult> {
  const t0 = Date.now()
  try {
    if (!env.FFMPEG) {
      return { ok: false, ms: 0, error: 'FFMPEG service binding missing on Pages project' }
    }
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 8000)
    try {
      const r = await env.FFMPEG.fetch('https://ffmpeg.neolog.internal/boot-info', {
        method: 'GET',
        signal: ctl.signal,
      } as RequestInit)
      clearTimeout(timer)
      if (!r.ok) {
        const body = (await r.text()).slice(0, 500)
        return { ok: false, ms: Date.now() - t0, error: `HTTP ${r.status}: ${body}` }
      }
      const body = await r.text()
      return { ok: true, ms: Date.now() - t0, detail: body.slice(0, 300) }
    } finally {
      clearTimeout(timer)
    }
  } catch (err: any) {
    return { ok: false, ms: Date.now() - t0, error: err?.message || String(err) }
  }
}

async function pingWorkersAi(env: Env): Promise<DependencyResult> {
  const t0 = Date.now()
  try {
    if (!env.AI) return { ok: false, ms: 0, error: 'AI binding missing' }
    const result = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [{ role: 'user', content: 'reply with the single word: ok' }],
      max_tokens: 8,
    })
    const text = (result?.response || '').toString().trim().toLowerCase()
    return {
      ok: text.length > 0,
      ms: Date.now() - t0,
      detail: text.slice(0, 100),
    }
  } catch (err: any) {
    return { ok: false, ms: Date.now() - t0, error: err?.message || String(err) }
  }
}

async function pingProcessUpload(env: Env): Promise<DependencyResult> {
  const t0 = Date.now()
  if (!env.PROCESS_UPLOAD) {
    return { ok: false, ms: 0, error: 'PROCESS_UPLOAD service binding missing on Pages project' }
  }
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 5000)
    try {
      const r = await env.PROCESS_UPLOAD.fetch('https://internal/', {
        method: 'GET',
        signal: ctl.signal,
      } as RequestInit)
      clearTimeout(timer)
      const ok = r.status < 500
      return { ok, ms: Date.now() - t0, detail: `HTTP ${r.status}` }
    } finally {
      clearTimeout(timer)
    }
  } catch (err: any) {
    return { ok: false, ms: Date.now() - t0, error: err?.message || String(err) }
  }
}

async function loadCounts(db: D1Database, operatorId: string) {
  const queries = await Promise.all([
    findOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM vlogs WHERE operator_id = ? AND deleted_at IS NULL', operatorId),
    findOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM vlogs WHERE operator_id = ? AND pipeline_status = 'complete' AND deleted_at IS NULL", operatorId),
    findOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM vlogs WHERE operator_id = ? AND pipeline_status = 'transcribing' AND deleted_at IS NULL", operatorId),
    findOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM vlogs WHERE operator_id = ? AND pipeline_status = 'extracting' AND deleted_at IS NULL", operatorId),
    findOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM vlogs WHERE operator_id = ? AND pipeline_status = 'archived' AND deleted_at IS NULL", operatorId),
    findOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM vlogs WHERE operator_id = ? AND (pipeline_status = 'failed' OR pipeline_error IS NOT NULL) AND deleted_at IS NULL", operatorId),
    findOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM threads WHERE operator_id = ? AND deleted_at IS NULL', operatorId),
    findOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM clusters WHERE operator_id = ? AND deleted_at IS NULL', operatorId),
    findOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM prompts WHERE is_active = 1'),
  ])
  return {
    vlog_total: queries[0]?.n ?? 0,
    vlog_complete: queries[1]?.n ?? 0,
    vlog_transcribing: queries[2]?.n ?? 0,
    vlog_extracting: queries[3]?.n ?? 0,
    vlog_archived: queries[4]?.n ?? 0,
    vlog_error: queries[5]?.n ?? 0,
    thread_total: queries[6]?.n ?? 0,
    cluster_total: queries[7]?.n ?? 0,
    prompts_active: queries[8]?.n ?? 0,
  }
}

async function loadRecentFailures(db: D1Database, operatorId: string) {
  // pipeline_events created by migration runner on cold start; if it hasn't
  // applied yet (very first cold start after this deploy) return empty.
  try {
    const rs = await db.prepare(
      `SELECT id, vlog_id, step, status, runtime, worker_version,
              started_at, completed_at, duration_ms, error_full_text
         FROM pipeline_events
        WHERE operator_id = ?
          AND status = 'failed'
          AND started_at > datetime('now', '-24 hours')
        ORDER BY started_at DESC
        LIMIT 25`,
    ).bind(operatorId).all()
    return rs.results ?? []
  } catch {
    return []
  }
}
