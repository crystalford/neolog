/**
 * GET /api/v2/broll
 *
 * Lists vlogs the operator has marked as B-roll (silent footage,
 * pipeline_status = 'archived'). Used by the video-essay render
 * picker to pick visual clips that will accompany the voiceover.
 *
 * Each row includes presigned playback URL + thumbnail URL so the
 * picker can render an inline <video> or a thumbnail.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { presignGetUrl, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

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
    id: string; original_filename: string | null
    r2_key: string; transcoded_r2_key: string | null
    thumbnail_r2_key: string | null; thumbnail_url: string | null
    duration_seconds: number | null
    file_size_bytes: number | null
    recorded_at: string | null; uploaded_at: string
  }>(
    db,
    `SELECT id, original_filename, r2_key, transcoded_r2_key,
            thumbnail_r2_key, thumbnail_url,
            duration_seconds, file_size_bytes, recorded_at, uploaded_at
       FROM vlogs
      WHERE operator_id = ? AND deleted_at IS NULL
        AND pipeline_status = 'archived'
      ORDER BY recorded_at DESC, uploaded_at DESC
      LIMIT 200`,
    operator.id,
  )

  const broll = await Promise.all(rows.map(async v => {
    let playback: string | null = null
    let thumb: string | null = v.thumbnail_url
    try {
      const key = v.transcoded_r2_key || v.r2_key
      playback = await presignGetUrl(env, key, 3600)
    } catch {}
    if (!thumb && v.thumbnail_r2_key) {
      try { thumb = await presignGetUrl(env, v.thumbnail_r2_key, 24 * 3600) } catch {}
    }
    return {
      id: v.id,
      filename: v.original_filename,
      duration_sec: v.duration_seconds,
      size_bytes: v.file_size_bytes,
      recorded_at: v.recorded_at,
      uploaded_at: v.uploaded_at,
      playback_url: playback,
      thumbnail_url: thumb,
    }
  }))

  return NextResponse.json({ broll, count: broll.length })
}
