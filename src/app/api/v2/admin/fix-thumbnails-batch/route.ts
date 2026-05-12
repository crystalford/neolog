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
  method?: 'direct' | 'queued' | 'failed'
  bytes?: number
  error?: string
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

  const body = await req.json().catch(() => ({})) as { cursor?: string; chunk_size?: number }
  const cursor = body.cursor || ''
  // Default chunk size 2: stays well under Cloudflare's ~30s edge timeout
  // even when each row takes the full FFmpeg budget. Operator can lower to 1
  // via the client if needed.
  const chunkSize = Math.max(1, Math.min(8, body.chunk_size ?? 2))

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

  // Fetch the next chunk after the cursor.
  const rows = await findMany<VlogRow>(
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

  if (rows.length === 0) {
    return NextResponse.json({
      processed: [],
      next_cursor: null,
      remaining: 0,
      done: true,
    })
  }

  const processed: ProcessResult[] = await Promise.all(
    rows.map(row => processRow(env, db, operator.id, row)),
  )

  const nextCursor = rows[rows.length - 1].id
  // 'remaining' was computed before this batch ran — subtract what we just
  // successfully wrote so the UI shows accurate progress.
  const succeeded = processed.filter(p => p.method === 'direct').length
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
  const mime = (row.mime_type || '').toLowerCase()
  const filename = (row.original_filename || '').toLowerCase()
  const isHevc =
    /hevc|hev1|hvc1|x265/.test(mime) ||
    mime === 'video/quicktime' ||
    filename.endsWith('.mov')
  const hasTranscode = !!row.transcoded_r2_key

  // HEVC without transcode → straight to async workflow, don't waste a sync attempt
  if (isHevc && !hasTranscode) {
    return dispatchWorkflow(env, operatorId, row.id)
  }

  // Sync path: direct FFmpeg call on best available source, bounded to 20s
  // so a slow row can't push the chunk past Cloudflare's edge timeout.
  if (!env.FFMPEG) {
    return { vlog_id: row.id, ok: false, method: 'failed', error: 'FFMPEG binding missing' }
  }
  const sourceKey = row.transcoded_r2_key || row.r2_key
  const ffmpegCtl = new AbortController()
  const ffmpegTimeout = setTimeout(() => ffmpegCtl.abort(), 20_000)
  try {
    const presigned = await presignGetUrl(env, sourceKey, 600)
    const resp = await env.FFMPEG.fetch('https://internal/extract-thumb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input_url: presigned, t: 1.0 }),
      signal: ffmpegCtl.signal,
    } as RequestInit)
    if (!resp.ok) {
      clearTimeout(ffmpegTimeout)
      return dispatchWorkflow(env, operatorId, row.id, `ffmpeg ${resp.status}`)
    }
    const bytes = new Uint8Array(await resp.arrayBuffer())
    clearTimeout(ffmpegTimeout)
    if (bytes.byteLength < MIN_JPEG_BYTES) {
      return dispatchWorkflow(env, operatorId, row.id, `tiny jpeg (${bytes.byteLength}B)`)
    }
    const thumbKey = `${operatorId}/thumbs/${row.id}.jpg`
    await putObject(env, thumbKey, bytes, {
      httpMetadata: { contentType: 'image/jpeg' },
    })
    await run(
      db,
      `UPDATE vlogs
          SET thumbnail_r2_key = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND operator_id = ?
          AND thumbnail_r2_key IS NULL AND thumbnail_url IS NULL`,
      thumbKey, row.id, operatorId,
    )
    return { vlog_id: row.id, ok: true, method: 'direct', bytes: bytes.byteLength }
  } catch (err: any) {
    clearTimeout(ffmpegTimeout)
    const reason = err?.name === 'AbortError'
      ? 'ffmpeg timeout (>20s)'
      : `sync error: ${err?.message || String(err)}`
    return dispatchWorkflow(env, operatorId, row.id, reason)
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
