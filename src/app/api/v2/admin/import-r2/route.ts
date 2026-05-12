/**
 * POST /api/v2/admin/import-r2
 *
 * One-shot backfill: lists every video object in the R2 bucket and creates
 * a D1 `vlogs` row for any that don't already have one. New rows land with
 * `pipeline_status = 'archived'` so they don't auto-extract — the operator
 * opts into processing per-vlog (or in bulk) from /uploads.
 *
 * The 171 existing vlogs in R2 keep their original keys (the old
 * `b2df4f26-…/` prefix preserved from the prior Supabase deployment) — we
 * don't rename or move files. We just register them in D1.
 *
 * Idempotent: re-running skips any r2_key that already has a vlogs row.
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { ulid } from '@/lib/ulid'
import type { D1Database, R2Bucket } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  VIDEOS: R2Bucket
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'wav', 'ogg', 'flac'])

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  let cursor: string | undefined
  let totalSeen = 0
  let inserted = 0
  let skippedExisting = 0
  let skippedNonMedia = 0
  const inserts: { id: string; key: string; filename: string; size: number; mime: string; recorded_at: string | null }[] = []

  // Walk the bucket, paginated.
  do {
    const page: any = await env.VIDEOS.list({ cursor, limit: 1000 })
    for (const obj of page.objects) {
      totalSeen++
      const key: string = obj.key
      const filename = key.split('/').pop() || key
      const ext = (filename.split('.').pop() || '').toLowerCase()
      const isVideo = VIDEO_EXTENSIONS.has(ext)
      const isAudio = AUDIO_EXTENSIONS.has(ext)

      if (!isVideo && !isAudio) {
        skippedNonMedia++
        continue
      }

      // Skip transcoded outputs — those are derivatives, not originals.
      if (key.includes('/transcoded/')) {
        skippedNonMedia++
        continue
      }

      const existing = await findOne<{ id: string }>(
        env.DB,
        'SELECT id FROM vlogs WHERE r2_key = ? LIMIT 1',
        key,
      )
      if (existing) { skippedExisting++; continue }

      const mime = isVideo ? `video/${ext === 'mov' ? 'quicktime' : ext}` : `audio/${ext}`
      const recordedAt = inferDateFromFilename(filename)
      inserts.push({
        id: ulid(),
        key,
        filename,
        size: obj.size ?? 0,
        mime,
        recorded_at: recordedAt,
      })
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)

  // Bulk-insert rows. D1 batch handles up to ~100 statements per batch.
  const CHUNK = 50
  for (let i = 0; i < inserts.length; i += CHUNK) {
    const slice = inserts.slice(i, i + CHUNK)
    for (const row of slice) {
      await run(
        env.DB,
        `INSERT INTO vlogs (
           id, operator_id, r2_key, original_filename, file_size_bytes, mime_type,
           recorded_at, recorded_at_source, pipeline_status, visibility
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'archived', 'private')`,
        row.id,
        operator.id,
        row.key,
        row.filename,
        row.size,
        row.mime,
        row.recorded_at,
        row.recorded_at ? 'filename' : 'upload_time_default',
      )
      inserted++
    }
  }

  return NextResponse.json({
    ok: true,
    total_objects_scanned: totalSeen,
    inserted,
    skipped_existing: skippedExisting,
    skipped_non_media: skippedNonMedia,
  })
}

function inferDateFromFilename(name: string): string | null {
  // Mirrors the client-side capture infer + the server-side recorded_at fallback.
  const patterns: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/(\d{4})-(\d{2})-(\d{2})[\s_T](\d{2})[-:](\d{2})[-:](\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
    [/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
    [/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
    [/(\d{4})-(\d{2})-(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T00:00:00Z`],
    [/(\d{4})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T00:00:00Z`],
  ]
  for (const [re, fmt] of patterns) {
    const m = name.match(re)
    if (m) {
      const dStr = fmt(m)
      const d = new Date(dStr)
      const yr = d.getUTCFullYear()
      if (!isNaN(d.getTime()) && yr >= 1990 && yr <= new Date().getUTCFullYear() + 1) {
        return d.toISOString()
      }
    }
  }
  return null
}
