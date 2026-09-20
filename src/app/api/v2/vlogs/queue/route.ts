/**
 * GET /api/v2/vlogs/queue — how many recordings are waiting, and send a few.
 *
 * ⚠️ 20 Sep. A bulk drop registers its recordings without dispatching them
 * (`POST /api/v2/vlogs` with `queue: true`), so fifty clips do not arrive at
 * the pipeline together — which is what produced the dropped alarms, the
 * full container disk and the R2 races recorded in CLAUDE.md for the
 * September corpus run.
 *
 * Something has to hand them over, and the operator was explicit that it
 * must not be him: *"i don't want to have to manually trigger transcription.
 * that is too much work."* So this route both **reports** the queue and
 * **drains** it, because the uploader is going to be asking for the count
 * anyway and a read that also does the work is one less thing to schedule.
 *
 * Draining is bounded (`QUEUE_CONCURRENCY`) and marks each row before it
 * sends, so calling this on a timer, from two tabs at once, or twice in a
 * second cannot double-dispatch anything.
 *
 * ⚠️ **This only runs while he is on the site.** A drop of fifty left alone
 * with the browser closed stops draining at the cap and waits. The unattended
 * answer is `workers/healer`'s cron, which is off by default and is the
 * operator's call because it is his bill — the same decision CLAUDE.md has
 * recorded since 9 Sep. Settings → *transcribe the untranscribed* also picks
 * up anything left behind.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { drainUploadQueue, queueCounts, QUEUE_CONCURRENCY } from '@/lib/upload-queue'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { DispatchEnv } from '@/lib/dispatch-pipeline'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends DispatchEnv {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function GET(req: NextRequest) {
  const env = getCloudflareContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = await readyDb(getDb(env), 'vlog-queue')
  const url = new URL(req.url)

  // `?peek=1` reports without sending anything — for a caller that wants the
  // number and should not cause work as a side effect.
  const counts = url.searchParams.get('peek')
    ? { dispatched: 0, ...(await queueCounts(db, operator.id)) }
    : await drainUploadQueue(env, db, operator.id)

  return NextResponse.json(
    { ...counts, concurrency: QUEUE_CONCURRENCY },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
