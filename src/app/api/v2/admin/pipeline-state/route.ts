/**
 * GET /api/v2/admin/pipeline-state
 *
 * Read-only diagnostic. Returns aggregate counts of vlogs by transcript /
 * extraction / pipeline_status state. ZERO dispatch, ZERO LLM calls, ZERO
 * container starts — costs nothing to run. Used by the bulk reprocess
 * modal to show the operator what's there before committing money.
 *
 * Response shape:
 *   {
 *     total: number,
 *     by_status: {
 *       complete_with_data: number,    // pipeline_status='complete' AND active extraction with items
 *       complete_no_data: number,      // pipeline_status='complete' BUT no items (silent-empty bug victims)
 *       transcribed_only: number,      // transcript exists, no extraction
 *       untranscribed: number,         // no transcript yet — needs full pipeline
 *       stuck_in_flight: number,       // pipeline_status in (transcoding/transcribing/extracting) for > 5 min
 *       archived: number,              // pipeline_status='archived' (operator opt-in processing)
 *       failed: number,                // pipeline_status='failed'
 *     },
 *     stuck_examples: [{ id, status, stuck_minutes }, ...]   // first 5
 *     estimated_costs: {
 *       extract_only_per_vlog_usd: 0.02,
 *       full_pipeline_per_vlog_usd: 0.10,
 *       to_complete_corpus_usd: number,
 *     }
 *   }
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

const STUCK_MIN_MINUTES = 5
const IN_FLIGHT_STATUSES = ['transcoding', 'transcribing', 'extracting', 'uploaded']

// Rough per-vlog costs. Numbers mirror the costs documented in src/lib/llm.ts
// and the FFmpeg container billing assumption (cold-start + ~60s compute).
const COST_EXTRACT_ONLY = 0.02
const COST_FULL_PIPELINE = 0.10

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const db = getDb(env)

  try {
    // One big SELECT counts everything in one round-trip. CASE expressions
    // map each vlog row into exactly one bucket. Reuses pipeline_status +
    // transcript_text + the existence of an is_active=1 extraction_runs row.
    const inFlightSet = IN_FLIGHT_STATUSES.map(s => `'${s}'`).join(',')
    const rows = await findMany<{
      bucket: string
      n: number
    }>(
      db,
      // B-roll classification: a vlog is b-roll when it completed
      // successfully but has either no transcript or very short
      // (< 200 chars) transcript content AND zero extracted items.
      // These are silent / dialogue-less recordings — still valid
      // footage, just nothing to extract. They shouldn't visually
      // group with "failed" or even "complete + no data" (which
      // implies the LLM tried and rejected the content).
      `WITH classified AS (
         SELECT v.id,
                CASE
                  WHEN v.pipeline_status IN (${inFlightSet})
                       AND v.updated_at < datetime('now', '-${STUCK_MIN_MINUTES} minutes')
                    THEN 'stuck_in_flight'
                  WHEN v.pipeline_status IN (${inFlightSet})
                    THEN 'in_flight_recent'
                  WHEN v.pipeline_status = 'complete'
                       AND EXISTS (
                         SELECT 1 FROM extraction_runs r
                          WHERE r.vlog_id = v.id AND r.is_active = 1
                            AND COALESCE(r.total_items, 0) > 0
                       )
                    THEN 'complete_with_data'
                  WHEN v.pipeline_status = 'complete'
                       AND LENGTH(COALESCE(v.transcript_text, '')) < 200
                       AND EXISTS (
                         SELECT 1 FROM extraction_runs r
                          WHERE r.vlog_id = v.id AND r.is_active = 1
                            AND COALESCE(r.total_items, 0) = 0
                       )
                    THEN 'b_roll'
                  WHEN v.pipeline_status = 'complete'
                    THEN 'complete_no_data'
                  WHEN v.pipeline_status = 'failed'
                    THEN 'failed'
                  WHEN v.pipeline_status = 'archived'
                       AND LENGTH(COALESCE(v.transcript_text, '')) >= 20
                    THEN 'transcribed_only'
                  WHEN v.pipeline_status = 'archived'
                    THEN 'archived'
                  WHEN LENGTH(COALESCE(v.transcript_text, '')) >= 20
                    THEN 'transcribed_only'
                  ELSE 'untranscribed'
                END AS bucket
           FROM vlogs v
          WHERE v.operator_id = ? AND v.deleted_at IS NULL
       )
       SELECT bucket, COUNT(*) AS n FROM classified GROUP BY bucket`,
      operator.id,
    )

    const by_status: Record<string, number> = {
      complete_with_data: 0,
      complete_no_data: 0,
      b_roll: 0,
      transcribed_only: 0,
      untranscribed: 0,
      stuck_in_flight: 0,
      in_flight_recent: 0,
      archived: 0,
      failed: 0,
    }
    let total = 0
    for (const row of rows) {
      by_status[row.bucket] = row.n
      total += row.n
    }

    // Failure breakdown: pull the latest failed_terminal pipeline_event
    // per failed vlog and classify by substring match. Lets the operator
    // see why things failed instead of a single "Failed: 35" number.
    const FAILURE_CATEGORIES: Array<{ id: string; match: RegExp; label: string }> = [
      { id: 'short_transcript', match: /transcript_text missing or too short|transcript_too_short/i, label: 'Transcript too short' },
      { id: 'whisper_timeout', match: /whisper.*timed?\s*out|workers.*timeout|exceeded the allowed/i, label: 'Whisper timeout' },
      { id: 'whisper_empty', match: /whisper returned empty/i, label: 'Whisper returned empty' },
      { id: 'ffmpeg_503', match: /ffmpeg.*503|container failed to start|durable object is overloaded/i, label: 'FFmpeg container failure' },
      { id: 'llm_degraded', match: /suspiciously short|JSON but lacks expected keys|both providers failed/i, label: 'LLM degraded response' },
      { id: 'restart_limit', match: /auto-restart limit reached/i, label: 'Stuck → healer gave up' },
    ]
    const failure_breakdown: Record<string, number> = {}
    try {
      const failedEvents = await findMany<{ vlog_id: string; error_full_text: string | null }>(
        db,
        `WITH latest AS (
           SELECT vlog_id, MAX(started_at) AS last_failed_at
             FROM pipeline_events
            WHERE operator_id = ? AND status IN ('failed', 'failed_terminal')
            GROUP BY vlog_id
         )
         SELECT pe.vlog_id, pe.error_full_text
           FROM pipeline_events pe
           JOIN latest l ON l.vlog_id = pe.vlog_id AND l.last_failed_at = pe.started_at
          WHERE pe.operator_id = ?
            AND pe.vlog_id IN (
              SELECT id FROM vlogs WHERE operator_id = ? AND pipeline_status = 'failed' AND deleted_at IS NULL
            )`,
        operator.id, operator.id, operator.id,
      )
      for (const ev of failedEvents) {
        const text = ev.error_full_text || ''
        let matched = false
        for (const cat of FAILURE_CATEGORIES) {
          if (cat.match.test(text)) {
            failure_breakdown[cat.id] = (failure_breakdown[cat.id] ?? 0) + 1
            matched = true
            break
          }
        }
        if (!matched) {
          failure_breakdown.other = (failure_breakdown.other ?? 0) + 1
        }
      }
    } catch (err: any) {
      console.warn('[pipeline-state] failure_breakdown failed:', err?.message || err)
    }

    // First few stuck examples so the operator can spot-check what they are.
    const stuck_examples = await findMany<{ id: string; status: string; stuck_minutes: number }>(
      db,
      `SELECT id, pipeline_status AS status,
              CAST((julianday('now') - julianday(updated_at)) * 24 * 60 AS INTEGER) AS stuck_minutes
         FROM vlogs
        WHERE operator_id = ? AND deleted_at IS NULL
          AND pipeline_status IN (${inFlightSet})
          AND updated_at < datetime('now', '-${STUCK_MIN_MINUTES} minutes')
        ORDER BY updated_at ASC
        LIMIT 5`,
      operator.id,
    )

    // Cost estimate: untranscribed + complete_no_data + transcribed_only +
    // failed + stuck would all need work. Untranscribed/archived/stuck need
    // full pipeline; transcribed_only + complete_no_data need extract only.
    const needsFullPipeline =
      (by_status.untranscribed ?? 0) +
      (by_status.archived ?? 0) +
      (by_status.stuck_in_flight ?? 0) +
      (by_status.failed ?? 0)
    const needsExtractOnly =
      (by_status.transcribed_only ?? 0) +
      (by_status.complete_no_data ?? 0)
    const to_complete_corpus_usd =
      needsFullPipeline * COST_FULL_PIPELINE +
      needsExtractOnly * COST_EXTRACT_ONLY

    return NextResponse.json({
      total,
      by_status,
      failure_breakdown,
      stuck_examples,
      counts_for_run: {
        needs_full_pipeline: needsFullPipeline,
        needs_extract_only: needsExtractOnly,
      },
      estimated_costs: {
        extract_only_per_vlog_usd: COST_EXTRACT_ONLY,
        full_pipeline_per_vlog_usd: COST_FULL_PIPELINE,
        to_complete_corpus_usd: Math.round(to_complete_corpus_usd * 100) / 100,
      },
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'pipeline-state failed', details: err?.message || String(err) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
