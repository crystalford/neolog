/**
 * Progress videos — time-lapse / before-after from a photo series.
 *
 *   GET  → list the operator's progress videos (with presigned play URLs)
 *   POST → build one. Body:
 *          { series_tag?: string, photo_ids?: string[],
 *            kind?: 'timelapse'|'before_after', title?, seconds_per_image?,
 *            width?, height? }
 *          Provide EITHER series_tag (all photos carrying that vision tag,
 *          ordered by taken_at) OR an explicit ordered photo_ids list.
 *
 * The build presigns each photo's display JPEG, hands the ordered URL list
 * to the FFmpeg container's /images-to-video, stores the MP4 in R2, and
 * writes a progress_videos row. Runs inline (photos are small; a dozen-image
 * time-lapse assembles in a few seconds) but tolerant — on failure the row
 * records status='failed' with the error.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany, findOne, run } from '@/lib/d1'
import { presignGetUrl, putObject, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { ulid } from '@/lib/ulid'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  FFMPEG?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const rows = await findMany<{
    id: string; title: string | null; series_tag: string | null
    kind: string; photo_count: number | null; r2_key: string | null
    status: string; error: string | null; created_at: string
  }>(
    db,
    `SELECT id, title, series_tag, kind, photo_count, r2_key, status, error, created_at
       FROM progress_videos
      WHERE operator_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 100`,
    operator.id,
  )
  const videos = await Promise.all(rows.map(async r => {
    let play_url: string | null = null
    if (r.r2_key) { try { play_url = await presignGetUrl(env, r.r2_key, 24 * 3600) } catch {} }
    return { ...r, play_url }
  }))
  return NextResponse.json({ videos }, { headers: { 'Cache-Control': 'no-store' } })
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
    series_tag?: string
    photo_ids?: string[]
    kind?: 'timelapse' | 'before_after'
    title?: string
    seconds_per_image?: number
    width?: number
    height?: number
  }
  const kind = body.kind === 'before_after' ? 'before_after' : 'timelapse'

  // Resolve the ordered photo series → r2 keys, oldest → newest.
  let photos: { id: string; r2_key: string }[] = []
  if (Array.isArray(body.photo_ids) && body.photo_ids.length > 0) {
    // Explicit list — preserve given order, but validate ownership.
    const rows = await findMany<{ id: string; r2_key: string; taken_at: string | null }>(
      db,
      `SELECT id, r2_key, taken_at FROM photos
        WHERE operator_id = ? AND deleted_at IS NULL
          AND id IN (${body.photo_ids.map(() => '?').join(',')})`,
      operator.id, ...body.photo_ids,
    )
    const byId = new Map(rows.map(r => [r.id, r]))
    photos = body.photo_ids.map(id => byId.get(id)).filter(Boolean).map(r => ({ id: r!.id, r2_key: r!.r2_key }))
  } else if (body.series_tag) {
    const tag = body.series_tag.trim().toLowerCase()
    const rows = await findMany<{ id: string; r2_key: string }>(
      db,
      `SELECT id, r2_key FROM photos
        WHERE operator_id = ? AND deleted_at IS NULL
          AND vision_tags IS NOT NULL
          AND lower(vision_tags) LIKE ?
        ORDER BY COALESCE(taken_at, created_at) ASC`,
      operator.id, `%"${tag}"%`,
    )
    photos = rows.map(r => ({ id: r.id, r2_key: r.r2_key }))
  } else {
    return NextResponse.json({ error: 'provide series_tag or photo_ids' }, { status: 400 })
  }

  if (photos.length < 2) {
    return NextResponse.json({ error: 'need at least 2 photos in the series' }, { status: 400 })
  }
  if (!env.FFMPEG) {
    return NextResponse.json({ error: 'FFmpeg binding not available' }, { status: 503 })
  }

  const id = ulid()
  const title = (body.title ?? (body.series_tag ? `${body.series_tag} — ${kind === 'before_after' ? 'before & after' : 'time-lapse'}` : 'Progress video')).slice(0, 200)
  await run(
    db,
    `INSERT INTO progress_videos (id, operator_id, title, series_tag, kind, photo_ids_json, photo_count, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'building')`,
    id, operator.id, title, body.series_tag ?? null, kind,
    JSON.stringify(photos.map(p => p.id)), photos.length,
  )

  try {
    // Presign each photo (7-day TTL so the container has time to fetch).
    const imageUrls = await Promise.all(photos.map(p => presignGetUrl(env, p.r2_key, 3600)))

    const ffResp = await env.FFMPEG.fetch('https://ffmpeg.neolog.internal/images-to-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_urls: imageUrls,
        mode: kind,
        seconds_per_image: body.seconds_per_image,
        width: body.width,
        height: body.height,
      }),
    })
    if (!ffResp.ok) {
      const errBody = (await ffResp.text()).slice(0, 500)
      throw new Error(`FFmpeg build failed (${ffResp.status}): ${errBody}`)
    }
    const bytes = new Uint8Array(await ffResp.arrayBuffer())
    const r2Key = `${operator.id}/progress-videos/${id}.mp4`
    await putObject(env, r2Key, bytes, { httpMetadata: { contentType: 'video/mp4' } })

    await run(
      db,
      `UPDATE progress_videos SET r2_key = ?, status = 'ready', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      r2Key, id,
    )
    const play_url = await presignGetUrl(env, r2Key, 24 * 3600)
    return NextResponse.json({ ok: true, id, play_url, photo_count: photos.length }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    const msg = err?.message || String(err)
    try { await run(db, `UPDATE progress_videos SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, msg.slice(0, 500), id) } catch {}
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
