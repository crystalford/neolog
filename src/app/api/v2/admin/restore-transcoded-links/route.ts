/**
 * POST /api/v2/admin/restore-transcoded-links
 *
 * Idempotent recovery. Walks the operator's `{operator}/transcoded/`
 * prefix in R2, lists every `<vlog_id>.mp4` file that exists on disk,
 * and SQL UPDATEs the matching vlogs row to set transcoded_r2_key —
 * BUT ONLY when transcoded_r2_key IS CURRENTLY NULL.
 *
 * Two safety rules:
 *   1. Read-only on R2 (list, no put/delete).
 *   2. D1 update is gated on `transcoded_r2_key IS NULL` — never
 *      overwrites a value that's already set.
 *
 * Worst case: does nothing. Best case: restores links for vlogs
 * whose D1 field got nulled by something we haven't found, so
 * playback URLs start resolving to the H.264 transcoded file again
 * instead of falling back to the raw HEVC original.
 *
 * Returns counts so the operator can see what happened.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, run, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database, R2Bucket } from '@cloudflare/workers-types'

export const runtime = 'edge'

interface Env {
  DB: D1Database
  VIDEOS: R2Bucket
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

  const db = getDb(env)
  const prefix = `${operator.id}/transcoded/`

  const stats = {
    transcoded_files_found: 0,
    matched_vlog_rows: 0,
    relinked: 0,           // rows we just UPDATEd (transcoded_r2_key was NULL, now set)
    already_linked: 0,     // rows whose transcoded_r2_key was already set (no-op)
    no_matching_vlog: 0,   // files in R2 with no vlog row (orphans, just noted)
    samples_relinked: [] as Array<{ vlog_id: string; key: string }>,
    samples_orphan: [] as string[],
  }

  let cursor: string | undefined
  do {
    const page: any = await env.VIDEOS.list({ prefix, cursor, limit: 1000 })
    for (const obj of page.objects ?? []) {
      const key: string = obj.key
      stats.transcoded_files_found += 1
      // Key shape: `{operator}/transcoded/{vlog_id}.mp4`
      const tail = key.slice(prefix.length)
      const vlog_id = tail.replace(/\.mp4$/i, '')
      if (!/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(vlog_id)) {
        // Doesn't look like a ULID — skip
        continue
      }

      const row = await findOne<{ id: string; transcoded_r2_key: string | null }>(
        db,
        `SELECT id, transcoded_r2_key FROM vlogs
          WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
        vlog_id, operator.id,
      )
      if (!row) {
        stats.no_matching_vlog += 1
        if (stats.samples_orphan.length < 10) stats.samples_orphan.push(key)
        continue
      }
      stats.matched_vlog_rows += 1
      if (row.transcoded_r2_key) {
        stats.already_linked += 1
        continue
      }
      // Gated UPDATE: only sets when currently NULL. Safe to re-run.
      await run(
        db,
        `UPDATE vlogs SET transcoded_r2_key = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND operator_id = ? AND transcoded_r2_key IS NULL`,
        key, vlog_id, operator.id,
      )
      stats.relinked += 1
      if (stats.samples_relinked.length < 10) {
        stats.samples_relinked.push({ vlog_id, key })
      }
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)

  return NextResponse.json({ ok: true, stats }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
