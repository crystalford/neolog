/**
 * POST /api/v2/pages/seed — make a page for everything already named.
 *
 * The extraction passes have been naming entities across 320 vlogs for
 * months, and the librarian has been naming subjects. That is an index
 * already; it just had no page to live on. This turns both into pages and
 * attaches the entries each one was mentioned in.
 *
 * Idempotent — every page carries `source_ref`, so a re-run after new
 * extraction adds only what is new. Nothing is invented: a page appears only
 * where a pass already found a name.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { seedPages, recountPages } from '@/lib/pages'
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
  const db = getDb(env)
  const body = await req.json().catch(() => ({})) as { limit?: number; min_mentions?: number }
  const result = await seedPages(db, operator.id, {
    limit: body.limit,
    minMentions: body.min_mentions,
  })
  const recounted = await recountPages(db, operator.id)
  return NextResponse.json({ ...result, recounted }, { headers: { 'Cache-Control': 'no-store' } })
}
