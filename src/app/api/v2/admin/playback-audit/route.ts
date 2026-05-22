/**
 * GET /api/v2/admin/playback-audit
 *
 * Read-only diagnostic. Returns, for the last N vlogs (default 20):
 *   - id, original_filename, recorded_at
 *   - r2_key, transcoded_r2_key (the raw D1 values — we need to see if
 *     transcoded_r2_key is set or null)
 *   - playback_path (the R2 path the vlog detail API would presign for
 *     playback right now)
 *   - source ('transcoded' if transcoded_r2_key was used, 'original'
 *     if we fell back to r2_key)
 *   - thumbnail_r2_key (sanity-check that we have at least the thumb)
 *
 * No mutations. No presigning. Just facts from D1 + the same selector
 * logic the API uses. Operator hits this, pastes the output, we know
 * exactly what state the database is in.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

export const runtime = 'edge'

interface Env {
  DB: D1Database
  [k: string]: unknown
}

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 200)

  const db = getDb(env)
  const rows = await findMany<{
    id: string
    original_filename: string | null
    recorded_at: string | null
    mime_type: string | null
    r2_key: string
    transcoded_r2_key: string | null
    thumbnail_r2_key: string | null
    pipeline_status: string
    file_size_bytes: number | null
  }>(
    db,
    `SELECT id, original_filename, recorded_at, mime_type,
            r2_key, transcoded_r2_key, thumbnail_r2_key, pipeline_status,
            file_size_bytes
       FROM vlogs
      WHERE operator_id = ? AND deleted_at IS NULL
      ORDER BY recorded_at DESC, uploaded_at DESC
      LIMIT ?`,
    operator.id, limit,
  )

  const audit = rows.map(v => {
    const playbackKey = v.transcoded_r2_key || v.r2_key
    const source = v.transcoded_r2_key ? 'transcoded' : 'original'
    return {
      id: v.id,
      filename: v.original_filename,
      recorded_at: v.recorded_at,
      mime_type: v.mime_type,
      file_size_mb: v.file_size_bytes != null
        ? Math.round(v.file_size_bytes / 1_000_000)
        : null,
      pipeline_status: v.pipeline_status,
      r2_key: v.r2_key,
      transcoded_r2_key: v.transcoded_r2_key,
      thumbnail_r2_key: v.thumbnail_r2_key,
      playback_path: playbackKey,
      playback_source: source,
    }
  })

  const summary = {
    total_rows: audit.length,
    with_transcoded: audit.filter(a => a.transcoded_r2_key != null).length,
    without_transcoded: audit.filter(a => a.transcoded_r2_key == null).length,
    with_thumb: audit.filter(a => a.thumbnail_r2_key != null).length,
    without_thumb: audit.filter(a => a.thumbnail_r2_key == null).length,
    fallback_to_original_for_playback: audit.filter(a => a.playback_source === 'original').length,
  }

  return NextResponse.json({ summary, vlogs: audit }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
