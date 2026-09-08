/**
 * GET /api/v2/bill — what it costs to keep the log, from what is in it.
 *
 * `takeout.html` calls export and the bill "two promises that only mean
 * something if you can check them":
 *
 *   "The log is yours — so the whole thing comes out as ordinary files that
 *    outlive this software. The log is cheap — so what it costs to run is
 *    shown, per month, per thing, before and after."
 *
 * ── What this is, and what it is not ─────────────────────────────────────
 *
 * This is an ESTIMATE computed from what the log holds and Cloudflare's
 * published rates, not a reading of an invoice. There is no billing API
 * wired into this app, and inventing a number that looks like a bill would
 * be worse than a number that says what it is. Every line says which rate it
 * used, so the arithmetic can be checked by hand.
 *
 * Rates are the ones documented in CLAUDE.md and Cloudflare's public pricing
 * as of 7 Sep 2026. They are constants here rather than fetched, so when
 * they move this file is wrong in a visible way rather than silently.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

/** Published rates, named so each line can say which one it used. */
const RATES = {
  r2_storage_per_gb_month: 0.015,   // R2 standard storage
  whisper_per_20min_vlog: 0.005,    // CLAUDE.md, Workers AI Whisper
}

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = await readyDb(getDb(env), 'bill')

  const [files, vlogRows, photoRows, entryRows] = await Promise.all([
    findMany<{ bytes: number }>(
      db,
      `SELECT COALESCE(SUM(bytes), 0) AS bytes FROM log_entries
        WHERE operator_id = ? AND deleted_at IS NULL AND bytes IS NOT NULL`,
      operator.id,
    ),
    findMany<{ n: number; bytes: number; secs: number }>(
      db,
      `SELECT COUNT(*) AS n,
              COALESCE(SUM(file_size_bytes), 0) AS bytes,
              COALESCE(SUM(duration_seconds), 0) AS secs
         FROM vlogs WHERE operator_id = ? AND deleted_at IS NULL`,
      operator.id,
    ),
    findMany<{ n: number; bytes: number }>(
      db,
      `SELECT COUNT(*) AS n, COALESCE(SUM(file_size_bytes), 0) AS bytes
         FROM photos WHERE operator_id = ? AND deleted_at IS NULL`,
      operator.id,
    ),
    findMany<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM log_entries
        WHERE operator_id = ? AND deleted_at IS NULL`,
      operator.id,
    ),
  ])

  const totalBytes = (files[0]?.bytes || 0) + (vlogRows[0]?.bytes || 0) + (photoRows[0]?.bytes || 0)
  const gb = totalBytes / 1e9
  const storagePerMonth = gb * RATES.r2_storage_per_gb_month

  // What it cost to READ the recordings once — a one-off per vlog, not a
  // monthly charge, and labelled as such.
  const vlogCount = vlogRows[0]?.n || 0
  const transcribeOnce = vlogCount * RATES.whisper_per_20min_vlog
  // Reading a recording ONTO the log costs nothing. It used to be the
  // extraction passes at four cents a recording; it is now arithmetic over
  // `transcript_words` with no model in it, so there is no line for it and
  // the absence is the point (`src/lib/read-recording.ts`).

  return NextResponse.json(
    {
      estimate: true,
      note: 'Computed from what the log holds and published rates, not from an invoice.',
      stored: {
        bytes: totalBytes,
        gb: Math.round(gb * 100) / 100,
        recordings: vlogCount,
        photos: photoRows[0]?.n || 0,
        entries: entryRows[0]?.n || 0,
        hours_of_recording: Math.round(((vlogRows[0]?.secs || 0) / 3600) * 10) / 10,
      },
      monthly: [
        {
          what: 'Keeping the files',
          rate: `$${RATES.r2_storage_per_gb_month.toFixed(3)} per GB per month`,
          how: `${Math.round(gb * 100) / 100} GB`,
          usd: Math.round(storagePerMonth * 100) / 100,
        },
      ],
      monthly_total: Math.round(storagePerMonth * 100) / 100,
      one_off: [
        {
          what: 'Transcribing the recordings',
          rate: `$${RATES.whisper_per_20min_vlog} per 20-minute recording`,
          how: `${vlogCount} recordings`,
          usd: Math.round(transcribeOnce * 100) / 100,
        },
        {
          what: 'Reading them onto the log',
          rate: 'nothing — no model is called',
          how: `${vlogCount} recordings, cut at your own pauses`,
          usd: 0,
        },
      ],
      one_off_total: Math.round(transcribeOnce * 100) / 100,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
