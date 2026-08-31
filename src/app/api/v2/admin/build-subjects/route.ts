/**
 * POST /api/v2/admin/build-subjects
 *
 * Runs the librarian pass over all of the operator's extracted threads:
 * groups them by meaning, identifies + names the underlying concepts, and
 * writes them as subjects (clusters with subject_source='librarian').
 *
 * Idempotent — each run replaces the prior librarian subjects. Manually
 * created clusters are untouched. Triggered from the Subjects screen
 * ("Rebuild from my vlogs").
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { buildSubjects, type LibrarianEnv } from '@/lib/librarian'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends LibrarianEnv {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
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
    const result = await buildSubjects(getDb(env), operator.id, env)
    // Echo model into a top-level field too — the page reads `model` from
    // the root so the status line surfaces what actually ran.
    return NextResponse.json({ ...result, model: result.model }, {
      status: result.ok ? 200 : 500,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
