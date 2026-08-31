/**
 * GET /api/v2/media?type=all|photo|video|update&limit=500
 *
 * The unified archive — photos + vlogs + status updates merged, newest-
 * capture first. One chronological feed of everything captured. Each row
 * is normalized so the client renders a single timeline regardless of kind.
 *
 * Photos come from the photos table; videos from vlogs; updates from
 * log_entries (the plain typed/backdated status-update capture — no
 * thumbnail, text is the content). Ordered by capture time (taken_at /
 * recorded_at / occurred_at), falling back to created/uploaded time.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { presignGetUrl, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

interface MediaItem {
  id: string
  kind: 'photo' | 'video' | 'update'
  thumb_url: string | null
  at: string
  title: string | null
  subtitle: string | null
  href: string
  width: number | null
  height: number | null
  duration_seconds: number | null
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
  const url = new URL(req.url)
  const type = url.searchParams.get('type') || 'all'
  const limit = Math.min(800, Math.max(1, parseInt(url.searchParams.get('limit') || '500', 10)))

  const wantPhotos = type === 'all' || type === 'photo'
  const wantVideos = type === 'all' || type === 'video'
  const wantUpdates = type === 'all' || type === 'update'

  const [photoRows, vlogRows, updateRows] = await Promise.all([
    wantPhotos ? findMany<{
      id: string; thumbnail_r2_key: string | null; r2_key: string
      caption: string | null; vision_description: string | null
      width: number | null; height: number | null
      taken_at: string | null; created_at: string
    }>(
      db,
      `SELECT id, thumbnail_r2_key, r2_key, caption, vision_description,
              width, height, taken_at, created_at
         FROM photos
        WHERE operator_id = ? AND deleted_at IS NULL
        ORDER BY COALESCE(taken_at, created_at) DESC
        LIMIT ?`,
      operator.id, limit,
    ) : Promise.resolve([]),
    wantVideos ? findMany<{
      id: string; title: string | null; original_filename: string | null
      thumbnail_r2_key: string | null; thumbnail_url: string | null
      duration_seconds: number | null
      recorded_at: string | null; created_at: string
      vision_description: string | null
    }>(
      db,
      `SELECT id, title, original_filename, thumbnail_r2_key, thumbnail_url,
              duration_seconds, recorded_at, created_at, vision_description
         FROM vlogs
        WHERE operator_id = ? AND deleted_at IS NULL
        ORDER BY COALESCE(recorded_at, created_at) DESC
        LIMIT ?`,
      operator.id, limit,
    ) : Promise.resolve([]),
    wantUpdates ? findMany<{ id: string; text: string; occurred_at: string; created_at: string }>(
      db,
      `SELECT id, text, occurred_at, created_at FROM log_entries
        WHERE operator_id = ? AND deleted_at IS NULL
        ORDER BY occurred_at DESC
        LIMIT ?`,
      operator.id, limit,
    ) : Promise.resolve([]),
  ])

  const items: MediaItem[] = []

  for (const p of photoRows) {
    let thumb: string | null = null
    try { thumb = await presignGetUrl(env, p.thumbnail_r2_key || p.r2_key, 24 * 3600) } catch {}
    items.push({
      id: p.id,
      kind: 'photo',
      thumb_url: thumb,
      at: p.taken_at || p.created_at,
      title: p.caption || null,
      subtitle: p.vision_description || null,
      href: `/photos#${p.id}`,
      width: p.width, height: p.height,
      duration_seconds: null,
    })
  }

  for (const v of vlogRows) {
    let thumb: string | null = v.thumbnail_url || null
    if (v.thumbnail_r2_key) {
      try { thumb = await presignGetUrl(env, v.thumbnail_r2_key, 24 * 3600) } catch {}
    }
    items.push({
      id: v.id,
      kind: 'video',
      thumb_url: thumb,
      at: v.recorded_at || v.created_at,
      title: v.title || v.original_filename || 'Untitled vlog',
      subtitle: v.vision_description || null,
      href: `/vlog/${v.id}`,
      width: null, height: null,
      duration_seconds: v.duration_seconds,
    })
  }

  for (const u of updateRows) {
    items.push({
      id: u.id,
      kind: 'update',
      thumb_url: null,
      at: u.occurred_at || u.created_at,
      title: null,
      subtitle: u.text,
      href: '',
      width: null, height: null,
      duration_seconds: null,
    })
  }

  // Merge-sort by capture time, newest first, then cap.
  items.sort((a, b) => (b.at || '').localeCompare(a.at || ''))
  const trimmed = items.slice(0, limit)

  return NextResponse.json({ items: trimmed }, { headers: { 'Cache-Control': 'no-store' } })
}
