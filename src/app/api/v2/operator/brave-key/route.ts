/**
 * Operator's Brave Search API key. Stored on the operator row, never
 * echoed back in plaintext.
 *
 *   GET    → { has_key: boolean }
 *   POST { key } → store the key (length sanity-checked, trimmed)
 *   DELETE → clear the key
 *
 * Used by /api/v2/topics/[id]/research when mode includes auto-search.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const row = await findOne<{ brave_search_api_key: string | null }>(
    getDb(env), `SELECT brave_search_api_key FROM operator WHERE id = ?`, operator.id,
  )
  return NextResponse.json({ has_key: !!row?.brave_search_api_key }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const body = await req.json().catch(() => ({})) as { key?: string }
  const key = (body.key ?? '').trim()
  if (key.length < 10) return NextResponse.json({ error: 'key too short (suspect input)' }, { status: 400 })
  if (key.length > 200) return NextResponse.json({ error: 'key suspiciously long' }, { status: 400 })
  await run(
    getDb(env),
    `UPDATE operator SET brave_search_api_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    key, operator.id,
  )
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  await run(
    getDb(env),
    `UPDATE operator SET brave_search_api_key = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    operator.id,
  )
  return NextResponse.json({ ok: true })
}
