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
  try {
    return await handle(req)
  } catch (err: any) {
    // Catch-all so we never bubble out to Cloudflare's HTML 502 page —
    // any unhandled exception returns a JSON error the client can render.
    return NextResponse.json(
      {
        error: `Import crashed: ${err?.message || String(err)}`,
        stack: err?.stack ? String(err.stack).slice(0, 800) : null,
      },
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

  const body = await req.json().catch(() => null) as
    | { supabase_url?: string; service_role_key?: string; table_name?: string; key_column?: string; thumbnail_column?: string }
    | null

  if (!body?.supabase_url || !body?.service_role_key) {
    return NextResponse.json({ error: 'supabase_url and service_role_key required' }, { status: 400 })
  }

  const tableName = body.table_name || 'video_uploads'
  const keyCol = body.key_column || 'r2_key'
  const thumbCol = body.thumbnail_column || 'thumbnail_url'

  // ── Probe mode: validate URL/key in a single 1-row fetch and return total ─
  // Used as a pre-flight by the UI so the operator gets a clean reason instead
  // of starting a multi-page loop that fails halfway.
  const probeMode = req.nextUrl.searchParams.get('mode') === 'probe'

  // Validate URL shape. Must be a Supabase project URL, not the dashboard
  // URL (https://supabase.com/dashboard/project/...) which would 404 with HTML.
  let parsedUrl: URL
  try {
    parsedUrl = new URL(body.supabase_url)
  } catch {
    return NextResponse.json(
      { error: `Invalid URL: "${body.supabase_url}". Expected https://xxxxxxxxxxxx.supabase.co` },
      { status: 400 },
    )
  }
  if (!/\.supabase\.(co|in)$/.test(parsedUrl.hostname)) {
    return NextResponse.json(
      {
        error: `URL doesn't look like a Supabase project URL (host: ${parsedUrl.hostname}). ` +
               `Expected something like https://xxxxxxxxxxxx.supabase.co — find it at Supabase Dashboard → Project → Settings → API → "Project URL".`,
      },
      { status: 400 },
    )
  }
  if (parsedUrl.pathname && parsedUrl.pathname !== '/' && parsedUrl.pathname !== '') {
    return NextResponse.json(
      { error: `URL has a path (${parsedUrl.pathname}). Use just the bare project URL: ${parsedUrl.protocol}//${parsedUrl.hostname}` },
      { status: 400 },
    )
  }
  // Validate the key looks like a JWT (three base64url segments separated by dots).
  const keyParts = body.service_role_key.split('.')
  if (keyParts.length !== 3 || keyParts[0].length < 10) {
    return NextResponse.json(
      {
        error: `Key doesn't look like a Supabase service_role JWT (expected 3 dot-separated segments). ` +
               `Find it at Supabase Dashboard → Project → Settings → API → Project API keys → service_role → Reveal.`,
      },
      { status: 400 },
    )
  }

  const baseUrl = body.supabase_url.replace(/\/+$/, '')
  const offset = Math.max(0, Number((body as any).offset ?? 0) | 0)
  const PAGE = 10  // very small — each row can be 100+ KB of base64 JPEG

  // ── Probe: fetch one row + count, return cleanly. No D1 writes. ──────────
  if (probeMode) {
    const probeUrl = `${baseUrl}/rest/v1/${encodeURIComponent(tableName)}?select=${encodeURIComponent(keyCol)}&${encodeURIComponent(thumbCol)}=not.is.null&limit=1`
    const probeCtl = new AbortController()
    const probeTimeout = setTimeout(() => probeCtl.abort(), 10_000)
    try {
      const pres = await fetch(probeUrl, {
        headers: {
          apikey: body.service_role_key,
          Authorization: `Bearer ${body.service_role_key}`,
          Prefer: 'count=exact',
          Range: '0-0',
        },
        signal: probeCtl.signal,
      })
      clearTimeout(probeTimeout)
      if (!pres.ok) {
        const errText = await pres.text().catch(() => '')
        return NextResponse.json({
          ok: false,
          reason: `Supabase responded ${pres.status} — ${errText.slice(0, 300) || pres.statusText || 'no body'}`,
        })
      }
      const ct = pres.headers.get('content-type') || ''
      if (!ct.includes('json')) {
        const sample = (await pres.text().catch(() => '')).slice(0, 200)
        return NextResponse.json({
          ok: false,
          reason: `Non-JSON response (content-type: ${ct}). First chars: ${sample}. Project is likely paused or URL is wrong.`,
        })
      }
      const cr = pres.headers.get('content-range') || ''
      const m = /\/(\d+|\*)$/.exec(cr)
      const total = m && m[1] !== '*' ? Number(m[1]) : null
      return NextResponse.json({ ok: true, total })
    } catch (err: any) {
      clearTimeout(probeTimeout)
      return NextResponse.json({
        ok: false,
        reason: `Connection failed: ${err?.message || String(err)}`,
      })
    }
  }

  // ── Fetch one page from Supabase with explicit timeout ─────────────────
  const url = `${baseUrl}/rest/v1/${encodeURIComponent(tableName)}?select=${encodeURIComponent(keyCol)},${encodeURIComponent(thumbCol)}&${encodeURIComponent(thumbCol)}=not.is.null&order=${encodeURIComponent(keyCol)}.asc`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        apikey: body.service_role_key,
        Authorization: `Bearer ${body.service_role_key}`,
        Range: `${offset}-${offset + PAGE - 1}`,
      },
      signal: controller.signal,
    })
  } catch (err: any) {
    clearTimeout(timeout)
    return NextResponse.json(
      { error: `Supabase fetch failed: ${err?.message || String(err)}` },
      { status: 502 },
    )
  }
  clearTimeout(timeout)

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    return NextResponse.json(
      { error: `Supabase responded ${res.status}: ${errText.slice(0, 400)}` },
      { status: 502 },
    )
  }
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('json')) {
    const sample = (await res.text().catch(() => '')).slice(0, 200)
    return NextResponse.json(
      { error: `Supabase returned non-JSON (content-type: ${contentType}). First 200 chars: ${sample}` },
      { status: 502 },
    )
  }

  // Read Content-Range header to know total count
  const contentRange = res.headers.get('content-range') || ''
  const totalMatch = /\/(\d+|\*)$/.exec(contentRange)
  const total = totalMatch && totalMatch[1] !== '*' ? Number(totalMatch[1]) : null

  let rows: Record<string, unknown>[]
  try {
    rows = await res.json() as Record<string, unknown>[]
  } catch (err: any) {
    return NextResponse.json(
      { error: `Supabase returned malformed JSON: ${err.message}` },
      { status: 502 },
    )
  }
  if (!Array.isArray(rows)) rows = []

  // ── Batch D1 UPDATEs ───────────────────────────────────────────────────
  let imported = 0
  let skippedNoMatch = 0
  let skippedAlreadySet = 0

  const statements: any[] = []
  for (const row of rows) {
    const r2Key = row[keyCol] as string | null
    const thumb = row[thumbCol] as string | null
    if (!r2Key || !thumb) { skippedNoMatch++; continue }
    statements.push(
      env.DB.prepare(
        `UPDATE vlogs
            SET thumbnail_url = ?, updated_at = CURRENT_TIMESTAMP
          WHERE r2_key = ? AND operator_id = ? AND thumbnail_url IS NULL AND deleted_at IS NULL`,
      ).bind(thumb, r2Key, operator.id),
    )
  }
  if (statements.length > 0) {
    const results: any[] = await env.DB.batch(statements)
    for (const r of results) {
      const changes = r?.meta?.changes ?? r?.changes ?? 0
      if (changes > 0) imported++
      else skippedAlreadySet++
    }
  }

  const nextOffset = offset + rows.length
  const done = rows.length < PAGE

  return NextResponse.json({
    ok: true,
    page_rows: rows.length,
    imported,
    skipped_already_set: skippedAlreadySet,
    skipped_no_match: skippedNoMatch,
    offset,
    next_offset: nextOffset,
    total,
    done,
  })
}
