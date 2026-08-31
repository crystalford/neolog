/**
 * Photos — the still-image half of the archive.
 *
 *   GET  → list the operator's photos, newest-taken first
 *   POST → register an uploaded photo (row insert + thumbnail store + kick
 *          vision tagging in the background)
 *
 * Upload flow: client presigns (/photos/presign) → PUTs the display JPEG to
 * R2 → POSTs here to register. The register body carries the R2 key, EXIF
 * taken_at, dimensions, and a base64 thumbnail (stored to R2, same pattern as
 * vlog thumbnails). Vision tagging runs in waitUntil so registration returns
 * immediately.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany, run } from '@/lib/d1'
import { putObject, presignGetUrl, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { describeImageFromR2, type VisionEnv } from '@/lib/vision'
import { ulid } from '@/lib/ulid'
import type { D1Database, Ai } from '@cloudflare/workers-types'

interface Env extends R2Env, VisionEnv {
  DB: D1Database
  AI: Ai
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

const VALID_SOURCES = new Set(['exif', 'file_mtime', 'upload_time_default', 'manual'])

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const url = new URL(req.url)
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10)))

  const rows = await findMany<{
    id: string; r2_key: string; thumbnail_r2_key: string | null
    original_filename: string | null; mime_type: string | null
    width: number | null; height: number | null
    taken_at: string | null; taken_at_source: string | null
    caption: string | null
    vision_description: string | null; vision_tags: string | null
    vision_status: string
    created_at: string
  }>(
    db,
    `SELECT id, r2_key, thumbnail_r2_key, original_filename, mime_type,
            width, height, taken_at, taken_at_source, caption,
            vision_description, vision_tags, vision_status, created_at
       FROM photos
      WHERE operator_id = ? AND deleted_at IS NULL
      ORDER BY COALESCE(taken_at, created_at) DESC
      LIMIT ?`,
    operator.id, limit,
  )

  // Presign thumbnail (fallback to full) GET URLs so <img> can render.
  const photos = await Promise.all(rows.map(async r => {
    let thumb_url: string | null = null
    try { thumb_url = await presignGetUrl(env, r.thumbnail_r2_key || r.r2_key, 24 * 3600) } catch {}
    let tags: string[] = []
    if (r.vision_tags) { try { tags = JSON.parse(r.vision_tags) } catch {} }
    return {
      id: r.id,
      thumb_url,
      original_filename: r.original_filename,
      width: r.width, height: r.height,
      taken_at: r.taken_at, taken_at_source: r.taken_at_source,
      caption: r.caption,
      vision_description: r.vision_description,
      vision_tags: tags,
      vision_status: r.vision_status,
      created_at: r.created_at,
    }
  }))

  return NextResponse.json({ photos }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const body = await req.json().catch(() => ({})) as {
    r2_key?: string
    original_filename?: string
    mime_type?: string
    file_size_bytes?: number
    width?: number
    height?: number
    taken_at?: string
    taken_at_source?: string
    caption?: string
    thumbnail_blob_base64?: string
  }

  const r2Key = (body.r2_key ?? '').trim()
  if (!r2Key) return NextResponse.json({ error: 'r2_key required' }, { status: 400 })
  // Ownership: the presign step always issues {operator}/photos/... keys.
  if (!r2Key.startsWith(`${operator.id}/photos/`)) {
    return NextResponse.json({ error: 'r2_key does not belong to this operator' }, { status: 403 })
  }

  const id = ulid()
  const source = VALID_SOURCES.has(body.taken_at_source ?? '') ? body.taken_at_source! : 'upload_time_default'
  const takenAt = (body.taken_at && !isNaN(new Date(body.taken_at).getTime()))
    ? new Date(body.taken_at).toISOString()
    : new Date().toISOString()

  // Store the thumbnail (base64 JPEG the client captured) to R2.
  let thumbKey: string | null = null
  if (body.thumbnail_blob_base64) {
    try {
      thumbKey = `${operator.id}/photo-thumbs/${id}.jpg`
      await putObject(env, thumbKey, base64ToBytes(body.thumbnail_blob_base64), {
        httpMetadata: { contentType: 'image/jpeg' },
      })
    } catch (err: any) {
      console.warn(`[photos] thumbnail store failed: ${err?.message || err}`)
      thumbKey = null
    }
  }

  await run(
    db,
    `INSERT INTO photos (
        id, operator_id, r2_key, thumbnail_r2_key, original_filename,
        mime_type, file_size_bytes, width, height,
        taken_at, taken_at_source, caption, vision_status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    id, operator.id, r2Key, thumbKey,
    (body.original_filename ?? '').slice(0, 260),
    (body.mime_type ?? 'image/jpeg').slice(0, 60),
    body.file_size_bytes ?? null,
    body.width ?? null, body.height ?? null,
    takenAt, source,
    (body.caption ?? '').slice(0, 2000) || null,
  )

  // Vision tagging in the background — registration returns immediately.
  const { ctx } = getRequestContext()
  ctx.waitUntil((async () => {
    try {
      const result = await describeImageFromR2(env, r2Key, 'image/jpeg')
      if (result) {
        await run(
          db,
          `UPDATE photos SET vision_description = ?, vision_tags = ?, vision_model = ?,
                             vision_status = 'done', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          result.description, JSON.stringify(result.tags), result.model, id,
        )
      } else {
        await run(db, `UPDATE photos SET vision_status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, id)
      }
    } catch (err: any) {
      console.warn(`[photos] vision tagging failed for ${id}: ${err?.message || err}`)
      try { await run(db, `UPDATE photos SET vision_status = 'failed' WHERE id = ?`, id) } catch {}
    }
  })())

  return NextResponse.json({ ok: true, id }, { headers: { 'Cache-Control': 'no-store' } })
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64
  const bin = atob(clean)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
