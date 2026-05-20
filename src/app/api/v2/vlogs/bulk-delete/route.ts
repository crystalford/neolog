/**
 * POST /api/v2/vlogs/bulk-delete
 *
 * Body: { ids: string[] }
 *
 * Bulk-deletes vlogs the operator owns. For each id:
 *   - removes R2 objects (original, transcoded, thumbnail) — best-effort
 *   - soft-deletes the vlog row (sets deleted_at)
 *   - CASCADE drops derived rows (threads, clips, etc.)
 *
 * Returns per-id results so the client can show "deleted 14 / failed 2".
 *
 * Operator workflow: filter /vlogs by status (e.g. "Failed"), select all
 * with the new checkboxes, click "Delete N selected." Avoids opening each
 * vlog one at a time when you just want a category of cruft gone.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { deleteObject, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  let body: { ids?: unknown }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : []
  if (ids.length === 0) return NextResponse.json({ error: 'no ids provided' }, { status: 400 })
  if (ids.length > 500) return NextResponse.json({ error: 'max 500 ids per request' }, { status: 400 })

  const db = getDb(env)

  // Fetch all the keys in one query so we know what to delete from R2.
  const placeholders = ids.map(() => '?').join(',')
  const rows = await db.prepare(
    `SELECT id, r2_key, transcoded_r2_key, thumbnail_r2_key
       FROM vlogs
      WHERE operator_id = ? AND deleted_at IS NULL
        AND id IN (${placeholders})`,
  ).bind(operator.id, ...ids).all<{
    id: string
    r2_key: string | null
    transcoded_r2_key: string | null
    thumbnail_r2_key: string | null
  }>()
  const owned = rows.results ?? []

  // Best-effort R2 deletes for each vlog. Failures recorded but don't
  // block the DB soft-delete (orphan R2 bytes can be cleaned later).
  let deletedCount = 0
  const r2Errors: Record<string, string[]> = {}
  for (const r of owned) {
    const errs: string[] = []
    for (const key of [r.r2_key, r.transcoded_r2_key, r.thumbnail_r2_key]) {
      if (!key) continue
      try { await deleteObject(env, key) }
      catch (e: any) { errs.push(`${key}: ${e?.message || String(e)}`) }
    }
    if (errs.length) r2Errors[r.id] = errs
  }

  // Single batched soft-delete for everything the operator owns from
  // the requested set.
  if (owned.length > 0) {
    const idPlaceholders = owned.map(() => '?').join(',')
    const res = await db.prepare(
      `UPDATE vlogs
          SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE operator_id = ?
          AND id IN (${idPlaceholders})`,
    ).bind(operator.id, ...owned.map(r => r.id)).run()
    deletedCount = (res.meta?.changes as number | undefined) ?? owned.length
  }

  return NextResponse.json({
    ok: true,
    requested: ids.length,
    deleted: deletedCount,
    skipped: ids.length - owned.length,
    r2_errors: Object.keys(r2Errors).length ? r2Errors : undefined,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
