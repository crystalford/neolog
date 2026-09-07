/**
 * GET /api/v2/public/glossary — every term and subject with a page of its
 * own, and the sentence each was first said in.
 *
 * `source.html`, the unlisted list. The same rows the log's ideas filter
 * shows; collected rather than authored (`SPEC.md` §3).
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { loadGlossary, lastChanged } from '@/lib/machine-layer'
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
  const db = await readyDb(getDb(env), 'glossary')
  const kindsParam = req.nextUrl.searchParams.get('kinds')
  const [items, changed] = await Promise.all([
    loadGlossary(db, operator.id, {
      kinds: kindsParam ? kindsParam.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    }),
    lastChanged(db, operator.id),
  ])
  return NextResponse.json({ items, last_changed: changed }, { headers: { 'Cache-Control': 'no-store' } })
}
