/**
 * GET   /api/v2/month/[ym]  — the month: entries, coverage, the paragraph.
 * POST  /api/v2/month/[ym]  — (re)write the paragraph from the entries.
 * PATCH /api/v2/month/[ym]  — the operator rewriting it himself.
 *
 * `ym` is YYYY-MM. The paragraph's rules are enforced in `src/lib/month.ts`:
 * every sentence cites entries from this month, and nothing outside the
 * month is ever shown to the model.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { loadMonth, buildMonthSummary, setMonthSummary, isValidYm } from '@/lib/month'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  AI: { run: (m: any, a: any) => Promise<any> }
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

async function op(req: NextRequest, env: Env) {
  try { return { operator: await requireOperator(req, env), error: null as null } }
  catch (e) {
    if (e instanceof UnauthenticatedError) {
      return { operator: null, error: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) }
    }
    throw e
  }
}

export async function GET(req: NextRequest, { params }: { params: { ym: string } }) {
  const env = getRequestContext().env as unknown as Env
  const { operator, error } = await op(req, env)
  if (error) return error
  if (!isValidYm(params.ym)) return NextResponse.json({ error: 'ym must be YYYY-MM' }, { status: 400 })
  return NextResponse.json(
    await loadMonth(await readyDb(getDb(env), 'month'), operator!.id, params.ym),
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(req: NextRequest, { params }: { params: { ym: string } }) {
  const env = getRequestContext().env as unknown as Env
  const { operator, error } = await op(req, env)
  if (error) return error
  if (!isValidYm(params.ym)) return NextResponse.json({ error: 'ym must be YYYY-MM' }, { status: 400 })
  return NextResponse.json(
    await buildMonthSummary(env, await readyDb(getDb(env), 'month'), operator!.id, params.ym),
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function PATCH(req: NextRequest, { params }: { params: { ym: string } }) {
  const env = getRequestContext().env as unknown as Env
  const { operator, error } = await op(req, env)
  if (error) return error
  if (!isValidYm(params.ym)) return NextResponse.json({ error: 'ym must be YYYY-MM' }, { status: 400 })
  const body = await req.json().catch(() => ({})) as { summary?: string }
  if (typeof body.summary !== 'string') {
    return NextResponse.json({ error: 'summary required' }, { status: 400 })
  }
  await setMonthSummary(await readyDb(getDb(env), 'month'), operator!.id, params.ym, body.summary)
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
