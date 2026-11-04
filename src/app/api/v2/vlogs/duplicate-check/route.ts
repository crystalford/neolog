/**
 * GET /api/v2/vlogs/duplicate-check?filename=X&size=N
 *
 * Cheap pre-flight check — same `(operator_id, filename, file_size_bytes)`
 * heuristic that POST /api/v2/vlogs uses for 409 detection. Lets the
 * client skip the upload+presign cycle for files already in D1.
 *
 * Returns:
 *   { exists: false }
 *   { exists: true, existing_id, existing_status }
 *
 * POST /api/v2/vlogs/duplicate-check   { files: [{ name, size }] }
 *
 * ⚠️ 4 Nov — the same question for a whole folder at once. The operator:
 * *"some of the files I will be uploading have already been uploaded…
 * because some failed I have to just drag the whole folder again as I'm not
 * sure which ones failed."*
 *
 * That is the real workflow, and asking per file does not serve it. The GET
 * is called from inside a file's own upload, which is gated behind
 * `FILE_CONCURRENCY` — so with thirty dropped, the thirtieth is not asked
 * about until twenty-eight ahead of it have finished. He would watch a
 * queue work through files it was going to skip.
 *
 * One call, before anything uploads, so every already-known file says so
 * immediately and only the rest queue. Same heuristic, one implementation.
 *
 * Returns: { known: [ null | { id, status } ] } — one slot per file sent,
 * in the order sent. ⚠️ Aligned by INDEX rather than keyed by name, because
 * a filename can hold almost any byte and a composite key then needs a
 * separator that cannot appear in it. An index cannot be ambiguous, and it
 * handles the same file appearing twice in one drop without thinking about
 * it.
 */
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb, findOne, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function GET(req: NextRequest) {
  const env = getCloudflareContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const { searchParams } = new URL(req.url)
  const filename = searchParams.get('filename')
  const sizeStr = searchParams.get('size')
  if (!filename || !sizeStr) {
    return NextResponse.json({ error: 'filename and size required' }, { status: 400 })
  }
  const size = parseInt(sizeStr, 10)
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: 'size must be a positive integer' }, { status: 400 })
  }

  const db = getDb(env)
  const dup = await findOne<{ id: string; pipeline_status: string }>(
    db,
    `SELECT id, pipeline_status FROM vlogs
       WHERE operator_id = ? AND original_filename = ? AND file_size_bytes = ?
         AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
    operator.id, filename, size,
  )
  if (dup) {
    return NextResponse.json({ exists: true, existing_id: dup.id, existing_status: dup.pipeline_status })
  }
  return NextResponse.json({ exists: false })
}

/** Chunked, because D1 refuses a statement with too many bound parameters. */
const CHUNK = 40

export async function POST(req: NextRequest) {
  const env = getCloudflareContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const body = await req.json().catch(() => null) as
    | { files?: { name?: string; size?: number }[] }
    | null
  const files = (body?.files || [])
    .filter(f => typeof f?.name === 'string' && Number.isFinite(f?.size) && (f.size as number) > 0)
    .slice(0, 1000)
  if (!files.length) return NextResponse.json({ known: {} })

  const byPair = new Map<string, { id: string; status: string }>()

  for (let i = 0; i < files.length; i += CHUNK) {
    const chunk = files.slice(i, i + CHUNK)
    // ⚠️ The same `(original_filename, file_size_bytes)` pair the GET above
    // uses and `POST /api/v2/vlogs` uses for its own 409 — one heuristic in
    // one file, so a re-drop and a registration can never disagree about
    // what counts as the same recording.
    const pairs = chunk.map(() => '(original_filename = ? AND file_size_bytes = ?)').join(' OR ')
    const binds: unknown[] = [operator.id]
    for (const f of chunk) binds.push(f.name, f.size)

    const rows = await findMany<{ id: string; original_filename: string; file_size_bytes: number; pipeline_status: string }>(
      env.DB,
      `SELECT id, original_filename, file_size_bytes, pipeline_status
         FROM vlogs
        WHERE operator_id = ? AND deleted_at IS NULL AND (${pairs})
        ORDER BY created_at ASC`,
      ...binds,
    )
    for (const r of rows) {
      const k = JSON.stringify([r.original_filename, r.file_size_bytes])
      if (!byPair.has(k)) byPair.set(k, { id: r.id, status: r.pipeline_status })
    }
  }

  const known = files.map(f => byPair.get(JSON.stringify([f.name, f.size])) ?? null)
  return NextResponse.json({ known })
}
