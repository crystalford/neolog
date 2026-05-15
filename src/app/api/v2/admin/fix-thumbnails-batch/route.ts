/**
 * POST /api/v2/admin/fix-thumbnails-batch
 *
 * Cursor-paginated batch thumbnail generator. Mirrors the same client-driven
 * pagination as /import-supabase-thumbnails so each individual request stays
 * comfortably under Cloudflare's 30s edge response timeout.
 *
 * Request body: { cursor?: string, chunk_size?: number (default 4) }
 *
 * Per-row logic (runs CHUNK_SIZE rows in parallel via Promise.all):
 *   - HEVC source without transcode → dispatch workflow async (extract_thumb_only),
 *     mark as 'queued'. Returns quickly. Workflow runs in background.
 *   - Renderable source (H.264, MP4, or HEVC with transcoded fallback) →
 *     call FFmpeg /extract-thumb directly, write JPEG to R2, UPDATE D1.
 *     Sync, ~1-2 seconds.
 *
 * Returns:
 *   {
 *     processed: [{ vlog_id, ok, method?: 'direct' | 'queued' | 'failed', error? }],
 *     next_cursor: string | null,
 *     remaining: number,
 *     done: boolean
 *   }
 *
 * Idempotent: the UPDATE has `AND thumbnail_r2_key IS NULL AND thumbnail_url IS NULL`
 * so concurrent batches (operator double-tabbed) can't corrupt rows — at worst
 * they waste an FFmpeg call.
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { presignGetUrl, putObject, type R2Env } from '@/lib/r2'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  PROCESS_UPLOAD?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  FFMPEG?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

const MIN_JPEG_BYTES = 1024

interface VlogRow {
  id: string
  mime_type: string | null
  original_filename: string | null
  r2_key: string
  transcoded_r2_key: string | null
}

interface ProcessResult {
  vlog_id: string
  ok: boolean
  method?: 'direct' | 'mini_transcode' | 'queued' | 'failed'
  bytes?: number
  error?: string
  thumbnail_url?: string  // presigned 24h GET so the UI can render the image inline
  filename?: string       // echoed so client doesn't need to look it up
}

export async function POST(req: NextRequest) {
  try {
    return await handle(req)
  } catch (err: any) {
    return NextResponse.json(
      { error: `Batch crashed: ${err?.message || String(err)}`, stack: err?.stack?.slice(0, 800) },
      { status: 500 },
    )
  }
}

async function handle(req: NextRequest) {
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

  const body = await req.json().catch(() => ({})) as {
    cursor?: string
    chunk_size?: number
    vlog_ids?: string[]  // explicit list mode — process exactly these rows in order
  }
  const cursor = body.cursor || ''
  // Default chunk size 2: stays well under Cloudflare's ~30s edge timeout
  // even when each row takes the full FFmpeg budget. Operator can lower to 1
  // via the client if needed.
  const chunkSize = Math.max(1, Math.min(8, body.chunk_size ?? 2))
  const explicitIds = Array.isArray(body.vlog_ids) ? body.vlog_ids.slice(0, chunkSize) : null

  const db = getDb(env)

  // Count remaining (cheap — single COUNT). Helps the UI show progress.
  const remainingResult = await db.prepare(
    `SELECT COUNT(*) AS c FROM vlogs
       WHERE operator_id = ?
         AND thumbnail_url IS NULL
         AND thumbnail_r2_key IS NULL
         AND deleted_at IS NULL`,
  ).bind(operator.id).first<{ c: number }>()
  const remaining = remainingResult?.c ?? 0

  // Either: explicit vlog_ids mode (client controls order) or cursor mode.
  let rows: VlogRow[]
  if (explicitIds && explicitIds.length > 0) {
    const placeholders = explicitIds.map(() => '?').join(',')
    rows = await findMany<VlogRow>(
      db,
      `SELECT id, mime_type, original_filename, r2_key, transcoded_r2_key
         FROM vlogs
        WHERE operator_id = ?
          AND deleted_at IS NULL
          AND thumbnail_url IS NULL
          AND thumbnail_r2_key IS NULL
          AND id IN (${placeholders})`,
      operator.id, ...explicitIds,
    )
    // Re-sort to match the order client requested (DB doesn't guarantee IN
    // clause order). Operator sees their list processed top-to-bottom.
    const idx = new Map(explicitIds.map((id, i) => [id, i]))
    rows.sort((a, b) => (idx.get(a.id) ?? 999) - (idx.get(b.id) ?? 999))
  } else {
    rows = await findMany<VlogRow>(
      db,
      `SELECT id, mime_type, original_filename, r2_key, transcoded_r2_key
         FROM vlogs
        WHERE operator_id = ?
          AND thumbnail_url IS NULL
          AND thumbnail_r2_key IS NULL
          AND deleted_at IS NULL
          AND id > ?
        ORDER BY id ASC
        LIMIT ?`,
      operator.id, cursor, chunkSize,
    )
  }

  if (rows.length === 0) {
    return NextResponse.json({
      processed: [],
      next_cursor: null,
      remaining: 0,
      done: true,
    })
  }

  const processed: ProcessResult[] = await Promise.all(
    rows.map(async row => {
      const result = await processRow(env, db, operator.id, row)
      // Echo filename so the client can display the row even before re-fetching
      return { ...result, filename: row.original_filename || undefined }
    }),
  )

  const nextCursor = rows[rows.length - 1].id
  // 'remaining' was computed before this batch ran — subtract what we just
  // successfully wrote so the UI shows accurate progress.
  const succeeded = processed.filter(p => p.method === 'direct' || p.method === 'mini_transcode').length
  const newRemaining = Math.max(0, remaining - succeeded)

  return NextResponse.json({
    processed,
    next_cursor: nextCursor,
    remaining: newRemaining,
    done: false,
  })
}

async function processRow(
  env: Env,
  db: D1Database,
  operatorId: string,
  row: VlogRow,
): Promise<ProcessResult> {
  if (!env.FFMPEG) {
    return { vlog_id: row.id, ok: false, method: 'failed', error: 'FFMPEG binding missing' }
  }

  const sourceKey = row.transcoded_r2_key || row.r2_key

  // Tier 1: direct /extract-thumb (with -noautorotate). Fast path for every
  // renderable source — H.264 always works here, HEVC works for most rotation
  // metadata variants now that the flag is set on the FFmpeg side.
  const t1 = await tryExtract(env, sourceKey, '/extract-thumb', 20_000)
  if (t1.ok && t1.bytes) {
    return await persistThumb(env, db, operatorId, row.id, t1.bytes, 'direct')
  }

  // Tier 2: /extract-thumb-mini-transcode — 2-sec H.264 transcode then frame.
  // Catches HEVC verticals with malformed rotation tags that tier 1 still
  // returns 0 bytes on. ~5 sec, low memory.
  const t2 = await tryExtract(env, sourceKey, '/extract-thumb-mini-transcode', 20_000)
  if (t2.ok && t2.bytes) {
    return await persistThumb(env, db, operatorId, row.id, t2.bytes, 'mini_transcode')
  }

  // Tier 3: dispatch full transcode-then-thumb workflow (last resort, ~5-10min)
  const reason = `tier1=${t1.reason}; tier2=${t2.reason}`
  return dispatchWorkflow(env, operatorId, row.id, reason)
}

interface ExtractAttempt {
  ok: boolean
  bytes?: Uint8Array
  reason: string
}

async function tryExtract(
  env: Env,
  sourceKey: string,
  endpoint: string,
  timeoutMs: number,
): Promise<ExtractAttempt> {
  const ctl = new AbortController()
  const timeout = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const presigned = await presignGetUrl(env, sourceKey, 600)
    const resp = await env.FFMPEG!.fetch(`https://internal${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input_url: presigned, t: 1.0 }),
      signal: ctl.signal,
    } as RequestInit)
    if (!resp.ok) {
      clearTimeout(timeout)
      const errText = await resp.text().catch(() => '')
      return { ok: false, reason: `${endpoint} ${resp.status}: ${errText.slice(0, 200)}` }
    }
    const bytes = new Uint8Array(await resp.arrayBuffer())
    clearTimeout(timeout)
    if (bytes.byteLength < MIN_JPEG_BYTES) {
      return { ok: false, reason: `${endpoint} tiny jpeg (${bytes.byteLength}B)` }
    }
    return { ok: true, bytes, reason: 'ok' }
  } catch (err: any) {
    clearTimeout(timeout)
    const reason = err?.name === 'AbortError'
      ? `${endpoint} timeout (>${Math.round(timeoutMs / 1000)}s)`
      : `${endpoint} error: ${err?.message || String(err)}`
    return { ok: false, reason }
  }
}

async function persistThumb(
  env: Env,
  db: D1Database,
  operatorId: string,
  vlogId: string,
  bytes: Uint8Array,
  method: 'direct' | 'mini_transcode',
): Promise<ProcessResult> {
  const thumbKey = `${operatorId}/thumbs/${vlogId}.jpg`
  await putObject(env, thumbKey, bytes, {
    httpMetadata: { contentType: 'image/jpeg' },
  })
  await run(
    db,
    `UPDATE vlogs
        SET thumbnail_r2_key = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ?
        AND thumbnail_r2_key IS NULL AND thumbnail_url IS NULL`,
    thumbKey, vlogId, operatorId,
  )
  // Presign 24h URL so the client can render the new thumbnail inline
  // immediately. Tile shows the image right after the row completes.
  let thumbnailUrl: string | undefined
  try { thumbnailUrl = await presignGetUrl(env, thumbKey, 24 * 3600) } catch {}
  return {
    vlog_id: vlogId,
    ok: true,
    method: method as any,
    bytes: bytes.byteLength,
    thumbnail_url: thumbnailUrl,
  }
}

async function dispatchWorkflow(
  env: Env,
  operatorId: string,
  vlogId: string,
  reason?: string,
): Promise<ProcessResult> {
  if (!env.PROCESS_UPLOAD) {
    return {
      vlog_id: vlogId,
      ok: false,
      method: 'failed',
      error: reason ? `${reason}; PROCESS_UPLOAD missing` : 'PROCESS_UPLOAD missing',
    }
  }
  try {
    const res = await env.PROCESS_UPLOAD.fetch('https://internal/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vlog_id: vlogId,
        operator_id: operatorId,
        extract_thumb_only: true,
      }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return {
        vlog_id: vlogId,
        ok: false,
        method: 'failed',
        error: `dispatch ${res.status}: ${errText.slice(0, 200)}`,
      }
    }
    return { vlog_id: vlogId, ok: true, method: 'queued', error: reason }
  } catch (err: any) {
    return { vlog_id: vlogId, ok: false, method: 'failed', error: err?.message || String(err) }
  }
}
