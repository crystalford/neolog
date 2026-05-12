/**
 * POST /api/v2/admin/import-supabase-thumbnails
 *
 * One-shot: read thumbnail_url values from the old (paused) Supabase
 * video_uploads table and write them into the new D1 vlogs rows, matched by
 * r2_key. The R2 keys were preserved across the rebuild — that's the join key.
 *
 * Body:
 *   {
 *     supabase_url: "https://xyz.supabase.co",
 *     service_role_key: "eyJ...",  // from Supabase dashboard → Settings → API
 *     table_name?: "video_uploads",
 *     key_column?: "r2_key",
 *     thumbnail_column?: "thumbnail_url"
 *   }
 *
 * Returns counts. Pulls page-by-page via PostgREST. Read-only on Supabase —
 * no writes there. The service_role key is used in-memory for the request,
 * never persisted.
 *
 * Safe to re-run (idempotent): UPDATEs only happen when the D1 vlog has no
 * thumbnail_url yet, preventing accidental overwrites.
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const body = await req.json().catch(() => null) as
    | { supabase_url?: string; service_role_key?: string; table_name?: string; key_column?: string; thumbnail_column?: string }
    | null

  if (!body?.supabase_url || !body?.service_role_key) {
    return NextResponse.json({ error: 'supabase_url and service_role_key required' }, { status: 400 })
  }

  const tableName = body.table_name || 'video_uploads'
  const keyCol = body.key_column || 'r2_key'
  const thumbCol = body.thumbnail_column || 'thumbnail_url'

  const baseUrl = body.supabase_url.replace(/\/+$/, '')

  let imported = 0
  let skippedNoMatch = 0
  let skippedAlreadySet = 0
  let supabaseRowsScanned = 0

  // Paginate via PostgREST Range header
  const PAGE = 200
  let from = 0
  while (true) {
    const url = `${baseUrl}/rest/v1/${encodeURIComponent(tableName)}?select=${encodeURIComponent(keyCol)},${encodeURIComponent(thumbCol)}&${encodeURIComponent(thumbCol)}=not.is.null`
    const res = await fetch(url, {
      headers: {
        apikey: body.service_role_key,
        Authorization: `Bearer ${body.service_role_key}`,
        Range: `${from}-${from + PAGE - 1}`,
        Prefer: 'count=exact',
      },
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return NextResponse.json(
        { error: `Supabase responded ${res.status}: ${errText.slice(0, 400)}` },
        { status: 502 },
      )
    }
    const rows = await res.json() as Record<string, unknown>[]
    if (!Array.isArray(rows) || rows.length === 0) break
    supabaseRowsScanned += rows.length

    for (const row of rows) {
      const r2Key = row[keyCol] as string | null
      const thumb = row[thumbCol] as string | null
      if (!r2Key || !thumb) { skippedNoMatch++; continue }

      // UPDATE only if the D1 vlog row exists for this operator AND its
      // thumbnail_url is null. The WHERE clause makes this idempotent.
      const result: any = await env.DB.prepare(
        `UPDATE vlogs
            SET thumbnail_url = ?, updated_at = CURRENT_TIMESTAMP
          WHERE r2_key = ? AND operator_id = ? AND thumbnail_url IS NULL AND deleted_at IS NULL`,
      ).bind(thumb, r2Key, operator.id).run()

      const changes = result?.meta?.changes ?? result?.changes ?? 0
      if (changes > 0) imported++
      else skippedAlreadySet++
    }

    if (rows.length < PAGE) break
    from += PAGE
  }

  return NextResponse.json({
    ok: true,
    supabase_rows_scanned: supabaseRowsScanned,
    imported,
    skipped_already_set_or_no_d1_match: skippedAlreadySet,
    skipped_no_match: skippedNoMatch,
  })
}
