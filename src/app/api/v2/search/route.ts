/**
 * GET /api/v2/search?q=... — ask the log a question.
 *
 * Retrieval → reduce → cite (LLM-PIPELINE §2). The model sees a numbered
 * list of real passages and nothing else, and every sentence it returns is
 * checked for a citation against the passages actually sent before the
 * operator sees it. The reasoning is in `src/lib/search.ts`.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { search, findPassages } from '@/lib/search'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  AI: { run: (model: any, args: any) => Promise<any> }
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
  const db = await readyDb(getDb(env), 'search')
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim()
  if (!q) return NextResponse.json({ error: 'q required' }, { status: 400 })

  // `passages=1` skips the model entirely — the passages alone are a
  // complete answer to "show me where I said this", and they are the part
  // that cannot be wrong.
  if (url.searchParams.get('passages') === '1') {
    const passages = await findPassages(db, operator.id, q)
    return NextResponse.json({ question: q, passages }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const result = await search(env, db, operator.id, q)
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
