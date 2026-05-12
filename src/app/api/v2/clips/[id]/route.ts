export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const clip = await findOne(
    db,
    `SELECT id, start_time, end_time, headline, quote, why_clippable, status, vlog_id
       FROM clip_candidates WHERE id = ? AND operator_id = ?`,
    params.id, operator.id,
  )
  if (!clip) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ clip })
}
