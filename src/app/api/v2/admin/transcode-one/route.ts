/**
 * POST /api/v2/admin/transcode-one
 *
 * Synchronously transcodes ONE vlog from its HEVC original to H.264 MP4,
 * writes it to R2, sets transcoded_r2_key in D1. Same FFmpeg call the
 * workflow at workers/process-upload/src/workflow.ts:379 makes — except
 * here we surface the real error instead of swallowing it inside softStep.
 *
 * Body: { vlog_id }
 * - Verifies operator ownership.
 * - Idempotent: skips if transcoded_r2_key is already set.
 * - Returns the FULL FFmpeg error text on failure (no truncation). That's
 *   the diagnostic that's been hidden for months.
 *
 * Single vlog at a time. No bulk loop. Operator drives.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { presignGetUrl } from '@/lib/r2'
import type { D1Database, R2Bucket, Fetcher } from '@cloudflare/workers-types'

export const runtime = 'edge'

interface Env {
  DB: D1Database
  VIDEOS: R2Bucket
  FFMPEG: Fetcher
  CLOUDFLARE_ACCOUNT_ID: string
  R2_BUCKET_NAME: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  [k: string]: unknown
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }

  const body = await req.json().catch(() => null) as { vlog_id?: string } | null
  if (!body?.vlog_id || typeof body.vlog_id !== 'string') {
    return NextResponse.json({ error: 'vlog_id required' }, { status: 400 })
  }

  const db = getDb(env)
  const vlog = await findOne<{
    id: string
    operator_id: string
    r2_key: string
    transcoded_r2_key: string | null
    mime_type: string | null
    original_filename: string | null
  }>(
    db,
    `SELECT id, operator_id, r2_key, transcoded_r2_key, mime_type, original_filename
       FROM vlogs
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    body.vlog_id, operator.id,
  )

  if (!vlog) {
    return NextResponse.json({ error: 'Vlog not found' }, { status: 404 })
  }
  if (vlog.transcoded_r2_key) {
    return NextResponse.json({
      ok: true,
      skipped: 'already_transcoded',
      transcoded_r2_key: vlog.transcoded_r2_key,
    })
  }

  // Presign the original so the FFmpeg Container Worker can fetch it.
  let inputUrl: string
  try {
    inputUrl = await presignGetUrl(env, vlog.r2_key, 3600)
  } catch (err: any) {
    return NextResponse.json({
      error: 'Failed to presign R2 GET for original',
      detail: err?.message || String(err),
      r2_key: vlog.r2_key,
    }, { status: 500 })
  }

  // Same call the workflow makes — but we read the full error if it fails.
  let ffmpegResp: Response
  try {
    ffmpegResp = await env.FFMPEG.fetch('https://ffmpeg.neolog.internal/transcode-h264', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input_url: inputUrl }),
    }) as unknown as Response
  } catch (err: any) {
    return NextResponse.json({
      error: 'FFmpeg service binding fetch threw',
      detail: err?.message || String(err),
    }, { status: 500 })
  }

  if (!ffmpegResp.ok) {
    const errText = await ffmpegResp.text().catch(() => '<unreadable>')
    return NextResponse.json({
      error: `FFmpeg transcode-h264 returned ${ffmpegResp.status}`,
      ffmpeg_status: ffmpegResp.status,
      ffmpeg_response: errText,                // full, untruncated
      input_url_prefix: inputUrl.slice(0, 200),
      vlog_id: vlog.id,
      original_filename: vlog.original_filename,
    }, { status: 500 })
  }

  const transcodedKey = `${operator.id}/transcoded/${vlog.id}.mp4`
  try {
    // Buffer to ArrayBuffer so we can also report bytes written.
    const buf = await ffmpegResp.arrayBuffer()
    if (buf.byteLength < 1024) {
      return NextResponse.json({
        error: 'FFmpeg returned suspiciously small MP4',
        bytes: buf.byteLength,
        vlog_id: vlog.id,
      }, { status: 500 })
    }
    await env.VIDEOS.put(transcodedKey, buf, {
      httpMetadata: { contentType: 'video/mp4' },
    })

    await run(
      db,
      `UPDATE vlogs SET transcoded_r2_key = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND operator_id = ?`,
      transcodedKey, vlog.id, operator.id,
    )

    return NextResponse.json({
      ok: true,
      vlog_id: vlog.id,
      transcoded_r2_key: transcodedKey,
      bytes: buf.byteLength,
    })
  } catch (err: any) {
    return NextResponse.json({
      error: 'R2 put or D1 update failed after successful FFmpeg transcode',
      detail: err?.message || String(err),
    }, { status: 500 })
  }
}
