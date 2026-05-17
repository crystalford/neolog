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

  // ── SYNC BRANCHES ───────────────────────────────────────────────────────
  // Tier 1: /extract-thumb (direct, -noautorotate handles most HEVC rotations)
  // Tier 2: /extract-thumb-mini-transcode (2-sec re-encode, catches HEVC
  //         verticals where tier 1 still returns <1KB)
  // Tier 3 (async): dispatch the workflow's full transcode chain
  //
  // We try BOTH sync tiers for any vlog with an FFMPEG binding, including
  // HEVC without transcode — direct often succeeds now that -noautorotate
  // is set on the FFmpeg side.
  if (env.FFMPEG) {
    const sourceKey = vlog.transcoded_r2_key || vlog.r2_key

    for (const endpoint of ['/extract-thumb', '/extract-thumb-mini-transcode'] as const) {
      const ctl = new AbortController()
      const timeoutId = setTimeout(() => ctl.abort(), 22_000)
      try {
        const presigned = await presignGetUrl(env, sourceKey, 600)
        const resp = await env.FFMPEG.fetch(`https://internal${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input_url: presigned, t: 1.0 }),
          signal: ctl.signal,
        } as RequestInit)
        if (!resp.ok) {
          clearTimeout(timeoutId)
          continue  // try next tier
        }
        const bytes = new Uint8Array(await resp.arrayBuffer())
        clearTimeout(timeoutId)
        if (bytes.byteLength < MIN_JPEG_BYTES) {
          continue  // try next tier
        }
        const thumbKey = `${operator.id}/thumbs/${params.id}.jpg`
        await putObject(env, thumbKey, bytes, {
          httpMetadata: { contentType: 'image/jpeg' },
        })
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
          method: endpoint === '/extract-thumb' ? 'direct' : 'mini_transcode',
          bytes: bytes.byteLength,
          thumbnail_url: thumbnailUrl,
        })
      } catch {
        clearTimeout(timeoutId)
        // network / timeout — try next tier
      }
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

// PUT /api/v2/vlogs/[id]/thumbnail
//
// Accept a browser-captured JPEG (base64 in body) and store it directly in R2.
// Routes around the FFmpeg container entirely — used by the client-side
// "Fix thumbnails in browser" path on /uploads when the server-side cascade
// is broken or unavailable.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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

  let body: { thumbnail_blob_base64?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const b64 = body.thumbnail_blob_base64
  if (!b64 || typeof b64 !== 'string') {
    return NextResponse.json({ error: 'thumbnail_blob_base64 required' }, { status: 400 })
  }

  let bytes: Uint8Array
  try {
    const bin = atob(b64)
    bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  } catch {
    return NextResponse.json({ error: 'Invalid base64' }, { status: 400 })
  }
  if (bytes.byteLength < MIN_JPEG_BYTES) {
    return NextResponse.json({ error: `Thumbnail too small (${bytes.byteLength}B)` }, { status: 400 })
  }

  const db = getDb(env)
  const vlog = await findOne<{ id: string }>(
    db,
    `SELECT id FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!vlog) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const thumbKey = `${operator.id}/thumbs/${params.id}.jpg`
  await putObject(env, thumbKey, bytes, {
    httpMetadata: { contentType: 'image/jpeg' },
  })
  await run(
    db,
    `UPDATE vlogs
        SET thumbnail_r2_key = ?, thumbnail_url = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ?`,
    thumbKey, params.id, operator.id,
  )
  const thumbnailUrl = await presignGetUrl(env, thumbKey, 24 * 3600)
  return NextResponse.json({ ok: true, method: 'browser', bytes: bytes.byteLength, thumbnail_url: thumbnailUrl })
}
