/**
 * POST /api/v2/admin/reprocess-vlogs
 *
 * Bulk re-dispatch the post-upload pipeline. Designed to be SAFE to run
 * across the operator's whole corpus — multiple safety nets stacked so
 * a 150-vlog backfill doesn't pile up rate limits, double-dispatch, or
 * hit edge function timeouts:
 *
 *   1. The endpoint is "thin" — it dispatches only what the caller hands
 *      it (max 50 ids per call) and returns. The client owns the loop,
 *      the pause between chunks, and any retry. No long-running server
 *      iteration → no Pages Function CPU timeout.
 *   2. `dry_run: true` returns the resolved id list without dispatching,
 *      so the client can show a count + sample before committing.
 *   3. Already-in-flight vlogs (pipeline_status in transcoding/
 *      transcribing/extracting AND updated_at < 15 min ago) are skipped
 *      with reason='already_running'. Re-clicking the bulk button is a
 *      no-op for those, not a double-kick.
 *   4. Per-vlog resets land in one D1 batch instead of N sequential
 *      UPDATEs, keeping write pressure low.
 *   5. Per-vlog dispatch failures don't poison the others — every result
 *      comes back labeled so the client can show the failure list.
 *
 * Request body:
 *   {
 *     vlog_ids?: string[]           // explicit list (client provides per-chunk)
 *     scope?: 'incomplete' | 'all'  // only used when dry_run + no vlog_ids
 *     mode: 'cheap' | 'premium'
 *     dry_run?: boolean             // resolve list only, don't dispatch
 *     skip_in_flight?: boolean      // default true
 *   }
 *
 * Response (dry-run):
 *   { total: N, ids: [...], skipped_in_flight: M }
 *
 * Response (dispatch):
 *   { dispatched, failed, skipped, results: [{ vlog_id, ok, backend, error?, reason? }] }
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { dispatchPipeline } from '@/lib/dispatch-pipeline'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  PROCESS_UPLOAD?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  PIPELINE?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  HEARTBEAT_TOKEN?: string
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

// Hard caps. The client is responsible for chunking smaller than this;
// these are absolute server-side maxima to protect the edge function.
const MAX_IDS_PER_CHUNK = 50
const MAX_LIST_RESOLVE = 1000

// In-flight grace: if pipeline_status is one of these AND updated_at is
// within this window, treat the vlog as already running and skip.
const IN_FLIGHT_STATUSES = ['transcoding', 'transcribing', 'extracting']
const IN_FLIGHT_WINDOW_MIN = 15

function noStore(body: unknown, init: number | ResponseInit = 200): NextResponse {
  const status = typeof init === 'number' ? init : (init.status ?? 200)
  const headers = typeof init === 'object' && init.headers ? new Headers(init.headers) : new Headers()
  headers.set('Cache-Control', 'no-store')
  headers.set('Content-Type', 'application/json')
  return new NextResponse(JSON.stringify(body), { status, headers }) as NextResponse
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return noStore({ error: 'Unauthenticated' }, 401)
    throw e
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return noStore({ error: 'Invalid JSON body' }, 400)
  }

  const mode: 'cheap' | 'premium' = body?.mode === 'premium' ? 'premium' : 'cheap'
  const scope: 'incomplete' | 'all' = body?.scope === 'all' ? 'all' : 'incomplete'
  const dryRun = body?.dry_run === true
  const skipInFlight = body?.skip_in_flight !== false
  const explicitIds: string[] | undefined = Array.isArray(body?.vlog_ids) ? body.vlog_ids : undefined

  // Bulk MUST go through the pipeline DO. The legacy process-upload
  // Workflow re-enters the FFmpeg /extract-audio path for any vlog
  // without a transcript, and 150 simultaneous container cold-starts
  // produce 503s on every vlog. If PIPELINE isn't bound on the Pages
  // env, fail loud so the operator knows to fix the wiring instead of
  // burning hours on a failed bulk run.
  if (!dryRun && (!env.PIPELINE || !env.HEARTBEAT_TOKEN)) {
    return noStore({
      error: 'Bulk reprocess requires PIPELINE + HEARTBEAT_TOKEN bindings on the Pages env',
      hint: 'Check Cloudflare Pages → Settings → Functions → Service bindings + Secrets. PIPELINE should point to the neolog-pipeline service; HEARTBEAT_TOKEN must match the value set on the neolog-pipeline worker.',
    }, 503)
  }

  // Non-dry-run requires explicit vlog_ids. This forces the client to
  // resolve the list via a dry-run first and own the chunking — keeps the
  // server-side iteration short.
  if (!dryRun && !explicitIds) {
    return noStore(
      { error: 'vlog_ids required (call with dry_run:true first to resolve the list)' },
      400,
    )
  }

  if (explicitIds && explicitIds.length > MAX_IDS_PER_CHUNK) {
    return noStore(
      { error: `chunk too large (max ${MAX_IDS_PER_CHUNK} ids per request)`, received: explicitIds.length },
      400,
    )
  }

  const db = getDb(env)

  // Bulk handles BOTH transcribed and untranscribed vlogs. Per-vlog
  // dispatch picks the right entry point on the pipeline DO:
  //   - Transcribed   → /reextract (jumps straight to LLM extract step;
  //                     skips audio_extract via DO's artifactExists)
  //   - Untranscribed → /start (full pipeline: audio_extract through
  //                     FFmpegGate → transcribe → extract through LlamaGate)
  // Both gates serialize external service calls so 150 vlogs queue at
  // each service's actual capacity instead of bursting it.

  // ── Dry run: resolve the list and return it ──────────────────────────────
  if (dryRun) {
    try {
      let rows: { id: string; has_transcript: number }[] = []
      let inFlightCount = 0

      if (explicitIds) {
        if (explicitIds.length > 0) {
          const placeholders = explicitIds.map(() => '?').join(',')
          const all = await findMany<{ id: string; in_flight: number; has_transcript: number }>(
            db,
            `SELECT id,
                    CASE WHEN pipeline_status IN ('transcoding','transcribing','extracting')
                              AND updated_at > datetime('now', '-${IN_FLIGHT_WINDOW_MIN} minutes')
                         THEN 1 ELSE 0 END AS in_flight,
                    CASE WHEN LENGTH(COALESCE(transcript_text, '')) >= 20
                         THEN 1 ELSE 0 END AS has_transcript
               FROM vlogs
              WHERE operator_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL`,
            operator.id, ...explicitIds,
          )
          rows = all.filter(r => !(skipInFlight && r.in_flight))
            .map(r => ({ id: r.id, has_transcript: r.has_transcript }))
          inFlightCount = all.filter(r => skipInFlight && !!r.in_flight).length
        }
      } else {
        // Scope resolution. No transcript filter — bulk handles BOTH
        // transcribed and untranscribed vlogs by dispatching to the
        // right DO entry point per vlog. ORDER BY id keeps the list
        // stable across the dry-run/dispatch handoff.
        const inFlightWhere = skipInFlight
          ? `AND NOT (v.pipeline_status IN ('transcoding','transcribing','extracting')
                AND v.updated_at > datetime('now', '-${IN_FLIGHT_WINDOW_MIN} minutes'))`
          : ''
        rows = await findMany<{ id: string; has_transcript: number }>(
          db,
          scope === 'all'
            ? `SELECT id,
                      CASE WHEN LENGTH(COALESCE(transcript_text, '')) >= 20
                           THEN 1 ELSE 0 END AS has_transcript
                  FROM vlogs v
                WHERE operator_id = ? AND deleted_at IS NULL
                  ${inFlightWhere}
                ORDER BY id
                LIMIT ${MAX_LIST_RESOLVE}`
            // "Incomplete" includes three failure modes:
            //   1. Pipeline never finished (status != 'complete')
            //   2. No active extraction_runs row at all
            //   3. Active extraction_runs row exists but total_items=0
            //      (silent-empty extraction bug victims)
            : `SELECT v.id AS id,
                      CASE WHEN LENGTH(COALESCE(v.transcript_text, '')) >= 20
                           THEN 1 ELSE 0 END AS has_transcript
                  FROM vlogs v
                  LEFT JOIN extraction_runs r
                    ON r.vlog_id = v.id AND r.is_active = 1
                WHERE v.operator_id = ? AND v.deleted_at IS NULL
                  AND (v.pipeline_status != 'complete'
                       OR r.id IS NULL
                       OR COALESCE(r.total_items, 0) = 0)
                  ${inFlightWhere}
                ORDER BY v.id
                LIMIT ${MAX_LIST_RESOLVE}`,
          operator.id,
        )

        if (skipInFlight) {
          try {
            const cnt = await findMany<{ n: number }>(
              db,
              `SELECT COUNT(*) AS n FROM vlogs
                WHERE operator_id = ? AND deleted_at IS NULL
                  AND pipeline_status IN ('transcoding','transcribing','extracting')
                  AND updated_at > datetime('now', '-${IN_FLIGHT_WINDOW_MIN} minutes')`,
              operator.id,
            )
            inFlightCount = cnt[0]?.n ?? 0
          } catch {}
        }
      }

      const ids = rows.map(r => r.id)
      const transcribed_ids = rows.filter(r => r.has_transcript).map(r => r.id)
      const untranscribed_ids = rows.filter(r => !r.has_transcript).map(r => r.id)

      return noStore({
        total: ids.length,
        ids,
        // Split for cost-aware UI: transcribed → /reextract (~$0.02/vlog),
        // untranscribed → /start (~$0.10/vlog, full pipeline incl. FFmpeg).
        transcribed_count: transcribed_ids.length,
        untranscribed_count: untranscribed_ids.length,
        skipped_in_flight: inFlightCount,
        mode, scope,
      })
    } catch (err: any) {
      return noStore(
        { error: 'Dry run failed', details: err?.message || String(err) },
        500,
      )
    }
  }

  // ── Dispatch: caller-provided list, max MAX_IDS_PER_CHUNK ───────────────
  const ids = explicitIds!
  if (ids.length === 0) {
    return noStore({ dispatched: 0, failed: 0, skipped: 0, results: [] })
  }

  // Authorize: every id must belong to this operator. Also pull
  // pipeline_status + transcript existence so we can skip:
  //   - in-flight vlogs (don't double-dispatch)
  //   - vlogs without transcripts (would force the FFmpeg audio_extract
  //     path; 150 simultaneous container cold-starts produce 503s)
  let owned: { id: string; pipeline_status: string; in_flight: number; has_transcript: number }[] = []
  try {
    const placeholders = ids.map(() => '?').join(',')
    owned = await findMany<{ id: string; pipeline_status: string; in_flight: number; has_transcript: number }>(
      db,
      `SELECT id, pipeline_status,
              CASE WHEN pipeline_status IN ('transcoding','transcribing','extracting')
                        AND updated_at > datetime('now', '-${IN_FLIGHT_WINDOW_MIN} minutes')
                   THEN 1 ELSE 0 END AS in_flight,
              CASE WHEN LENGTH(COALESCE(transcript_text, '')) >= 20
                   THEN 1 ELSE 0 END AS has_transcript
         FROM vlogs
        WHERE operator_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL`,
      operator.id, ...ids,
    )
  } catch (err: any) {
    return noStore(
      { error: 'Failed to authorize vlog list', details: err?.message || String(err) },
      500,
    )
  }

  const ownedSet = new Set(owned.map(r => r.id))
  const ownedMap = new Map(owned.map(r => [r.id, r]))
  const inFlightSet = skipInFlight ? new Set(owned.filter(r => r.in_flight).map(r => r.id)) : new Set<string>()
  // Note: NO transcript filter here. Untranscribed vlogs are still
  // dispatchable — they just route to /start instead of /reextract so
  // the DO runs audio_extract (gated through FFmpegGate) + transcribe
  // before the LLM step.
  const dispatchable = ids.filter(id => ownedSet.has(id) && !inFlightSet.has(id))

  const results: {
    vlog_id: string;
    ok: boolean;
    backend: string;
    error?: string;
    reason?: string;
    entry?: 'start' | 'reextract';
  }[] = []

  // Mark all dispatchables as 'uploaded' in one D1 batch. Reduces write
  // pressure vs the prior per-vlog UPDATE pattern. Each dispatch call
  // below uses reset:false so dispatchPipeline doesn't re-UPDATE.
  if (dispatchable.length > 0) {
    try {
      const stmts = dispatchable.map(id =>
        db.prepare(
          `UPDATE vlogs SET pipeline_status = 'uploaded', pipeline_error = NULL,
             extraction_outcomes = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND operator_id = ?`,
        ).bind(id, operator.id),
      )
      await db.batch(stmts as any)
    } catch (err: any) {
      console.warn(`[reprocess-vlogs] batched reset failed: ${err?.message || err}`)
      // Fall through — per-vlog dispatch will retry the UPDATE individually.
    }
  }

  // Record the skips and the foreign ids so the client sees them.
  for (const id of ids) {
    if (!ownedSet.has(id)) {
      results.push({ vlog_id: id, ok: false, backend: 'none', reason: 'not_found_or_foreign' })
    } else if (inFlightSet.has(id)) {
      results.push({ vlog_id: id, ok: false, backend: 'none', reason: 'already_running' })
    }
  }

  // Concurrency 2 — gentle on dispatch acknowledgements. The actual
  // service load is controlled by FFmpegGate (max 3) + LlamaGate
  // (max 3) downstream, not by this dispatch pacing.
  const CONCURRENCY = 2
  let cursor = 0
  const worker = async () => {
    while (cursor < dispatchable.length) {
      const idx = cursor++
      const vlog_id = dispatchable[idx]
      // Tiny stagger so DO kicks don't fire in lock-step within a chunk.
      if (idx > 0) await new Promise(r => setTimeout(r, 50 + Math.floor(Math.random() * 150)))

      const ownedRow = ownedMap.get(vlog_id)
      const hasTranscript = ownedRow ? !!ownedRow.has_transcript : false
      // Untranscribed → /start (full pipeline through FFmpegGate +
      // Whisper + LlamaGate). Transcribed → /reextract (fast path,
      // skips straight to LLM step).
      const useStart = !hasTranscript
      const entry = useStart ? 'start' : 'reextract'

      try {
        const res = await dispatchPipeline(env, {
          vlog_id, operator_id: operator.id, mode,
          reset: false, // already done above in the batch
          useStart,
        })
        results.push({
          vlog_id, entry,
          ok: res.ok,
          backend: res.backend,
          error: res.error,
        })
      } catch (err: any) {
        results.push({
          vlog_id, entry,
          ok: false,
          backend: 'none',
          error: err?.message || String(err),
        })
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

  const dispatched = results.filter(r => r.ok).length
  const skipped = results.filter(r => !r.ok && r.reason).length
  const failed = results.filter(r => !r.ok && !r.reason).length
  const dispatched_start = results.filter(r => r.ok && r.entry === 'start').length
  const dispatched_reextract = results.filter(r => r.ok && r.entry === 'reextract').length

  return noStore({
    dispatched, failed, skipped, results,
    dispatched_start, dispatched_reextract,
  })
}
