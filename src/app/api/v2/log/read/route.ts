/**
 * GET /api/v2/log/read — how much of the corpus is transcribed.
 *
 * ⚠️ 20 Sep — this route used to also POST a page of recordings through
 * `readRecording()`, cutting each transcript into several standalone "said"
 * entries automatically. That was removed: the operator never asked the log
 * to carve his own speech into separate posts on his behalf (SPEC §0 rule 3,
 * rule 7) — recording a vlog is one logged act, and it already produced its
 * one entry at intake ("Recorded a video."). The full transcript still lives
 * on the vlog's own page for him to read and scrub; nothing from it becomes
 * a separate post unless he deliberately writes one.
 *
 * What's left is read-only: two honest counts for the Settings "transcribe
 * the untranscribed" panel, which is unrelated and stays — populating
 * `transcript_words` for on-page reading and fixing is still useful; turning
 * it into entries the operator didn't write is what went.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb, findOne } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
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
  const db = await readyDb(getDb(env), 'read')
  const r = await findOne<{ recordings: number; transcribed: number }>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM vlogs WHERE operator_id = ?1 AND deleted_at IS NULL) AS recordings,
       (SELECT COUNT(DISTINCT vlog_id) FROM transcript_words WHERE operator_id = ?1) AS transcribed`,
    operator.id,
  )
  return NextResponse.json(r || { recordings: 0, transcribed: 0 }, { headers: { 'Cache-Control': 'no-store' } })
}
