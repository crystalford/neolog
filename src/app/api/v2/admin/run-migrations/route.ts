/**
 * POST /api/v2/admin/run-migrations
 *
 * Manual force-run of the D1 migration runner. In normal operation every
 * /api/v2/* route already calls `ensureMigrationsOnce` via getDb() on the
 * first request per Worker isolate, so this endpoint exists only as an
 * operator safety net (when you want to confirm what migrations applied,
 * or force a re-check from the UI).
 *
 * Returns the full per-statement result so the operator can see which
 * applied this call, which were already recorded, and which fell back to
 * "already present" (e.g. column existed before bookkeeping started).
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { runMigrations } from '@/lib/migration-runner'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  try {
    await requireOperator(req, env)
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }

  const results = await runMigrations(getDb(env))
  const applied = results.filter(r => r.status === 'applied').length
  const skipped = results.filter(r => r.status === 'skipped_already_recorded' || r.status === 'skipped_already_present').length
  const failed = results.filter(r => r.status === 'failed').length

  return NextResponse.json({
    ok: failed === 0,
    summary: { applied, skipped, failed, total: results.length },
    results,
  })
}
