/**
 * POST /api/v2/vlogs/[id]/thumbnail
 *
 * Generate a thumbnail for a single vlog. Two-branch design:
 *
 *   1. SYNC branch (default) — for H.264 / MP4 / anything renderable directly
 *      by ffmpeg's image2 muxer. Calls the FFmpeg container directly via the
 *      service binding, writes the JPEG to R2, updates D1, and returns a
 *      presigned thumbnail_url. Total ~1-2 seconds. Client swaps the image in
 *      place — no refresh.
 *
 *   2. ASYNC branch — for HEVC sources without a transcoded fallback, OR when
 *      the sync branch fails (returns 0 bytes / tiny JPEG, a known DJI Mimo
 *      vertical bug). Dispatches the locked transcode-then-thumbnail workflow
 *      and returns 202. Operator polls / waits ~30-60s.
 *
 * Idempotent: if a thumbnail (either thumbnail_url or thumbnail_r2_key) is
 * already set, returns immediately with the existing URL.
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { presignGetUrl, putObject, type R2Env } from '@/lib/r2'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  PROCESS_UPLOAD?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  FFMPEG?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

const MIN_JPEG_BYTES = 1024  // <1KB → known DJI HEVC rotation bug, force async

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
  const vlog = await findOne<{
    id: string
    mime_type: string | null
    original_filename: string | null
    r2_key: string
    transcoded_r2_key: string | null
    thumbnail_url: string | null
    thumbnail_r2_key: string | null
  }>(
    db,
    `SELECT id, mime_type, original_filename, r2_key, transcoded_r2_key, thumbnail_url, thumbnail_r2_key
       FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!vlog) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Already has a thumbnail — return it.
  if (vlog.thumbnail_url) {
    return NextResponse.json({ ok: true, already: true, thumbnail_url: vlog.thumbnail_url })
  }
  if (vlog.thumbnail_r2_key) {
    try {
      const url = await presignGetUrl(env, vlog.thumbnail_r2_key, 24 * 3600)
      return NextResponse.json({ ok: true, already: true, thumbnail_url: url })
    } catch {
      // fall through and try to regenerate
    }
  }

  const mime = (vlog.mime_type || '').toLowerCase()
  const filename = (vlog.original_filename || '').toLowerCase()
  const isHevc =
    /hevc|hev1|hvc1|x265/.test(mime) ||
    mime === 'video/quicktime' ||
    filename.endsWith('.mov')
  const hasTranscode = !!vlog.transcoded_r2_key

  // ── SYNC BRANCH ─────────────────────────────────────────────────────────
  // Try direct ffmpeg on the best available source (transcoded if present,
  // else original) UNLESS it's HEVC without a transcode — that's the known
  // failure case where direct extract returns 0 frames.
  const canTrySync = env.FFMPEG && (!isHevc || hasTranscode)

  if (canTrySync) {
    const sourceKey = vlog.transcoded_r2_key || vlog.r2_key
    const ctl = new AbortController()
    const timeoutId = setTimeout(() => ctl.abort(), 22_000)
    try {
      const presigned = await presignGetUrl(env, sourceKey, 600)
      const resp = await env.FFMPEG!.fetch('https://internal/extract-thumb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input_url: presigned, t: 1.0 }),
        signal: ctl.signal,
      } as RequestInit)
      if (resp.ok) {
        const bytes = new Uint8Array(await resp.arrayBuffer())
        clearTimeout(timeoutId)
        if (bytes.byteLength >= MIN_JPEG_BYTES) {
          const thumbKey = `${operator.id}/thumbs/${params.id}.jpg`
          await putObject(env, thumbKey, bytes, {
            httpMetadata: { contentType: 'image/jpeg' },
          })
          // Sticky update: only set if no thumbnail was set in the meantime.
          await run(
            db,
            `UPDATE vlogs
                SET thumbnail_r2_key = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND operator_id = ?
                AND thumbnail_r2_key IS NULL AND thumbnail_url IS NULL`,
            thumbKey, params.id, operator.id,
          )
          const thumbnailUrl = await presignGetUrl(env, thumbKey, 24 * 3600)
          return NextResponse.json({
            ok: true,
            method: 'direct',
            bytes: bytes.byteLength,
            thumbnail_url: thumbnailUrl,
          })
        }
        // <MIN_JPEG_BYTES → fall through to async
      }
      clearTimeout(timeoutId)
      // !resp.ok → fall through to async
    } catch {
      clearTimeout(timeoutId)
      // Network / binding / timeout → fall through to async
    }
  }

  // ── ASYNC BRANCH ────────────────────────────────────────────────────────
  if (!env.PROCESS_UPLOAD) {
    return NextResponse.json(
      {
        error:
          'Direct extract failed and PROCESS_UPLOAD service binding is missing. ' +
          'Cannot dispatch transcode-then-thumb workflow.',
      },
      { status: 503 },
    )
  }

  try {
    const res = await env.PROCESS_UPLOAD.fetch('https://internal/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vlog_id: params.id,
        operator_id: operator.id,
        extract_thumb_only: true,
      }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return NextResponse.json(
        { error: `Workflow dispatch failed (${res.status}): ${errText.slice(0, 400)}` },
        { status: 500 },
      )
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to dispatch thumbnail workflow: ${err.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json(
    {
      ok: true,
      method: 'transcode-queued',
      will_transcode: true,
      message: 'HEVC source — transcoding first. Thumbnail should appear within ~10 min. Poll this endpoint or refresh.',
    },
    { status: 202 },
  )
}
