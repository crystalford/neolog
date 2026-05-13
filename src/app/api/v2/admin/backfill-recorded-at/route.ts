/**
 * POST /api/v2/admin/backfill-recorded-at
 *
 * Cursor-paginated backfill of `recorded_at` + `recorded_at_source` for
 * archived vlogs that imported with no date (filename-only inference at
 * import time, no mvhd attempt). Runs the same four-tier `deriveRecordedAt`
 * used at fresh-upload registration time.
 *
 * Request body: { cursor?: string, chunk_size?: number (default 5) }
 *
 * Mirrors the fix-thumbnails-batch pattern so per-request stays under
 * Cloudflare's ~30s edge timeout. Each row reads the first 2 MB of the R2
 * object via HTTP Range to find the mvhd atom — fast (~200ms typical).
 *
 * Returns:
 *   {
 *     processed: [{ vlog_id, ok, source?, recorded_at?, error? }],
 *     next_cursor: string | null,
 *     remaining: number,
 *     done: boolean
 *   }
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { deriveRecordedAt } from '@/lib/recorded-at'
import { type R2Env } from '@/lib/r2'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

interface VlogRow {
  id: string
  r2_key: string
  original_filename: string | null
}

interface ProcessResult {
  vlog_id: string
  ok: boolean
  source?: string | null
  recorded_at?: string | null
  error?: string
}

export async function POST(req: NextRequest) {
  try {
    return await handle(req)
  } catch (err: any) {
    return NextResponse.json(
      { error: `Backfill crashed: ${err?.message || String(err)}`, stack: err?.stack?.slice(0, 800) },
      { status: 500 },
    )
  }
}

async function handle(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const body = await req.json().catch(() => ({})) as { cursor?: string; chunk_size?: number }
  const cursor = body.cursor || ''
  const chunkSize = Math.max(1, Math.min(20, body.chunk_size ?? 5))

  const db = getDb(env)

  // Count of rows still needing backfill. "Needing backfill" = no recorded_at
  // OR source is the upload-time fallback OR source is NULL.
  const remainingResult = await db.prepare(
    `SELECT COUNT(*) AS c FROM vlogs
       WHERE operator_id = ?
         AND deleted_at IS NULL
         AND (recorded_at IS NULL
              OR recorded_at_source IS NULL
              OR recorded_at_source = 'upload_time_default')`,
  ).bind(operator.id).first<{ c: number }>()
  const remaining = remainingResult?.c ?? 0

  // Fetch next chunk
  const rows = await findMany<VlogRow>(
    db,
    `SELECT id, r2_key, original_filename
       FROM vlogs
      WHERE operator_id = ?
        AND deleted_at IS NULL
        AND (recorded_at IS NULL
             OR recorded_at_source IS NULL
             OR recorded_at_source = 'upload_time_default')
        AND id > ?
      ORDER BY id ASC
      LIMIT ?`,
    operator.id, cursor, chunkSize,
  )

  if (rows.length === 0) {
    return NextResponse.json({ processed: [], next_cursor: null, remaining: 0, done: true })
  }

  // Sequential — each row is just a 2 MB Range read + mvhd parse. 5 in a
  // row easily fits the 30s edge budget.
  const processed: ProcessResult[] = []
  for (const row of rows) {
    try {
      const derived = await deriveRecordedAt({
        clientRecordedAt: null,
        filename: row.original_filename || '',
        r2Key: row.r2_key,
        env,
      })
      if (derived.recorded_at && derived.recorded_at_source) {
        await run(
          db,
          `UPDATE vlogs
              SET recorded_at = ?, recorded_at_source = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND operator_id = ?`,
          derived.recorded_at, derived.recorded_at_source, row.id, operator.id,
        )
        processed.push({
          vlog_id: row.id,
          ok: true,
          source: derived.recorded_at_source,
          recorded_at: derived.recorded_at,
        })
      } else {
        // Mark as upload_time_default so we don't re-attempt every run.
        await run(
          db,
          `UPDATE vlogs
              SET recorded_at_source = 'upload_time_default', updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND operator_id = ?
              AND (recorded_at_source IS NULL)`,
          row.id, operator.id,
        )
        processed.push({ vlog_id: row.id, ok: false, source: 'upload_time_default' })
      }
    } catch (err: any) {
      processed.push({ vlog_id: row.id, ok: false, error: err?.message || String(err) })
    }
  }

  const nextCursor = rows[rows.length - 1].id
  const succeeded = processed.filter(p => p.ok).length
  const newRemaining = Math.max(0, remaining - succeeded - processed.filter(p => p.source === 'upload_time_default').length)

  return NextResponse.json({
    processed,
    next_cursor: nextCursor,
    remaining: newRemaining,
    done: false,
  })
}
