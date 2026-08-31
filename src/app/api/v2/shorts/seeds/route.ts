/**
 * GET  /api/v2/shorts/seeds        → cached spark seeds for the composer
 * POST /api/v2/shorts/seeds        → rebuild seeds (manual refresh)
 *
 * Spark seeds are 5-8 sharp short-form concept hooks the operator could
 * bang out right now, drawn from their profile + recent subjects. Cached
 * on operator.spark_seeds_json. Auto-refreshed by the librarian when
 * Subjects rebuild.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { loadSparkSeeds, buildSparkSeeds } from '@/lib/spark-seeds'
import type { D1Database, Ai } from '@cloudflare/workers-types'

interface Env { DB: D1Database; AI: Ai; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const out = await loadSparkSeeds(getDb(env), operator.id)
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  try {
    const out = await buildSparkSeeds(getDb(env), operator.id, env as any)
    return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 })
  }
}
