export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
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
  const p = await findOne<{ id: string; name: string; tagline: string | null; blurb: string | null; state: string; themes: string | null }>(
    db, 'SELECT id, name, tagline, blurb, state, themes FROM projects WHERE id = ? AND operator_id = ? AND deleted_at IS NULL',
    params.id, operator.id,
  )
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const characters = await findMany<{ id: string; name: string; role: string | null }>(
    db, 'SELECT id, name, role FROM characters WHERE project_id = ? ORDER BY created_at ASC',
    params.id,
  )
  let themes: string[] = []
  try { themes = JSON.parse(p.themes || '[]') } catch {}
  return NextResponse.json({ project: { ...p, themes, characters } })
}
