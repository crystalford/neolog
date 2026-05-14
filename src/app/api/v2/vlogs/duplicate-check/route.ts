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
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
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
